import pino, { type Logger } from 'pino';
import type { ForwarderConfig } from './env';

export function createLogger(config: ForwarderConfig): Logger {
  return pino({
    level: 'info',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  }).child({
    component: 'pi-forwarder',
    deviceHint: config.DEVICE_HINT
  });
}
