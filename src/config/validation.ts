import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  TTS_WEBHOOK_API_KEY: Joi.string().optional(),
  TTS_WEBHOOK_BASIC_USER: Joi.string().optional(),
  TTS_WEBHOOK_BASIC_USERNAME: Joi.string().optional(),
  TTS_WEBHOOK_BASIC_PASSWORD: Joi.string().optional(),
  TTS_WEBHOOK_BASIC_PASS: Joi.string().optional()
});
