import * as Joi from 'joi';

const optionalString = Joi.string().empty('').optional();

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  API_PORT: Joi.number().integer().min(1).max(65535).optional(),
  PORT: Joi.number().integer().min(1).max(65535).optional(),
  DATABASE_URL: Joi.string().uri().required(),
  CORS_ORIGINS: optionalString,
  FRONTEND_ORIGIN: optionalString,
  CORS_ORIGIN: optionalString,
  FRONTEND_PORT: Joi.number().integer().min(1).max(65535).optional(),
  POSTGRES_DB: optionalString,
  POSTGRES_USER: optionalString,
  POSTGRES_PASSWORD: optionalString,
  POSTGRES_PORT: Joi.number().integer().min(1).max(65535).optional(),
  QUERY_API_KEY: optionalString,
  INGEST_API_KEY: optionalString,
  TTS_WEBHOOK_API_KEY: optionalString,
  TTS_WEBHOOK_BASIC_USER: optionalString,
  TTS_WEBHOOK_BASIC_PASS: optionalString,
  RETENTION_WEBHOOKEVENT_DAYS: Joi.number().integer().min(1).optional(),
  RETENTION_AGENTDECISION_DAYS: Joi.number().integer().min(1).optional(),
  RETENTION_RUN_AT_STARTUP: Joi.boolean()
    .truthy('true')
    .truthy('1')
    .truthy('yes')
    .truthy('on')
    .falsy('false')
    .falsy('0')
    .falsy('no')
    .falsy('off')
    .optional(),
  RETENTION_SCHEDULE_CRON: optionalString
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
