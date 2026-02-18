import * as Joi from 'joi';

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  API_PORT: Joi.number().integer().min(1).max(65535).optional(),
  PORT: Joi.number().integer().min(1).max(65535).optional(),
  DATABASE_URL: Joi.string().uri().required(),
  CORS_ORIGINS: Joi.string().optional(),
  FRONTEND_ORIGIN: Joi.string().optional(),
  CORS_ORIGIN: Joi.string().optional(),
  FRONTEND_PORT: Joi.number().integer().min(1).max(65535).optional(),
  POSTGRES_DB: Joi.string().optional(),
  POSTGRES_USER: Joi.string().optional(),
  POSTGRES_PASSWORD: Joi.string().optional(),
  POSTGRES_PORT: Joi.number().integer().min(1).max(65535).optional(),
  QUERY_API_KEY: Joi.string().optional(),
  INGEST_API_KEY: Joi.string().optional(),
  TTS_WEBHOOK_API_KEY: Joi.string().optional(),
  TTS_WEBHOOK_BASIC_USER: Joi.string().optional(),
  TTS_WEBHOOK_BASIC_PASS: Joi.string().optional()
});

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const { value, error } = envSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true
  });

  if (error) {
    const details = error.details.map((detail) => `- ${detail.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${details}`);
  }

  const normalized = { ...value };
  const apiPort = normalized.API_PORT as number | undefined;
  const port = normalized.PORT as number | undefined;

  if (apiPort === undefined && port === undefined) {
    normalized.API_PORT = 3000;
    normalized.PORT = 3000;
  } else if (apiPort === undefined && port !== undefined) {
    normalized.API_PORT = port;
  } else if (apiPort !== undefined && port === undefined) {
    normalized.PORT = apiPort;
  }

  return normalized;
}
