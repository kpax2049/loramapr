import { getRequestIdFromContext } from './request-context';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACTED = '[REDACTED]';
const SECRET_FIELD_PATTERNS = [
  /api[-_]?key/i,
  /authorization/i,
  /secret/i,
  /token/i,
  /password/i,
  /pass/i
];

export function logDebug(event: string, fields?: Record<string, unknown>): void {
  writeLog('debug', event, fields);
}

export function logInfo(event: string, fields?: Record<string, unknown>): void {
  writeLog('info', event, fields);
}

export function logWarn(event: string, fields?: Record<string, unknown>): void {
  writeLog('warn', event, fields);
}

export function logError(event: string, fields?: Record<string, unknown>): void {
  writeLog('error', event, fields);
}

function writeLog(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const requestId = getRequestIdFromContext();
  const payload = sanitizeRecord({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(requestId ? { requestId } : {}),
    ...fields
  });
  const line = JSON.stringify(payload);
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

function sanitizeRecord(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSecretKey(key)) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = sanitizeValue(value);
  }
  return output;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return sanitizeRecord(value as Record<string, unknown>);
  }
  return value;
}

function isSecretKey(key: string): boolean {
  return SECRET_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}
