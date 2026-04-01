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
import MiniLineChart from './charts/MiniLineChart';

type SessionDetailsPanelProps = {
  sessionId: string;
  onFitMapToSession: (sessionId: string, bbox: SessionStats['bbox']) => void | Promise<void>;
};

const hasQueryApiKey = Boolean((import.meta.env.VITE_QUERY_API_KEY ?? '').trim());
const SESSION_DETAILS_EXPANDED_KEY = 'sessionDetailsExpanded';
const SESSION_DETAILS_METRIC_KEY = 'sessionDetailsMetric';

function readStoredSessionDetailsExpanded(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(SESSION_DETAILS_EXPANDED_KEY) === 'true';
}

function readStoredSignalMetric(): 'rssi' | 'snr' {
  if (typeof window === 'undefined') {
    return 'rssi';
  }
  const stored = window.localStorage.getItem(SESSION_DETAILS_METRIC_KEY);
  return stored === 'snr' ? 'snr' : 'rssi';
}

export default function SessionDetailsPanel({ sessionId, onFitMapToSession }: SessionDetailsPanelProps) {
  const [nameDraft, setNameDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [isExpanded, setIsExpanded] = useState<boolean>(() => readStoredSessionDetailsExpanded());
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [signalMetric, setSignalMetric] = useState<'rssi' | 'snr'>(() => readStoredSignalMetric());

  const sessionQuery = useSessionById(sessionId, { enabled: Boolean(sessionId) });
  const statsQuery = useSessionStats(sessionId, { enabled: Boolean(sessionId) });
  const signalSeriesQuery = useSessionSignalSeries(sessionId, signalMetric, {
    enabled: Boolean(sessionId && isExpanded)
  });
  const signalHistogramQuery = useSessionSignalHistogram(sessionId, signalMetric, {
    enabled: Boolean(sessionId && isExpanded)
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

  useEffect(() => {
    setDeleteModalOpen(false);
    setDeleteConfirmText('');
  }, [sessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SESSION_DETAILS_EXPANDED_KEY, isExpanded ? 'true' : 'false');
  }, [isExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SESSION_DETAILS_METRIC_KEY, signalMetric);
  }, [signalMetric]);

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
    <section
      className={`session-details-panel ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
      aria-label="Session details"
    >
      <div className="session-details-panel__header">
        <div className="session-details-panel__header-main">
          <h4>Session details</h4>
          {session ? (
            <span className="session-details-panel__header-session" title={sessionLabel}>
              {sessionLabel}
            </span>
          ) : null}
        </div>
        <div className="session-details-panel__header-actions">
          {session?.isArchived ? <span className="session-details-panel__badge">Archived</span> : null}
          <button
            type="button"
            className="session-details-panel__toggle"
            aria-expanded={isExpanded}
            onClick={() => {
              setIsExpanded((value) => !value);
              setDeleteModalOpen(false);
              setDeleteConfirmText('');
            }}
            disabled={!session}
          >
            {isExpanded ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>

      {sessionQuery.isLoading ? (
        <div className="session-details-panel__empty">Loading session details...</div>
      ) : null}
      {sessionQuery.error ? (
        <div className="session-details-panel__error">Session details unavailable.</div>
      ) : null}

      {session && !isExpanded ? (
        <>
          <div className="session-details-panel__summary">
            <div className="session-details-panel__summary-item">
              <span>Started</span>
              <strong>{formatTimestamp(session.startedAt)}</strong>
            </div>
            <div className="session-details-panel__summary-item">
              <span>Ended</span>
              <strong>{formatTimestamp(session.endedAt)}</strong>
            </div>
            <div className="session-details-panel__summary-item">
              <span>Points</span>
              <strong>
                {measurementCount !== null && measurementCount !== undefined ? measurementCount : '—'}
              </strong>
            </div>
            <div className="session-details-panel__summary-item">
              <span>Duration</span>
              <strong>{formatDuration(durationMs)}</strong>
            </div>
          </div>
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
          </div>
          {statsQuery.error ? (
            <div className="session-details-panel__error">Session stats unavailable.</div>
          ) : null}
          {exportError ? (
            <div className="session-details-panel__error" role="status">
              {exportError}
            </div>
          ) : null}
        </>
      ) : null}

      {session && isExpanded ? (
        <>
          <div className="session-details-panel__grid">
            <div className="session-details-panel__column">
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
              <div className="session-details-panel__row">
                <span>Started</span>
                <strong>{formatTimestamp(session.startedAt)}</strong>
              </div>
              <div className="session-details-panel__row">
                <span>Point count</span>
                <strong>
                  {measurementCount !== null && measurementCount !== undefined ? measurementCount : '—'}
                </strong>
              </div>
            </div>
            <div className="session-details-panel__column">
              <div className="session-details-panel__row">
                <span>Ended</span>
                <strong>{formatTimestamp(session.endedAt)}</strong>
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
            </div>
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

  if (points.length === 0) {
    return null;
  }

  return (
    <MiniLineChart
      className="session-signal-chart"
      data={points}
      getValue={(point) => point.v}
      ariaLabel={`Session ${metric.toUpperCase()} over time`}
      tooltipFormatter={(point) => (
        <>
          <span>{formatTimestamp(point.t)}</span>
          <strong>{formatSignalValue(point.v, metric)}</strong>
        </>
      )}
    />
  );
}

type SignalHistogramChartProps = {
  bins: SessionSignalHistogramBin[];
  metric: 'rssi' | 'snr';
};

const HISTOGRAM_CHART_PADDING_X = 2;
const HISTOGRAM_CHART_PADDING_Y = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
      styles.getPropertyValue('--hist-top-bar')?.trim() || 'rgba(238,218,118,0.98)';
    const topShadowColor =
      styles.getPropertyValue('--hist-top-shadow')?.trim() || 'rgba(96,77,34,0.56)';
    const baseline =
      styles.getPropertyValue('--hist-baseline')?.trim() || 'rgba(196,202,211,0.45)';
    const bandEvenColor =
      styles.getPropertyValue('--hist-band-even')?.trim() || 'rgba(16,22,28,0.78)';
    const bandOddColor =
      styles.getPropertyValue('--hist-band-odd')?.trim() || 'rgba(5,10,14,0.88)';
    const bottomColor =
      styles.getPropertyValue('--hist-bottom-bar')?.trim() || 'rgba(185,191,199,0.78)';
    const bottomShadowColor =
      styles.getPropertyValue('--hist-bottom-shadow')?.trim() || 'rgba(37,44,53,0.7)';
    const hoverTopColor =
      styles.getPropertyValue('--hist-top-hover')?.trim() || styles.getPropertyValue('--panel-text')?.trim() || barColor;
    const hoverBottomColor =
      styles.getPropertyValue('--hist-bottom-hover')?.trim() || bottomColor;

    const paddingX = HISTOGRAM_CHART_PADDING_X;
    const paddingY = HISTOGRAM_CHART_PADDING_Y;
    const width = rect.width - paddingX * 2;
    const height = rect.height - paddingY * 2;
    if (width <= 0 || height <= 0) {
      return;
    }

    const midY = paddingY + height * 0.5;
    const topHeight = height * 0.48;
    const bottomHeight = height * 0.48;

    const bandCount = Math.max(8, Math.round(width / 76));
    const bandWidth = width / bandCount;
    for (let bandIndex = 0; bandIndex < bandCount; bandIndex += 1) {
      const bandX = paddingX + bandIndex * bandWidth;
      context.fillStyle = bandIndex % 2 === 0 ? bandEvenColor : bandOddColor;
      context.fillRect(bandX, paddingY, Math.ceil(bandWidth), height);
    }

    context.strokeStyle = baseline;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(paddingX, midY);
    context.lineTo(paddingX + width, midY);
    context.stroke();

    const scaleMax = maxCount > 0 ? maxCount : 1;
    const binWidth = width / normalizedBins.length;
    const barWidth = clamp(binWidth * 0.64, 2, 15);
    const shadowBarWidth = clamp(barWidth * 0.78, 1, 13);

    const ratios = normalizedBins.map((bin) => bin.count / scaleMax);

    normalizedBins.forEach((bin, index) => {
      const ratio = ratios[index];
      const previous = ratios[Math.max(0, index - 1)] ?? ratio;
      const next = ratios[Math.min(ratios.length - 1, index + 1)] ?? ratio;
      const smoothed = (previous + ratio + next) / 3;

      const xCenter = paddingX + index * binWidth + binWidth / 2;

      const topShadowHeight = clamp(smoothed * topHeight * 0.96, 1.5, topHeight);
      const topFrontHeight = clamp(ratio * topHeight * 0.9, 1.5, topHeight);
      const inverseRatio = clamp(1 - ratio * 0.95, 0.08, 0.98);
      const bottomShadowHeight = clamp(inverseRatio * bottomHeight * 0.96, 1.5, bottomHeight);
      const bottomFrontHeight = clamp(inverseRatio * bottomHeight * 0.66, 1.2, bottomHeight);

      context.fillStyle = topShadowColor;
      context.fillRect(
        xCenter - shadowBarWidth / 2,
        midY - topShadowHeight,
        shadowBarWidth,
        topShadowHeight
      );

      context.fillStyle = hover?.index === index ? hoverTopColor : barColor;
      context.fillRect(
        xCenter - barWidth / 2,
        midY - topFrontHeight,
        barWidth,
        topFrontHeight
      );

      context.fillStyle = bottomShadowColor;
      context.fillRect(
        xCenter - shadowBarWidth / 2,
        midY,
        shadowBarWidth,
        bottomShadowHeight
      );

      context.fillStyle = hover?.index === index ? hoverBottomColor : bottomColor;
      context.fillRect(
        xCenter - barWidth / 2,
        midY,
        barWidth,
        bottomFrontHeight
      );
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
          const paddingX = HISTOGRAM_CHART_PADDING_X;
          const paddingY = HISTOGRAM_CHART_PADDING_Y;
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
          const ratio = bin.count / scaleMax;
          const topHeight = chartHeight * 0.48;
          const midY = paddingY + chartHeight * 0.5;
          const topFrontHeight = clamp(ratio * topHeight * 0.9, 1.5, topHeight);
          const barTop = midY - topFrontHeight;
          const tooltipY = Math.min(rect.height - 8, Math.max(4, barTop));
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
