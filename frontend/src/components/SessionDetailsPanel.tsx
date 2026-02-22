import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiBaseUrl } from '../api/http';
import type {
  SessionSignalHistogramBin,
  SessionSignalSeriesItem,
  SessionStats
} from '../api/types';
import {
  useDeleteSession,
  useSessionById,
  useSessionSignalHistogram,
  useSessionSignalSeries,
  useSessionStats,
  useUpdateSession
} from '../query/sessions';

type SessionDetailsPanelProps = {
  sessionId: string;
  onFitMapToSession: (sessionId: string, bbox: SessionStats['bbox']) => void | Promise<void>;
};

const hasQueryApiKey = Boolean((import.meta.env.VITE_QUERY_API_KEY ?? '').trim());

export default function SessionDetailsPanel({ sessionId, onFitMapToSession }: SessionDetailsPanelProps) {
  const [nameDraft, setNameDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [signalMetric, setSignalMetric] = useState<'rssi' | 'snr'>('rssi');

  const sessionQuery = useSessionById(sessionId, { enabled: Boolean(sessionId) });
  const statsQuery = useSessionStats(sessionId, { enabled: Boolean(sessionId) });
  const signalSeriesQuery = useSessionSignalSeries(sessionId, signalMetric, {
    enabled: Boolean(sessionId)
  });
  const signalHistogramQuery = useSessionSignalHistogram(sessionId, signalMetric, {
    enabled: Boolean(sessionId)
  });
  const updateSessionMutation = useUpdateSession();
  const deleteSessionMutation = useDeleteSession();

  const session = sessionQuery.data ?? null;
  const stats = statsQuery.data ?? null;

  useEffect(() => {
    if (!session) {
      return;
    }
    setNameDraft(session.name ?? '');
    setNotesDraft(session.notes ?? '');
    setMetadataError(null);
    setActionError(null);
  }, [session?.id, session?.name, session?.notes]);

  const nameDirty = (session?.name ?? '') !== nameDraft;
  const notesDirty = (session?.notes ?? '') !== notesDraft;
  const metadataDirty = nameDirty || notesDirty;
  const measurementCount = stats?.pointCount ?? session?.measurementCount ?? null;
  const distanceKm = stats?.distanceMeters !== null && stats?.distanceMeters !== undefined
    ? stats.distanceMeters / 1000
    : null;
  const signalItems = signalSeriesQuery.data?.items ?? [];
  const signalBins = signalHistogramQuery.data?.bins ?? [];
  const durationMs = useMemo(() => {
    const startIso = stats?.minCapturedAt ?? session?.startedAt ?? null;
    const rawEndIso = stats?.maxCapturedAt ?? session?.endedAt ?? null;
    const endIso = rawEndIso ?? (session && !session.endedAt ? new Date().toISOString() : null);
    if (!startIso || !endIso) {
      return null;
    }
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      return null;
    }
    return endMs - startMs;
  }, [stats?.minCapturedAt, stats?.maxCapturedAt, session?.startedAt, session?.endedAt, session?.id]);

  const sessionLabel = session?.name?.trim() || `Session ${sessionId.slice(0, 8)}`;

  const handleSaveMetadata = () => {
    if (!session || !hasQueryApiKey || updateSessionMutation.isPending || !metadataDirty) {
      return;
    }
    setMetadataError(null);
    updateSessionMutation.mutate(
      {
        id: session.id,
        deviceId: session.deviceId,
        input: {
          name: nameDraft.trim(),
          notes: notesDraft.trim()
        }
      },
      {
        onError: (error) => {
          const status = getErrorStatus(error);
          setMetadataError(
            status === 401 || status === 403
              ? 'Editing session details requires QUERY key'
              : 'Could not save session details'
          );
        }
      }
    );
  };

  const handleArchiveToggle = () => {
    if (!session || !hasQueryApiKey || updateSessionMutation.isPending) {
      return;
    }
    setActionError(null);
    updateSessionMutation.mutate(
      {
        id: session.id,
        deviceId: session.deviceId,
        input: { isArchived: !session.isArchived }
      },
      {
        onError: (error) => {
          const status = getErrorStatus(error);
          setActionError(
            status === 401 || status === 403
              ? 'Session actions require QUERY key'
              : 'Could not update archive state'
          );
        }
      }
    );
  };

  const handleDelete = () => {
    if (!session || !hasQueryApiKey || deleteConfirmText.trim() !== 'DELETE') {
      return;
    }
    setActionError(null);
    deleteSessionMutation.mutate(
      { id: session.id, deviceId: session.deviceId },
      {
        onSuccess: () => {
          setDeleteModalOpen(false);
          setDeleteConfirmText('');
        },
        onError: (error) => {
          const status = getErrorStatus(error);
          setActionError(
            status === 401 || status === 403
              ? 'Session actions require QUERY key'
              : 'Could not delete session'
          );
        }
      }
    );
  };

  const handleArchiveFromModal = () => {
    if (!session || !hasQueryApiKey || updateSessionMutation.isPending) {
      return;
    }
    if (session.isArchived) {
      setDeleteModalOpen(false);
      setDeleteConfirmText('');
      return;
    }
    setActionError(null);
    updateSessionMutation.mutate(
      {
        id: session.id,
        deviceId: session.deviceId,
        input: { isArchived: true }
      },
      {
        onSuccess: () => {
          setDeleteModalOpen(false);
          setDeleteConfirmText('');
        },
        onError: (error) => {
          const status = getErrorStatus(error);
          setActionError(
            status === 401 || status === 403
              ? 'Session actions require QUERY key'
              : 'Could not archive session'
          );
        }
      }
    );
  };

  const handleExportGeoJson = async () => {
    setExportError(null);
    setIsExporting(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const url = `${apiBaseUrl}/api/export/session/${sessionId}.geojson`;
      const queryKey = import.meta.env.VITE_QUERY_API_KEY ?? '';
      const headers = queryKey ? { 'X-API-Key': queryKey } : undefined;
      const response = await fetch(url, { headers });
      if (response.status === 401 || response.status === 403) {
        setExportError('Export requires QUERY key');
        return;
      }
      if (!response.ok) {
        throw new Error(`Export failed (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `session-${sessionId}.geojson`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setExportError('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="session-details-panel" aria-label="Session details">
      <div className="session-details-panel__header">
        <h4>Session details</h4>
        {session?.isArchived ? <span className="session-details-panel__badge">Archived</span> : null}
      </div>

      {sessionQuery.isLoading ? (
        <div className="session-details-panel__empty">Loading session details...</div>
      ) : null}
      {sessionQuery.error ? (
        <div className="session-details-panel__error">Session details unavailable.</div>
      ) : null}

      {session ? (
        <>
          <div className="session-details-panel__row">
            <span>Name</span>
            {hasQueryApiKey ? (
              <input
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                disabled={updateSessionMutation.isPending}
                aria-label="Session name"
              />
            ) : (
              <strong>{sessionLabel}</strong>
            )}
          </div>
          <div className="session-details-panel__row session-details-panel__row--notes">
            <span>Notes</span>
            {hasQueryApiKey ? (
              <textarea
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                rows={3}
                disabled={updateSessionMutation.isPending}
                aria-label="Session notes"
              />
            ) : (
              <strong>{session.notes?.trim() || '—'}</strong>
            )}
          </div>
          {hasQueryApiKey ? (
            <div className="session-details-panel__actions session-details-panel__actions--meta">
              <button
                type="button"
                className="controls__button controls__button--compact"
                onClick={handleSaveMetadata}
                disabled={!metadataDirty || updateSessionMutation.isPending}
              >
                {updateSessionMutation.isPending ? 'Saving...' : 'Save details'}
              </button>
            </div>
          ) : null}
          <div className="session-details-panel__row">
            <span>Started</span>
            <strong>{formatTimestamp(session.startedAt)}</strong>
          </div>
          <div className="session-details-panel__row">
            <span>Ended</span>
            <strong>{formatTimestamp(session.endedAt)}</strong>
          </div>
          <div className="session-details-panel__row">
            <span>Point count</span>
            <strong>
              {measurementCount !== null && measurementCount !== undefined ? measurementCount : '—'}
            </strong>
          </div>
          <div className="session-details-panel__row">
            <span>Duration</span>
            <strong>{formatDuration(durationMs)}</strong>
          </div>
          <div className="session-details-panel__row">
            <span>Distance</span>
            <strong>{distanceKm !== null ? `${distanceKm.toFixed(2)} km` : '—'}</strong>
          </div>
          <div className="session-details-panel__row">
            <span>Receivers/gateways</span>
            <strong>
              {stats?.receiversCount !== null && stats?.receiversCount !== undefined
                ? stats.receiversCount
                : '—'}
            </strong>
          </div>
          <div className="session-details-panel__section-title">Signal over time</div>
          <div className="session-details-panel__metric-toggle">
            <button
              type="button"
              className={`session-details-panel__metric-button ${
                signalMetric === 'rssi' ? 'is-active' : ''
              }`}
              onClick={() => setSignalMetric('rssi')}
              disabled={signalSeriesQuery.isLoading}
            >
              RSSI
            </button>
            <button
              type="button"
              className={`session-details-panel__metric-button ${
                signalMetric === 'snr' ? 'is-active' : ''
              }`}
              onClick={() => setSignalMetric('snr')}
              disabled={signalSeriesQuery.isLoading}
            >
              SNR
            </button>
          </div>
          {signalSeriesQuery.isLoading ? (
            <div className="session-details-panel__empty">Loading signal data...</div>
          ) : signalSeriesQuery.error ? (
            <div className="session-details-panel__error">Signal data unavailable.</div>
          ) : signalItems.length === 0 ? (
            <div className="session-details-panel__empty">No signal data</div>
          ) : (
            <SignalSeriesChart items={signalItems} metric={signalMetric} />
          )}
          {signalSeriesQuery.data?.sourceUsed ? (
            <div className="session-details-panel__hint">
              Source: {signalSeriesQuery.data.sourceUsed}
            </div>
          ) : null}
          <div className="session-details-panel__section-title">Signal distribution</div>
          {signalHistogramQuery.isLoading ? (
            <div className="session-details-panel__empty">Loading signal distribution...</div>
          ) : signalHistogramQuery.error ? (
            <div className="session-details-panel__error">Signal distribution unavailable.</div>
          ) : signalBins.length === 0 ? (
            <div className="session-details-panel__empty">No signal data</div>
          ) : (
            <SignalHistogramChart bins={signalBins} metric={signalMetric} />
          )}

          <div className="session-details-panel__actions">
            <button
              type="button"
              className="controls__button controls__button--compact"
              onClick={() => void onFitMapToSession(session.id, stats?.bbox ?? null)}
              disabled={sessionQuery.isLoading || statsQuery.isLoading}
            >
              Fit map to session
            </button>
            <button
              type="button"
              className="controls__button controls__button--compact"
              onClick={() => void handleExportGeoJson()}
              disabled={isExporting}
            >
              {isExporting ? 'Exporting…' : 'Export GeoJSON'}
            </button>
            {hasQueryApiKey ? (
              <>
                <button
                  type="button"
                  className="controls__button controls__button--compact"
                  onClick={handleArchiveToggle}
                  disabled={updateSessionMutation.isPending || deleteSessionMutation.isPending}
                >
                  {session.isArchived ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  className="controls__button controls__button--compact session-details-panel__danger-button"
                  onClick={() => {
                    setDeleteModalOpen(true);
                    setDeleteConfirmText('');
                  }}
                  disabled={updateSessionMutation.isPending || deleteSessionMutation.isPending}
                >
                  Delete…
                </button>
              </>
            ) : null}
          </div>
          {statsQuery.error ? (
            <div className="session-details-panel__error">Session stats unavailable.</div>
          ) : null}
          {metadataError ? (
            <div className="session-details-panel__error" role="status">
              {metadataError}
            </div>
          ) : null}
          {actionError ? (
            <div className="session-details-panel__error" role="status">
              {actionError}
            </div>
          ) : null}
          {exportError ? (
            <div className="session-details-panel__error" role="status">
              {exportError}
            </div>
          ) : null}
        </>
      ) : null}

      {deleteModalOpen && session ? (
        <div
          className="sessions-panel__modal-backdrop"
          role="presentation"
          onClick={() => {
            setDeleteModalOpen(false);
            setDeleteConfirmText('');
          }}
        >
          <div
            className="sessions-panel__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-details-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="session-details-delete-title">Delete session?</h4>
            <div className="sessions-panel__modal-session-name">{sessionLabel}</div>
            <div className="sessions-panel__modal-meta">
              Measurements: {measurementCount ?? '—'}
            </div>
            <p>Choose how to proceed:</p>
            <ul className="sessions-panel__modal-list">
              <li>Archive hides session but keeps attachments.</li>
              <li>Delete removes session and DETACHES measurements (keeps data).</li>
            </ul>
            <label className="sessions-panel__modal-confirm">
              <span>Type DELETE to enable delete</span>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="DELETE"
                aria-label="Type DELETE to confirm deleting session"
                disabled={deleteSessionMutation.isPending}
              />
            </label>
            <div className="sessions-panel__modal-actions">
              <button
                type="button"
                className="sessions-panel__modal-cancel"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirmText('');
                }}
                disabled={deleteSessionMutation.isPending || updateSessionMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sessions-panel__modal-archive"
                onClick={handleArchiveFromModal}
                disabled={
                  deleteSessionMutation.isPending ||
                  updateSessionMutation.isPending ||
                  session.isArchived
                }
              >
                {session.isArchived
                  ? 'Already archived'
                  : updateSessionMutation.isPending
                    ? 'Archiving…'
                    : 'Archive session'}
              </button>
              <button
                type="button"
                className="sessions-panel__modal-delete"
                onClick={handleDelete}
                disabled={deleteSessionMutation.isPending || deleteConfirmText.trim() !== 'DELETE'}
              >
                {deleteSessionMutation.isPending
                  ? 'Deleting…'
                  : 'Delete session (detach measurements)'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs)) {
    return '—';
  }
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error && 'status' in error) {
    const status = (error as { status?: number }).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

type SignalSeriesChartProps = {
  items: SessionSignalSeriesItem[];
  metric: 'rssi' | 'snr';
};

type SignalPoint = {
  t: string;
  v: number;
};

function SignalSeriesChart({ items, metric }: SignalSeriesChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  const points = useMemo(() => {
    return items
      .map((item) => {
        const value = typeof item.v === 'number' && Number.isFinite(item.v) ? item.v : null;
        if (value === null || !item.t) {
          return null;
        }
        return { t: item.t, v: value } satisfies SignalPoint;
      })
      .filter((item): item is SignalPoint => item !== null);
  }, [items]);

  const minValue = useMemo(() => {
    if (points.length === 0) {
      return null;
    }
    let min = points[0].v;
    for (const point of points) {
      if (point.v < min) {
        min = point.v;
      }
    }
    return min;
  }, [points]);

  const maxValue = useMemo(() => {
    if (points.length === 0) {
      return null;
    }
    let max = points[0].v;
    for (const point of points) {
      if (point.v > max) {
        max = point.v;
      }
    }
    return max;
  }, [points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0 || minValue === null || maxValue === null) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    const styles = getComputedStyle(canvas);
    const stroke = styles.getPropertyValue('--accent-bg-strong')?.trim() || styles.color || '#4c8bf5';
    const marker = styles.getPropertyValue('--panel-text')?.trim() || stroke;
    const paddingX = 10;
    const paddingY = 8;
    const width = rect.width - paddingX * 2;
    const height = rect.height - paddingY * 2;
    if (width <= 0 || height <= 0) {
      return;
    }

    const rangeMin = minValue;
    const rangeMax = maxValue === minValue ? maxValue + 1 : maxValue;
    const valueRange = rangeMax - rangeMin;
    const pointCount = points.length;
    const pointStep = pointCount > 1 ? width / (pointCount - 1) : 0;

    context.save();
    context.globalAlpha = 0.18;
    context.strokeStyle = stroke;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(paddingX, paddingY + height);
    context.lineTo(paddingX + width, paddingY + height);
    context.stroke();
    context.restore();

    context.strokeStyle = stroke;
    context.lineWidth = 1.6;
    context.beginPath();
    points.forEach((point, index) => {
      const x = paddingX + pointStep * index;
      const y = paddingY + (1 - (point.v - rangeMin) / valueRange) * height;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();

    if (hover && hover.index >= 0 && hover.index < points.length) {
      const hovered = points[hover.index];
      const x = paddingX + pointStep * hover.index;
      const y = paddingY + (1 - (hovered.v - rangeMin) / valueRange) * height;
      context.fillStyle = marker;
      context.beginPath();
      context.arc(x, y, 2.6, 0, Math.PI * 2);
      context.fill();
    }
  }, [hover, maxValue, minValue, points]);

  if (points.length === 0 || minValue === null || maxValue === null) {
    return null;
  }

  const hoveredPoint = hover && hover.index >= 0 && hover.index < points.length ? points[hover.index] : null;

  return (
    <div className="session-signal-chart">
      <canvas
        ref={canvasRef}
        className="session-signal-chart__canvas"
        role="img"
        aria-label={`Session ${metric.toUpperCase()} over time`}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const paddingX = 10;
          const paddingY = 8;
          const chartWidth = rect.width - paddingX * 2;
          const chartHeight = rect.height - paddingY * 2;
          if (
            chartWidth <= 0 ||
            chartHeight <= 0 ||
            points.length === 0 ||
            minValue === null ||
            maxValue === null
          ) {
            setHover(null);
            return;
          }

          const x = Math.min(Math.max(event.clientX - rect.left - paddingX, 0), chartWidth);
          const ratio = chartWidth > 0 ? x / chartWidth : 0;
          const index = points.length > 1 ? Math.round(ratio * (points.length - 1)) : 0;
          const clampedIndex = Math.min(Math.max(index, 0), points.length - 1);
          const valueRange = maxValue === minValue ? 1 : maxValue - minValue;
          const pointValue = points[clampedIndex].v;
          const pointY =
            paddingY + (1 - (pointValue - minValue) / valueRange) * chartHeight;
          const tooltipAnchorY = Math.min(
            rect.height - 6,
            Math.max(40, pointY - 6)
          );
          const tooltipX = paddingX + (points.length > 1 ? (chartWidth / (points.length - 1)) * clampedIndex : 0);
          setHover({ index: clampedIndex, x: tooltipX, y: tooltipAnchorY });
        }}
        onMouseLeave={() => setHover(null)}
      />
      {hoveredPoint ? (
        <div
          className="session-signal-chart__tooltip"
          style={{
            left: `${hover.x}px`,
            top: `${hover.y}px`
          }}
        >
          <span>{formatTimestamp(hoveredPoint.t)}</span>
          <strong>{formatSignalValue(hoveredPoint.v, metric)}</strong>
        </div>
      ) : null}
    </div>
  );
}

type SignalHistogramChartProps = {
  bins: SessionSignalHistogramBin[];
  metric: 'rssi' | 'snr';
};

function SignalHistogramChart({ bins, metric }: SignalHistogramChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  const normalizedBins = useMemo(() => {
    return bins
      .map((bin) => ({
        lo: Number.isFinite(bin.lo) ? bin.lo : null,
        hi: Number.isFinite(bin.hi) ? bin.hi : null,
        count: Number.isFinite(bin.count) ? Math.max(0, bin.count) : null
      }))
      .filter(
        (bin): bin is { lo: number; hi: number; count: number } =>
          bin.lo !== null && bin.hi !== null && bin.count !== null
      );
  }, [bins]);

  const maxCount = useMemo(() => {
    if (normalizedBins.length === 0) {
      return 0;
    }
    let max = normalizedBins[0].count;
    for (const bin of normalizedBins) {
      if (bin.count > max) {
        max = bin.count;
      }
    }
    return max;
  }, [normalizedBins]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || normalizedBins.length === 0) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    const styles = getComputedStyle(canvas);
    const barColor =
      styles.getPropertyValue('--accent-bg-strong')?.trim() || styles.color || '#4c8bf5';
    const barHoverColor =
      styles.getPropertyValue('--panel-text')?.trim() || barColor;

    const paddingX = 10;
    const paddingY = 8;
    const width = rect.width - paddingX * 2;
    const height = rect.height - paddingY * 2;
    if (width <= 0 || height <= 0) {
      return;
    }

    context.save();
    context.globalAlpha = 0.18;
    context.strokeStyle = barColor;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(paddingX, paddingY + height);
    context.lineTo(paddingX + width, paddingY + height);
    context.stroke();
    context.restore();

    const scaleMax = maxCount > 0 ? maxCount : 1;
    const binWidth = width / normalizedBins.length;
    const barGap = Math.min(2, Math.max(0, binWidth * 0.12));
    const barWidth = Math.max(1, binWidth - barGap);

    normalizedBins.forEach((bin, index) => {
      const ratio = bin.count / scaleMax;
      const barHeight = Math.max(1, ratio * height);
      const x = paddingX + index * binWidth + (binWidth - barWidth) / 2;
      const y = paddingY + height - barHeight;

      context.save();
      context.globalAlpha = hover?.index === index ? 0.95 : 0.76;
      context.fillStyle = hover?.index === index ? barHoverColor : barColor;
      context.fillRect(x, y, barWidth, barHeight);
      context.restore();
    });
  }, [hover?.index, maxCount, normalizedBins]);

  if (normalizedBins.length === 0) {
    return null;
  }

  const hoveredBin =
    hover && hover.index >= 0 && hover.index < normalizedBins.length
      ? normalizedBins[hover.index]
      : null;

  return (
    <div className="session-signal-histogram">
      <canvas
        ref={canvasRef}
        className="session-signal-histogram__canvas"
        role="img"
        aria-label={`Session ${metric.toUpperCase()} distribution`}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const paddingX = 10;
          const paddingY = 8;
          const chartWidth = rect.width - paddingX * 2;
          const chartHeight = rect.height - paddingY * 2;
          if (chartWidth <= 0 || chartHeight <= 0 || normalizedBins.length === 0) {
            setHover(null);
            return;
          }

          const x = Math.min(Math.max(event.clientX - rect.left - paddingX, 0), chartWidth);
          const binWidth = chartWidth / normalizedBins.length;
          const index = Math.min(
            normalizedBins.length - 1,
            Math.max(0, Math.floor(binWidth > 0 ? x / binWidth : 0))
          );
          const bin = normalizedBins[index];
          const scaleMax = maxCount > 0 ? maxCount : 1;
          const barHeight = Math.max(1, (bin.count / scaleMax) * chartHeight);
          const barTop = paddingY + chartHeight - barHeight;
          const tooltipY = Math.min(rect.height - 6, Math.max(36, barTop - 4));
          const tooltipX = paddingX + index * binWidth + binWidth / 2;
          setHover({ index, x: tooltipX, y: tooltipY });
        }}
        onMouseLeave={() => setHover(null)}
      />
      {hoveredBin && hover ? (
        <div
          className="session-signal-histogram__tooltip"
          style={{
            left: `${hover.x}px`,
            top: `${hover.y}px`
          }}
        >
          <span>{formatHistogramRange(hoveredBin, metric)}</span>
          <strong>{hoveredBin.count} points</strong>
        </div>
      ) : null}
    </div>
  );
}

function formatHistogramRange(
  bin: { lo: number; hi: number },
  metric: 'rssi' | 'snr'
): string {
  const suffix = metric === 'rssi' ? 'dBm' : 'dB';
  return `${bin.lo.toFixed(1)} to ${bin.hi.toFixed(1)} ${suffix}`;
}

function formatSignalValue(value: number, metric: 'rssi' | 'snr'): string {
  const suffix = metric === 'rssi' ? 'dBm' : 'dB';
  return `${value.toFixed(1)} ${suffix}`;
}
