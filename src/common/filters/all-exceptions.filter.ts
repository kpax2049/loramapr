import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const baseResponse = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest())
    };

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
