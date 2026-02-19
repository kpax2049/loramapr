import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'X-Request-Id';
const REQUEST_ID_HEADER_LOWER = 'x-request-id';

type HeaderValue = string | string[] | undefined;

type RequestWithRequestId = {
  headers?: Record<string, HeaderValue>;
  requestId?: string;
};

export function normalizeRequestId(value: HeaderValue): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function ensureRequestId(request: RequestWithRequestId): string {
  const existing = typeof request.requestId === 'string' ? request.requestId.trim() : '';
  if (existing) {
    return existing;
  }

  const fromHeader = normalizeRequestId(request.headers?.[REQUEST_ID_HEADER_LOWER]);
  const requestId = fromHeader ?? randomUUID();
  request.requestId = requestId;
  return requestId;
}
