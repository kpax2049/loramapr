import type { UnifiedEventSource } from '../api/types';

const ALLOWED_EVENT_SOURCES: UnifiedEventSource[] = ['meshtastic', 'lorawan', 'agent', 'sim'];

export const EVENTS_QUERY_PARAM_KEYS = {
  source: 'eventsSource',
  deviceUid: 'eventsDeviceUid',
  portnum: 'eventsPortnum',
  q: 'eventsQ',
  from: 'eventsFrom',
  to: 'eventsTo',
  eventId: 'eventsEventId'
} as const;

export type EventsNavigationInput = {
  source?: UnifiedEventSource | null;
  deviceUid?: string | null;
  portnum?: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  eventId?: string | null;
};

export type ParsedEventsNavigationParams = {
  source?: UnifiedEventSource;
  deviceUid?: string;
  portnum?: string;
  q?: string;
  from?: string;
  to?: string;
  eventId?: string;
};

function normalizeText(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function setOrDeleteParam(
  params: URLSearchParams,
  key: string,
  value: string | null | undefined
) {
  const normalized = normalizeText(value);
  if (!normalized) {
    params.delete(key);
    return;
  }
  params.set(key, normalized);
}

function parseSource(raw: string | null): UnifiedEventSource | undefined {
  const normalized = normalizeText(raw)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (ALLOWED_EVENT_SOURCES.includes(normalized as UnifiedEventSource)) {
    return normalized as UnifiedEventSource;
  }
  return undefined;
}

export function applyEventsNavigationParams(params: URLSearchParams, input: EventsNavigationInput) {
  const source = typeof input.source === 'string' ? input.source : null;
  setOrDeleteParam(params, EVENTS_QUERY_PARAM_KEYS.source, source);
  setOrDeleteParam(params, EVENTS_QUERY_PARAM_KEYS.deviceUid, input.deviceUid);
  setOrDeleteParam(params, EVENTS_QUERY_PARAM_KEYS.portnum, input.portnum);
  setOrDeleteParam(params, EVENTS_QUERY_PARAM_KEYS.q, input.q);
  setOrDeleteParam(params, EVENTS_QUERY_PARAM_KEYS.from, input.from);
  setOrDeleteParam(params, EVENTS_QUERY_PARAM_KEYS.to, input.to);
  setOrDeleteParam(params, EVENTS_QUERY_PARAM_KEYS.eventId, input.eventId);
}

export function readEventsNavigationParams(params: URLSearchParams): ParsedEventsNavigationParams {
  return {
    source: parseSource(params.get(EVENTS_QUERY_PARAM_KEYS.source)),
    deviceUid: normalizeText(params.get(EVENTS_QUERY_PARAM_KEYS.deviceUid)),
    portnum: normalizeText(params.get(EVENTS_QUERY_PARAM_KEYS.portnum)),
    q: normalizeText(params.get(EVENTS_QUERY_PARAM_KEYS.q)),
    from: normalizeText(params.get(EVENTS_QUERY_PARAM_KEYS.from)),
    to: normalizeText(params.get(EVENTS_QUERY_PARAM_KEYS.to)),
    eventId: normalizeText(params.get(EVENTS_QUERY_PARAM_KEYS.eventId))
  };
}
