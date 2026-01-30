const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');

type RequestOptions = Omit<RequestInit, 'body'> & {
  json?: unknown;
};

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
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

function buildUrl(path: string): string {
  if (!baseUrl || /^https?:\/\//i.test(path)) {
    return path;
  }
  return new URL(path, baseUrl).toString();
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
  const { json, headers, ...init } = options;

  const requestHeaders: HeadersInit = {
    ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...headers
  };

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers: requestHeaders,
      body: json !== undefined ? JSON.stringify(json) : init.body
    });
  } catch (error) {
    throw new ApiError('Network request failed', 0, error);
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    const message = normalizeErrorMessage(payload, response.statusText);
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export async function getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestJson<T>(path, { ...options, method: 'GET' });
}
