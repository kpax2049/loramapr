import { Logger } from '@nestjs/common';
import { ensureRequestId, REQUEST_ID_HEADER } from '../request-id';

type RequestLike = {
  method: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  requestId?: string;
};

type ResponseLike = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  on: (event: 'finish', listener: () => void) => void;
};

type NextFunction = () => void;

const logger = new Logger('HttpRequest');

export function requestIdMiddleware(req: RequestLike, res: ResponseLike, next: NextFunction): void {
  const requestId = ensureRequestId(req);
  const method = req.method;
  const path = req.originalUrl ?? req.url ?? '';
  const startedAt = process.hrtime.bigint();

  res.setHeader(REQUEST_ID_HEADER, requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.log(
      JSON.stringify({
        event: 'request.completed',
        requestId,
        method,
        path,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2))
      })
    );
  });

  next();
}
