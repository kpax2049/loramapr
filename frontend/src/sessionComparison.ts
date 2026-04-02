import type { Session, SessionStats } from './api/types';

export const MAX_COMPARED_SESSIONS = 4;
const COMPARISON_STYLE_PALETTE = [
  { color: '#38bdf8', dashArray: undefined },
  { color: '#fb7185', dashArray: '10 8' },
  { color: '#f59e0b', dashArray: '4 8' },
  { color: '#34d399', dashArray: '16 8 4 8' }
] as const;

export type SessionComparisonStyle = {
  color: string;
  dashArray?: string;
};

export function parseComparedSessionIds(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  return normalizeComparedSessionIds(value.split(','));
}

export function normalizeComparedSessionIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawId of ids) {
    const id = rawId.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
    if (normalized.length >= MAX_COMPARED_SESSIONS) {
      break;
    }
  }

  return normalized;
}

export function getSessionComparisonStyle(index: number): SessionComparisonStyle {
  const style = COMPARISON_STYLE_PALETTE[index % COMPARISON_STYLE_PALETTE.length];
  return {
    color: style.color,
    dashArray: style.dashArray
  };
}

export function areStringListsEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

export function formatSessionLabel(session: Pick<Session, 'id' | 'name'> | { id: string; name?: string | null }): string {
  return session.name?.trim() || `Session ${session.id.slice(0, 8)}`;
}

export function formatSessionTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function buildSessionDurationMs(
  session: Pick<Session, 'startedAt' | 'endedAt'> | null,
  stats: Pick<SessionStats, 'minCapturedAt' | 'maxCapturedAt'> | null
): number | null {
  const startIso = stats?.minCapturedAt ?? session?.startedAt ?? null;
  const endIso = stats?.maxCapturedAt ?? session?.endedAt ?? null;
  if (!startIso || !endIso) {
    return null;
  }

  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  return endMs - startMs;
}

export function formatSessionDuration(durationMs: number | null): string {
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

export function formatDistanceMeters(distanceMeters: number | null | undefined): string {
  if (distanceMeters === null || distanceMeters === undefined || !Number.isFinite(distanceMeters)) {
    return '—';
  }

  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

export function formatSignalMetric(
  value: number | null | undefined,
  metric: 'rssi' | 'snr'
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return metric === 'rssi' ? `${Math.round(value)} dBm` : `${value.toFixed(1)} dB`;
}
