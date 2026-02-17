import {
  IconArchive,
  IconArchiveOff,
  IconCheck,
  IconDotsVertical,
  IconPencil,
  IconTrash,
  IconX
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import {
  useDeleteSession,
  useSessionById,
  useSessions,
  useStartSession,
  useStopSession,
  useUpdateSession
} from '../query/sessions';
import type { Session } from '../api/types';

type SessionsPanelProps = {
  deviceId: string | null;
  selectedSessionId: string | null;
  onSelectSessionId: (sessionId: string | null) => void;
  onStartSession: (sessionId: string) => void;
};

const SHOW_ARCHIVED_KEY = 'sessionsShowArchived';
const hasQueryApiKey = Boolean((import.meta.env.VITE_QUERY_API_KEY ?? '').trim());

function readStoredShowArchived(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(SHOW_ARCHIVED_KEY) === 'true';
}

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function sessionLabel(session: Session): string {
  return session.name?.trim() || `Session ${session.id.slice(0, 8)}`;
}

function activeSessionLabel(session: Session): string {
  return session.name?.trim() || 'Active session';
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error && 'status' in error) {
    const status = (error as { status?: number }).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest('button, input, textarea, select, a, [role="menuitem"]'));
}

export default function SessionsPanel({
  deviceId,
  selectedSessionId,
  onSelectSessionId,
  onStartSession
}: SessionsPanelProps) {
  const [sessionName, setSessionName] = useState('');
  const [showArchived, setShowArchived] = useState<boolean>(() => readStoredShowArchived());
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);
  const [deleteTargetSession, setDeleteTargetSession] = useState<Session | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);

  const { data: sessionsResponse, isLoading, error } = useSessions(deviceId ?? undefined, {
    includeArchived: showArchived
  });
  const sessions = sessionsResponse?.items ?? [];
  const startMutation = useStartSession();
  const stopMutation = useStopSession();
  const updateSessionMutation = useUpdateSession();
  const deleteSessionMutation = useDeleteSession();
  const deleteSessionDetailsQuery = useSessionById(deleteTargetSession?.id ?? null, {
    enabled: Boolean(deleteTargetSession?.id)
  });

  const activeSession = useMemo(
    () => sessions.find((session) => !session.endedAt) ?? null,
    [sessions]
  );
  const pastSessions = useMemo(
    () => sessions.filter((session) => Boolean(session.endedAt)),
    [sessions]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SHOW_ARCHIVED_KEY, showArchived ? 'true' : 'false');
  }, [showArchived]);

  useEffect(() => {
    setEditingSessionId(null);
    setRenameDraft('');
    setRenameError(null);
    setOpenMenuSessionId(null);
    setDeleteTargetSession(null);
    setDeleteConfirmText('');
    setSessionActionError(null);
  }, [deviceId]);

  const handleStart = () => {
    if (!deviceId || startMutation.isPending) {
      return;
    }
    const name = sessionName.trim();
    startMutation.mutate(
      { deviceId, name: name || undefined },
      {
        onSuccess: (created) => {
          setSessionName('');
          onSelectSessionId(created.id);
          onStartSession(created.id);
        }
      }
    );
  };

  const handleStop = () => {
    if (!activeSession || stopMutation.isPending) {
      return;
    }
    stopMutation.mutate({ sessionId: activeSession.id });
  };

  const beginRename = (session: Session) => {
    if (!hasQueryApiKey) {
      return;
    }
    setOpenMenuSessionId(null);
    setEditingSessionId(session.id);
    setRenameDraft(session.name?.trim() ?? '');
    setRenameError(null);
  };

  const cancelRename = () => {
    setEditingSessionId(null);
    setRenameDraft('');
    setRenameError(null);
  };

  const saveRename = (session: Session) => {
    if (!hasQueryApiKey || updateSessionMutation.isPending) {
      return;
    }
    const nextName = renameDraft.trim();
    const currentName = session.name?.trim() ?? '';
    if (nextName === currentName) {
      cancelRename();
      return;
    }

    setRenameError(null);
    updateSessionMutation.mutate(
      {
        id: session.id,
        deviceId: session.deviceId,
        input: { name: nextName }
      },
      {
        onSuccess: () => {
          cancelRename();
        },
        onError: (mutationError) => {
          const status = getErrorStatus(mutationError);
          setRenameError(
            status === 401 || status === 403
              ? 'Renaming sessions requires QUERY key'
              : 'Could not rename session'
          );
        }
      }
    );
  };

  const toggleActionsMenu = (sessionId: string) => {
    setOpenMenuSessionId((current) => (current === sessionId ? null : sessionId));
  };

  const handleArchiveToggle = (session: Session) => {
    if (!hasQueryApiKey || updateSessionMutation.isPending) {
      return;
    }
    setSessionActionError(null);
    setOpenMenuSessionId(null);
    updateSessionMutation.mutate(
      {
        id: session.id,
        deviceId: session.deviceId,
        input: { isArchived: !session.isArchived }
      },
      {
        onSuccess: () => {
          // Selection clearing and user messaging are handled centrally in App state.
        },
        onError: (mutationError) => {
          const status = getErrorStatus(mutationError);
          setSessionActionError(
            status === 401 || status === 403
              ? 'Session actions require QUERY key'
              : 'Could not update session archive state'
          );
        }
      }
    );
  };

  const handleDeleteRequest = (session: Session) => {
    if (!hasQueryApiKey) {
      return;
    }
    setOpenMenuSessionId(null);
    setSessionActionError(null);
    setDeleteTargetSession(session);
    setDeleteConfirmText('');
  };

  const handleDeleteConfirm = () => {
    if (
      !deleteTargetSession ||
      deleteSessionMutation.isPending ||
      deleteConfirmText.trim() !== 'DELETE'
    ) {
      return;
    }
    setSessionActionError(null);
    deleteSessionMutation.mutate(
      {
        id: deleteTargetSession.id,
        deviceId: deleteTargetSession.deviceId
      },
      {
        onSuccess: () => {
          setDeleteTargetSession(null);
          setDeleteConfirmText('');
        },
        onError: (mutationError) => {
          const status = getErrorStatus(mutationError);
          setSessionActionError(
            status === 401 || status === 403
              ? 'Session actions require QUERY key'
              : 'Could not delete session'
          );
        }
      }
    );
  };

  const handleArchiveFromModal = () => {
    if (!deleteTargetSession || updateSessionMutation.isPending) {
      return;
    }
    if (deleteTargetSession.isArchived) {
      setDeleteTargetSession(null);
      setDeleteConfirmText('');
      return;
    }

    setSessionActionError(null);
    updateSessionMutation.mutate(
      {
        id: deleteTargetSession.id,
        deviceId: deleteTargetSession.deviceId,
        input: { isArchived: true }
      },
      {
        onSuccess: () => {
          setDeleteTargetSession(null);
          setDeleteConfirmText('');
        },
        onError: (mutationError) => {
          const status = getErrorStatus(mutationError);
          setSessionActionError(
            status === 401 || status === 403
              ? 'Session actions require QUERY key'
              : 'Could not archive session'
          );
        }
      }
    );
  };

  const renderSessionRow = (session: Session, isActive = false) => {
    const isSelected = selectedSessionId === session.id;
    const isEditing = editingSessionId === session.id;
    const isMenuOpen = openMenuSessionId === session.id;
    const isRowUpdating =
      updateSessionMutation.isPending && updateSessionMutation.variables?.id === session.id;
    const isRowDeleting =
      deleteSessionMutation.isPending && deleteSessionMutation.variables?.id === session.id;
    const disableRowActions = isRowUpdating || isRowDeleting;
    const title = isActive ? activeSessionLabel(session) : sessionLabel(session);
    const canSelectRow = !isEditing;

    return (
      <div
        key={session.id}
        className={`sessions-panel__item ${isSelected ? 'is-selected' : ''} ${
          isEditing ? 'is-editing' : ''
        }`}
        role={canSelectRow ? 'button' : undefined}
        tabIndex={canSelectRow ? 0 : undefined}
        aria-label={canSelectRow ? `Select ${title}` : undefined}
        onClick={
          canSelectRow
            ? (event) => {
                if (isInteractiveTarget(event.target)) {
                  return;
                }
                onSelectSessionId(session.id);
              }
            : undefined
        }
        onKeyDown={
          canSelectRow
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectSessionId(session.id);
                }
              }
            : undefined
        }
      >
        <div className="sessions-panel__item-top">
          {isEditing ? (
            <input
              type="text"
              className="sessions-panel__rename-input"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveRename(session);
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              aria-label="Edit session name"
              disabled={updateSessionMutation.isPending}
              autoFocus
            />
          ) : (
            <span className="sessions-panel__item-select">
              <span className="sessions-panel__title">{title}</span>
            </span>
          )}
          <div className="sessions-panel__item-actions">
            {session.isArchived ? <span className="sessions-panel__badge">Archived</span> : null}
            {hasQueryApiKey ? (
              isEditing ? (
                <>
                  <button
                    type="button"
                    className="sessions-panel__icon-button"
                    onClick={() => saveRename(session)}
                    disabled={disableRowActions}
                    aria-label="Save session name"
                  >
                    <IconCheck size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="sessions-panel__icon-button"
                    onClick={cancelRename}
                    disabled={disableRowActions}
                    aria-label="Cancel rename"
                  >
                    <IconX size={14} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="sessions-panel__icon-button"
                  onClick={() => beginRename(session)}
                  aria-label={`Rename ${title}`}
                  title="Rename session"
                  disabled={disableRowActions}
                >
                  <IconPencil size={14} aria-hidden="true" />
                </button>
              )
            ) : null}
            {hasQueryApiKey ? (
              <div className="sessions-panel__menu-wrap">
                <button
                  type="button"
                  className="sessions-panel__icon-button sessions-panel__menu-trigger"
                  onClick={() => toggleActionsMenu(session.id)}
                  aria-label={`Open actions for ${title}`}
                  aria-expanded={isMenuOpen}
                  disabled={disableRowActions}
                >
                  <IconDotsVertical size={14} aria-hidden="true" />
                </button>
                {isMenuOpen ? (
                  <div className="sessions-panel__menu" role="menu" aria-label={`Actions for ${title}`}>
                    <button
                      type="button"
                      className="sessions-panel__menu-item"
                      role="menuitem"
                      onClick={() => handleArchiveToggle(session)}
                      disabled={disableRowActions}
                    >
                      {session.isArchived ? (
                        <IconArchiveOff size={13} aria-hidden="true" />
                      ) : (
                        <IconArchive size={13} aria-hidden="true" />
                      )}
                      <span>{session.isArchived ? 'Unarchive' : 'Archive'}</span>
                    </button>
                    <button
                      type="button"
                      className="sessions-panel__menu-item sessions-panel__menu-item--danger"
                      role="menuitem"
                      onClick={() => handleDeleteRequest(session)}
                      disabled={disableRowActions}
                    >
                      <IconTrash size={13} aria-hidden="true" />
                      <span>Delete…</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="sessions-panel__meta">
          <span>Start: {formatTimestamp(session.startedAt)}</span>
          {!isActive ? <span>End: {formatTimestamp(session.endedAt)}</span> : null}
        </div>
        {isEditing && renameError ? (
          <div className="sessions-panel__rename-error" role="status">
            {renameError}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="sessions-panel" aria-label="Sessions">
      <div className="sessions-panel__header">
        <h3>Sessions</h3>
        <div className="sessions-panel__header-meta">
          {deviceId ? (
            <span className="sessions-panel__device">Device selected</span>
          ) : (
            <span className="sessions-panel__device">Select a device</span>
          )}
          <label className="sessions-panel__toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
        </div>
      </div>

      <div className="sessions-panel__actions">
        <input
          type="text"
          placeholder="Session name (optional)"
          value={sessionName}
          onChange={(event) => setSessionName(event.target.value)}
          disabled={!deviceId || startMutation.isPending}
        />
        <div className="sessions-panel__buttons">
          <button type="button" onClick={handleStart} disabled={!deviceId || startMutation.isPending}>
            {startMutation.isPending ? 'Starting…' : 'Start session'}
          </button>
        </div>
      </div>

      {activeSession && (
        <div className="sessions-panel__active">
          {renderSessionRow(activeSession, true)}
          <button
            type="button"
            className="sessions-panel__stop"
            onClick={handleStop}
            disabled={stopMutation.isPending}
          >
            {stopMutation.isPending ? 'Stopping…' : 'Stop'}
          </button>
        </div>
      )}

      {error && <div className="sessions-panel__error">Failed to load sessions.</div>}

      <div className="sessions-panel__list" aria-live="polite">
        {isLoading && <div className="sessions-panel__loading">Loading sessions…</div>}
        {!isLoading && sessions.length === 0 && (
          <div className="sessions-panel__empty">No sessions yet.</div>
        )}
        {pastSessions.map((session) => renderSessionRow(session))}
      </div>
      {sessionActionError ? (
        <div className="sessions-panel__error" role="status">
          {sessionActionError}
        </div>
      ) : null}
      {deleteTargetSession ? (
        <div
          className="sessions-panel__modal-backdrop"
          role="presentation"
          onClick={() => {
            setDeleteTargetSession(null);
            setDeleteConfirmText('');
          }}
        >
          <div
            className="sessions-panel__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sessions-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="sessions-delete-title">Delete session?</h4>
            <div className="sessions-panel__modal-session-name">
              {deleteTargetSession.name?.trim() || `Session ${deleteTargetSession.id.slice(0, 8)}`}
            </div>
            <div className="sessions-panel__modal-meta">
              Measurements:{' '}
              {deleteSessionDetailsQuery.isLoading
                ? 'Loading...'
                : deleteSessionDetailsQuery.data?.measurementCount ?? '—'}
            </div>
            <p>
              Choose how to proceed:
            </p>
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
                  setDeleteTargetSession(null);
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
                  deleteTargetSession.isArchived
                }
              >
                {deleteTargetSession.isArchived
                  ? 'Already archived'
                  : updateSessionMutation.isPending
                    ? 'Archiving…'
                    : 'Archive session'}
              </button>
              <button
                type="button"
                className="sessions-panel__modal-delete"
                onClick={handleDeleteConfirm}
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
