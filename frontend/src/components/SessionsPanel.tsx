import { useMemo, useState } from 'react';
import { useSessions, useStartSession, useStopSession } from '../query/sessions';
import type { Session } from '../api/types';

type SessionsPanelProps = {
  deviceId: string | null;
  selectedSessionId: string | null;
  onSelectSessionId: (sessionId: string | null) => void;
};

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

export default function SessionsPanel({
  deviceId,
  selectedSessionId,
  onSelectSessionId
}: SessionsPanelProps) {
  const [sessionName, setSessionName] = useState('');
  const { data: sessions = [], isLoading, error } = useSessions(deviceId ?? undefined);
  const startMutation = useStartSession();
  const stopMutation = useStopSession();

  const activeSession = useMemo(
    () => sessions.find((session) => !session.endedAt) ?? null,
    [sessions]
  );

  const handleStart = () => {
    if (!deviceId || startMutation.isPending) {
      return;
    }
    const name = sessionName.trim();
    startMutation.mutate(
      { deviceId, name: name || undefined },
      {
        onSuccess: () => {
          setSessionName('');
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

  return (
    <section className="sessions-panel" aria-label="Sessions">
      <div className="sessions-panel__header">
        <h3>Sessions</h3>
        {deviceId ? (
          <span className="sessions-panel__device">Device selected</span>
        ) : (
          <span className="sessions-panel__device">Select a device</span>
        )}
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
          <button
            type="button"
            onClick={handleStop}
            disabled={!activeSession || stopMutation.isPending}
          >
            {stopMutation.isPending ? 'Stopping…' : 'Stop session'}
          </button>
        </div>
      </div>

      {activeSession && (
        <div className="sessions-panel__active">
          <span>Active:</span>
          <strong>{sessionLabel(activeSession)}</strong>
        </div>
      )}

      {error && <div className="sessions-panel__error">Failed to load sessions.</div>}

      <div className="sessions-panel__list" aria-live="polite">
        {isLoading && <div className="sessions-panel__loading">Loading sessions…</div>}
        {!isLoading && sessions.length === 0 && (
          <div className="sessions-panel__empty">No sessions yet.</div>
        )}
        {sessions.map((session) => (
          <button
            type="button"
            key={session.id}
            className={`sessions-panel__item ${
              selectedSessionId === session.id ? 'is-selected' : ''
            }`}
            onClick={() => onSelectSessionId(session.id)}
          >
            <div className="sessions-panel__title">{sessionLabel(session)}</div>
            <div className="sessions-panel__meta">
              <span>Start: {formatTimestamp(session.startedAt)}</span>
              <span>End: {formatTimestamp(session.endedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
