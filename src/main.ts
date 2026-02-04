import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const originEnv = process.env.FRONTEND_ORIGIN ?? process.env.CORS_ORIGIN;
  const corsOrigin = originEnv
    ? originEnv.split(',').map((origin) => origin.trim()).filter(Boolean)
    : /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    allowedHeaders: ['X-API-Key', 'Content-Type'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS']
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

void bootstrap();
