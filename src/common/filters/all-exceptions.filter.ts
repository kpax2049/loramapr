import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { extractRequestLogContext } from '../logging/http-log-context';
import { logWarn, logError } from '../logging/structured-logger';
import { ensureRequestId, REQUEST_ID_HEADER } from '../request-id';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: unknown;
      ownerId?: unknown;
      user?: { id?: unknown };
      headers?: Record<string, string | string[] | undefined>;
      requestId?: string;
      requestStartedAtNs?: bigint;
    }>();
    const response = ctx.getResponse<{ setHeader: (name: string, value: string) => void }>();
    const requestId = ensureRequestId(request);
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const baseResponse = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(request),
      requestId
    };
    const startedAt = request.requestStartedAtNs;
    const durationMs =
      typeof startedAt === 'bigint'
        ? Number(process.hrtime.bigint() - startedAt) / 1_000_000
        : undefined;
    const context = extractRequestLogContext(request);
    const logFields = {
      method: request.method ?? 'UNKNOWN',
      path: baseResponse.path,
      statusCode: httpStatus,
      durationMs: durationMs !== undefined ? Number(durationMs.toFixed(2)) : undefined,
      message: getExceptionMessage(exception),
      ...context
    };
    if (httpStatus >= 500) {
      logError('http.request.error', logFields);
    } else {
      logWarn('http.request.error', logFields);
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        httpAdapter.reply(
          ctx.getResponse(),
          { ...baseResponse, message: response },
          httpStatus
        );
        return;
      }

      if (response && typeof response === 'object') {
        httpAdapter.reply(ctx.getResponse(), { ...baseResponse, ...response }, httpStatus);
        return;
      }
    }

    httpAdapter.reply(
      ctx.getResponse(),
      { ...baseResponse, message: 'Internal server error' },
      httpStatus
    );
  }
}

function getExceptionMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message?: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message)) {
        return message.map(String).join('; ');
      }
    }
    return exception.message;
  }
  if (exception instanceof Error) {
    return exception.message;
  }
  return String(exception);
}
