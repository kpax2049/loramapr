import { useSyncExternalStore } from 'react';

export type ApiDiagnosticsEntry = {
  id: number;
  endpointPath: string;
  statusCode: number;
  timestamp: string;
  requestId: string | null;
};

const MAX_ENTRIES = 20;
const SESSION_STORAGE_KEY = 'apiDiagnosticsRecent';

let nextId = 1;
let entries: ApiDiagnosticsEntry[] = loadInitialEntries();
const listeners = new Set<() => void>();

if (entries.length > 0) {
  nextId = Math.max(...entries.map((entry) => entry.id)) + 1;
}

function loadInitialEntries(): ApiDiagnosticsEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => sanitizeStoredEntry(item))
      .filter((item): item is ApiDiagnosticsEntry => item !== null)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function sanitizeStoredEntry(value: unknown): ApiDiagnosticsEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Partial<ApiDiagnosticsEntry>;
  if (
    typeof record.id !== 'number' ||
    typeof record.endpointPath !== 'string' ||
    typeof record.statusCode !== 'number' ||
    typeof record.timestamp !== 'string'
  ) {
    return null;
  }
  return {
    id: record.id,
    endpointPath: record.endpointPath,
    statusCode: record.statusCode,
    timestamp: record.timestamp,
    requestId: typeof record.requestId === 'string' ? record.requestId : null
  };
}

function persistEntries(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(entries));
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function sanitizeEndpointPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return '/';
  }

  let normalized = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      normalized = `${parsed.pathname}${parsed.search}`;
    } catch {
      normalized = trimmed;
    }
  }

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  const queryIndex = normalized.indexOf('?');
  if (queryIndex === -1) {
    return normalized;
  }

  const pathname = normalized.slice(0, queryIndex);
  const params = new URLSearchParams(normalized.slice(queryIndex + 1));
  for (const [key, value] of params.entries()) {
    if (/(key|token|secret|password|auth)/i.test(key)) {
      params.set(key, value ? 'redacted' : '');
    }
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function recordApiDiagnostics(input: {
  endpointPath: string;
  statusCode: number;
  requestId?: string | null;
  timestamp?: string;
}): void {
  const entry: ApiDiagnosticsEntry = {
    id: nextId++,
    endpointPath: sanitizeEndpointPath(input.endpointPath),
    statusCode: input.statusCode,
    requestId: input.requestId?.trim() ? input.requestId.trim() : null,
    timestamp: input.timestamp ?? new Date().toISOString()
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  persistEntries();
  notifyListeners();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ApiDiagnosticsEntry[] {
  return entries;
}

function getServerSnapshot(): ApiDiagnosticsEntry[] {
  return [];
}

export function useApiDiagnosticsEntries(): ApiDiagnosticsEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
