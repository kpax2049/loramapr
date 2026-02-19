import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return [...new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean))];
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const corsAllowlist = parseCorsOrigins(process.env.CORS_ORIGINS);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Non-browser requests (no Origin header) are not subject to CORS.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (!isProduction) {
        // Keep development permissive for local tooling/frontends.
        callback(null, true);
        return;
      }

      if (corsAllowlist.length === 0) {
        callback(null, false);
        return;
      }

      callback(null, corsAllowlist.includes(origin));
    },
    credentials: false,
    allowedHeaders: ['X-API-Key', 'Content-Type', 'Authorization'],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 204
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
