import { useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '../api/http';
import type { SessionStats } from '../api/types';
import {
  useDeleteSession,
  useSessionById,
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

  const sessionQuery = useSessionById(sessionId, { enabled: Boolean(sessionId) });
  const statsQuery = useSessionStats(sessionId, { enabled: Boolean(sessionId) });
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
