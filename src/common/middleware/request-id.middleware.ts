import { extractRequestLogContext } from '../logging/http-log-context';
import { runWithRequestContext } from '../logging/request-context';
import { logInfo } from '../logging/structured-logger';
import { ensureRequestId, REQUEST_ID_HEADER } from '../request-id';

type RequestLike = {
  method: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  ownerId?: unknown;
  user?: {
    id?: unknown;
  };
  requestId?: string;
  requestStartedAtNs?: bigint;
};

type ResponseLike = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  on: (event: 'finish', listener: () => void) => void;
};

type NextFunction = () => void;

export function requestIdMiddleware(req: RequestLike, res: ResponseLike, next: NextFunction): void {
  const requestId = ensureRequestId(req);
  const method = req.method;
  const path = req.originalUrl ?? req.url ?? '';
  req.requestStartedAtNs = process.hrtime.bigint();
  const requestContext = extractRequestLogContext(req);

  res.setHeader(REQUEST_ID_HEADER, requestId);

  res.on('finish', () => {
    const startedAt = req.requestStartedAtNs ?? process.hrtime.bigint();
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logInfo('http.request.completed', {
      method,
      path,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ...requestContext
    });
  });

  runWithRequestContext({ requestId }, () => {
    next();
  });
}
