import { useEffect, useMemo } from 'react';
import type { Session, SessionTimeline } from '../api/types';
import { useSessions } from '../query/sessions';

type PlaybackPanelProps = {
  deviceId: string | null;
  sessionId: string | null;
  onSelectSessionId: (sessionId: string | null) => void;
  timeline?: SessionTimeline | null;
  timelineLoading?: boolean;
  timelineError?: unknown;
  windowFrom?: Date | null;
  windowTo?: Date | null;
  windowCount?: number;
  playbackCursorMs: number;
  onPlaybackCursorMsChange: (value: number) => void;
  playbackWindowMs: number;
  onPlaybackWindowMsChange: (value: number) => void;
  playbackIsPlaying: boolean;
  onPlaybackIsPlayingChange: (value: boolean) => void;
  playbackSpeed: 0.25 | 0.5 | 1 | 2 | 4;
  onPlaybackSpeedChange: (value: 0.25 | 0.5 | 1 | 2 | 4) => void;
};

const SPEED_OPTIONS: Array<0.25 | 0.5 | 1 | 2 | 4> = [0.25, 0.5, 1, 2, 4];
const WINDOW_OPTIONS_MINUTES = [1, 5, 10, 30];

export default function PlaybackPanel({
  deviceId,
  sessionId,
  onSelectSessionId,
  timeline,
  timelineLoading,
  timelineError,
  windowFrom,
  windowTo,
  windowCount,
  playbackCursorMs,
  onPlaybackCursorMsChange,
  playbackWindowMs,
  onPlaybackWindowMsChange,
  playbackIsPlaying,
  onPlaybackIsPlayingChange,
  playbackSpeed,
  onPlaybackSpeedChange
}: PlaybackPanelProps) {
  const sessionsQuery = useSessions(deviceId ?? undefined, { enabled: Boolean(deviceId) });
  const sessions = sessionsQuery.data ?? [];

  const minMs = useMemo(() => {
    if (!timeline?.minCapturedAt) {
      return null;
    }
    const parsed = new Date(timeline.minCapturedAt).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }, [timeline?.minCapturedAt]);

  const maxMs = useMemo(() => {
    if (!timeline?.maxCapturedAt) {
      return null;
    }
    const parsed = new Date(timeline.maxCapturedAt).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }, [timeline?.maxCapturedAt]);

  const hasPoints = minMs !== null && maxMs !== null;
  const scrubberMin = minMs ?? 0;
  const scrubberMax = maxMs ?? 0;
  const scrubberValue = hasPoints
    ? Math.min(Math.max(playbackCursorMs, scrubberMin), scrubberMax)
    : 0;
  const scrubberMeta = hasPoints
    ? {
        min: formatTimestamp(new Date(scrubberMin).toISOString()),
        current: formatTimestamp(new Date(scrubberValue).toISOString()),
        max: formatTimestamp(new Date(scrubberMax).toISOString())
      }
    : { min: '—', current: '—', max: '—' };

  useEffect(() => {
    if (!hasPoints) {
      return;
    }
    if (playbackCursorMs < scrubberMin || playbackCursorMs > scrubberMax) {
      onPlaybackCursorMsChange(scrubberMin);
    }
  }, [hasPoints, playbackCursorMs, scrubberMin, scrubberMax, onPlaybackCursorMsChange]);

  useEffect(() => {
    if (!hasPoints && playbackIsPlaying) {
      onPlaybackIsPlayingChange(false);
    }
  }, [hasPoints, playbackIsPlaying, onPlaybackIsPlayingChange]);

  const sessionOptionsDisabled = !deviceId || sessions.length === 0 || sessionsQuery.isLoading;
  const isTimelineLoading = timelineLoading ?? false;
  const hasTimelineError = Boolean(timelineError);
  const noPoints = sessionId && !hasPoints && !isTimelineLoading;
  const windowLabel =
    windowFrom && windowTo
      ? `Showing points from ${formatTimestamp(windowFrom.toISOString())} to ${formatTimestamp(
          windowTo.toISOString()
        )} (${windowCount ?? 0} points)`
      : null;
  const playDisabled = !hasPoints;
  const scrubberDisabled = !hasPoints;
  const jumpDisabled = !hasPoints;
  const speedDisabled = !sessionId;
  const windowDisabled = !sessionId;

  return (
    <section className="playback-panel" aria-label="Playback controls">
      <div className="playback-panel__header">
        <h3>Playback</h3>
      </div>

      <div className="playback-panel__group">
        <label htmlFor="playback-session">Session</label>
        <select
          id="playback-session"
          value={sessionId ?? ''}
          onChange={(event) => onSelectSessionId(event.target.value || null)}
          disabled={sessionOptionsDisabled}
        >
          <option value="">
            {deviceId
              ? sessionsQuery.isLoading
                ? 'Loading sessions...'
                : sessions.length === 0
                  ? 'No sessions'
                  : 'Select a session'
              : 'Select a device'}
          </option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {formatSessionLabel(session)}
            </option>
          ))}
        </select>
      </div>

      <div className="playback-panel__summary">
        <div className="playback-panel__summary-row">
          <span>Points</span>
          <strong>{timeline?.count ?? '—'}</strong>
        </div>
        <div className="playback-panel__summary-row">
          <span>Min</span>
          <strong>{formatTimestamp(timeline?.minCapturedAt)}</strong>
        </div>
        <div className="playback-panel__summary-row">
          <span>Max</span>
          <strong>{formatTimestamp(timeline?.maxCapturedAt)}</strong>
        </div>
        {isTimelineLoading && sessionId ? (
          <div className="playback-panel__status">Loading timeline…</div>
        ) : null}
        {hasTimelineError ? (
          <div className="playback-panel__status playback-panel__status--error">
            Timeline unavailable
          </div>
        ) : null}
        {noPoints ? <div className="playback-panel__status">No points in session</div> : null}
        {windowLabel ? <div className="playback-panel__window">{windowLabel}</div> : null}
      </div>

      <div className="playback-panel__controls">
        <div className="playback-panel__controls-row">
          <button
            type="button"
            className="playback-panel__button"
            onClick={() => onPlaybackIsPlayingChange(!playbackIsPlaying)}
            disabled={playDisabled}
          >
            {playbackIsPlaying ? 'Pause' : 'Play'}
          </button>
          <label className="playback-panel__select">
            <span>Speed</span>
            <select
              value={playbackSpeed}
              onChange={(event) =>
                onPlaybackSpeedChange(Number(event.target.value) as 0.25 | 0.5 | 1 | 2 | 4)
              }
              disabled={speedDisabled}
            >
              {SPEED_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}x
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="playback-panel__controls-row">
          <label className="playback-panel__select">
            <span>Window</span>
            <select
              value={Math.round(playbackWindowMs / 60000)}
              onChange={(event) => onPlaybackWindowMsChange(Number(event.target.value) * 60000)}
              disabled={windowDisabled}
            >
              {WINDOW_OPTIONS_MINUTES.map((value) => (
                <option key={value} value={value}>
                  {value} min
                </option>
              ))}
            </select>
          </label>
          <div className="playback-panel__jump">
            <button
              type="button"
              className="playback-panel__button"
              onClick={() => minMs !== null && onPlaybackCursorMsChange(minMs)}
              disabled={jumpDisabled}
            >
              Jump to start
            </button>
            <button
              type="button"
              className="playback-panel__button"
              onClick={() => maxMs !== null && onPlaybackCursorMsChange(maxMs)}
              disabled={jumpDisabled}
            >
              Jump to end
            </button>
          </div>
        </div>

        <div className="playback-panel__scrubber">
          <input
            type="range"
            min={scrubberMin}
            max={scrubberMax}
            value={scrubberValue}
            onChange={(event) => onPlaybackCursorMsChange(Number(event.target.value))}
            disabled={scrubberDisabled}
          />
          <div className="playback-panel__scrubber-meta">
            <span>{scrubberMeta.min}</span>
            <span>{scrubberMeta.current}</span>
            <span>{scrubberMeta.max}</span>
          </div>
        </div>
      </div>
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

function formatSessionLabel(session: Session): string {
  const name = session.name?.trim();
  if (name) {
    return name;
  }
  return session.id;
}
