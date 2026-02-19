import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ensureRequestId, REQUEST_ID_HEADER } from '../request-id';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ headers?: Record<string, string | string[] | undefined>; requestId?: string }>();
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

    this.logger.error(
      JSON.stringify({
        event: 'request.error',
        requestId,
        statusCode: httpStatus,
        path: baseResponse.path,
        message: getExceptionMessage(exception)
      })
    );

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
