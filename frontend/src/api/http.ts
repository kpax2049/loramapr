// Frontend always calls same-origin /api/* at runtime.
// Dev routing to backend is handled by Vite proxy (configured with VITE_API_BASE_URL).
const baseUrl = '';

type RequestOptions = Omit<RequestInit, 'body' | 'signal' | 'headers'> & {
  json?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
};

export class ApiError extends Error {
  status: number;
  details?: unknown;
  requestId?: string;

  constructor(message: string, status: number, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => String(item)).join(', ');
  }
  if (isRecord(payload)) {
    const message = payload.message;
    if (Array.isArray(message)) {
      return message.map((item) => String(item)).join(', ');
    }
    if (typeof message === 'string') {
      return message;
    }
    if (typeof payload.error === 'string') {
      return payload.error;
    }
  }
  return fallback || 'Request failed';
}

function extractRequestId(payload: unknown, response?: Response): string | undefined {
  const headerValue = response?.headers.get('x-request-id')?.trim();
  if (headerValue) {
    return headerValue;
  }
  if (isRecord(payload) && typeof payload.requestId === 'string') {
    const bodyValue = payload.requestId.trim();
    return bodyValue.length > 0 ? bodyValue : undefined;
  }
  return undefined;
}

function buildUrl(path: string): string {
  if (!baseUrl || /^https?:\/\//i.test(path)) {
    return path;
  }
  return new URL(path, baseUrl).toString();
}

export function getApiBaseUrl(): string {
  return baseUrl;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, signal, ...init } = options;

  const requestHeaders: HeadersInit = {
    ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...headers
  };

  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers: requestHeaders,
      body: json !== undefined ? JSON.stringify(json) : init.body,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    if (typeof error === 'object' && error && 'name' in error && (error as { name?: string }).name === 'AbortError') {
      throw error;
    }
    throw new ApiError('Network request failed', 0, error);
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    const message = normalizeErrorMessage(payload, response.statusText);
    throw new ApiError(message, response.status, payload, extractRequestId(payload, response));
  }

  return payload as T;
}

export async function getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestJson<T>(path, { ...options, method: 'GET' });
}
