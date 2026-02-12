import { z } from 'zod';

const envSchema = z.object({
  API_BASE_URL: z.string().url(),
  INGEST_API_KEY: z.string().min(1),
  DEVICE_HINT: z.string().optional(),
  SOURCE: z.enum(['cli', 'stdin']),
  MESHTASTIC_PORT: z.string().optional(),
  MESHTASTIC_HOST: z.string().optional(),
  CLI_PATH: z.string().default('meshtastic'),
  POLL_HEARTBEAT_SECONDS: z.coerce.number().int().positive().default(60),
  POST_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  RETRY_BASE_MS: z.coerce.number().int().positive().default(500),
  RETRY_MAX_MS: z.coerce.number().int().positive().default(10000),
  MAX_QUEUE: z.coerce.number().int().positive().default(5000)
});

export type ForwarderConfig = z.infer<typeof envSchema>;
export class ForwarderConfigError extends Error {}

export function loadConfig(input: NodeJS.ProcessEnv = process.env): ForwarderConfig {
  const parsed = envSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const missing = parsed.error.issues
    .filter((issue) => issue.code === 'invalid_type' && issue.received === 'undefined')
    .map((issue) => issue.path.join('.'))
    .filter(Boolean);
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');
  const prefix =
    missing.length > 0
      ? `Missing required env vars: ${missing.join(', ')}`
      : 'Invalid environment configuration';

  // One clear startup log; caller should not duplicate this error output.
  console.error(`[pi-forwarder] ${prefix}. ${details}`);
  throw new ForwarderConfigError(prefix);
}
