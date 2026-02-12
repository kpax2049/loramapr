import { createHash } from 'node:crypto';
import { fetch } from 'undici';
import type { Logger } from 'pino';
import type { ForwarderConfig } from './env';

export type EventPoster = (payload: unknown) => Promise<void>;
type DeliveryResult = 'success' | 'retry' | 'drop';

type PendingQueueItem = {
  id: string;
  payload: Record<string, unknown>;
  attempts: number;
  nextAttemptAt: number;
};

export type PosterMetrics = {
  queueLength: number;
  successfulPosts: number;
  failedPosts: number;
  lastSuccessAt: string | null;
};

export type PosterWorker = {
  enqueue: EventPoster;
  start: () => void;
  getMetrics: () => PosterMetrics;
};

export function eventId(obj: unknown): string {
  if (isRecord(obj)) {
    const packetId = obj.packetId;
    if (typeof packetId === 'string' || typeof packetId === 'number') {
      return knownIdToHex(packetId);
    }

    const id = obj.id;
    if (typeof id === 'string' || typeof id === 'number') {
      return knownIdToHex(id);
    }
  }

  return sha256Hex(safeStringify(obj));
}

export function createPoster(config: ForwarderConfig, logger: Logger): PosterWorker {
  const endpoint = new URL('/api/meshtastic/event', config.API_BASE_URL).toString();
  const queue: PendingQueueItem[] = [];
  let isProcessing = false;
  let scheduledTimer: NodeJS.Timeout | null = null;
  let workerStarted = false;
  let successfulPosts = 0;
  let failedPosts = 0;
  let lastSuccessAt: Date | null = null;

  const enqueue: EventPoster = async (rawPayload: unknown): Promise<void> => {
    if (!workerStarted) {
      start();
    }

    const id = eventId(rawPayload);
    const payload = buildForwarderPayload(rawPayload, id, config.DEVICE_HINT);
    queue.push({
      id,
      payload,
      attempts: 0,
      nextAttemptAt: Date.now()
    });
    const droppedCount = dropOverflow(queue, config.MAX_QUEUE, logger);
    if (droppedCount > 0) {
      failedPosts += droppedCount;
    }
    scheduleProcess(0);
  };

  const start = (): void => {
    if (workerStarted) {
      return;
    }
    workerStarted = true;
    logger.info({ endpoint }, 'Poster worker started');
    scheduleProcess(0);
  };

  const getMetrics = (): PosterMetrics => ({
    queueLength: queue.length,
    successfulPosts,
    failedPosts,
    lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null
  });

  const scheduleProcess = (delayMs: number): void => {
    if (!workerStarted) {
      return;
    }
    if (scheduledTimer) {
      return;
    }
    scheduledTimer = setTimeout(() => {
      scheduledTimer = null;
      void processQueue();
    }, Math.max(0, delayMs));
    scheduledTimer.unref?.();
  };

  const processQueue = async (): Promise<void> => {
    if (isProcessing) {
      return;
    }

    isProcessing = true;
    try {
      while (queue.length > 0) {
        const item = queue[0];
        const waitMs = item.nextAttemptAt - Date.now();
        if (waitMs > 0) {
          scheduleProcess(waitMs);
          return;
        }

        const outcome = await postItem(item);
        if (outcome === 'success' || outcome === 'drop') {
          queue.shift();
          continue;
        }

        item.attempts += 1;
        const delayMs = computeRetryDelayMs(
          item.attempts,
          config.RETRY_BASE_MS,
          config.RETRY_MAX_MS
        );
        item.nextAttemptAt = Date.now() + delayMs;

        logger.warn(
          {
            eventId: item.id,
            attempts: item.attempts,
            retryInMs: delayMs,
            queueSize: queue.length
          },
          'Transient failure; event scheduled for retry'
        );

        scheduleProcess(delayMs);
        return;
      }
    } finally {
      isProcessing = false;
    }
  };

  const postItem = async (item: PendingQueueItem): Promise<DeliveryResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.POST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.INGEST_API_KEY,
          'X-Idempotency-Key': item.id
        },
        body: JSON.stringify(item.payload),
        signal: controller.signal
      });

      const responseText = (await response.text()).slice(0, 2000);

      if (response.ok) {
        successfulPosts += 1;
        lastSuccessAt = new Date();
        logger.debug(
          { endpoint, eventId: item.id, status: response.status, attempts: item.attempts },
          'Forwarded event'
        );
        return 'success';
      }

      if (response.status === 400 || response.status === 401 || response.status === 403) {
        failedPosts += 1;
        logger.warn(
          {
            endpoint,
            eventId: item.id,
            status: response.status,
            statusText: response.statusText,
            responseText
          },
          'Permanent failure (400/401/403); dropping event'
        );
        return 'drop';
      }

      if (response.status >= 500) {
        failedPosts += 1;
        logger.warn(
          {
            endpoint,
            eventId: item.id,
            status: response.status,
            statusText: response.statusText,
            responseText
          },
          'Server error; retrying event'
        );
        return 'retry';
      }

      if (!response.ok) {
        failedPosts += 1;
        logger.warn(
          {
            status: response.status,
            statusText: response.statusText,
            endpoint,
            eventId: item.id,
            responseText
          },
          'Non-retriable response; dropping event'
        );
        return 'drop';
      }
    } catch (error) {
      failedPosts += 1;
      logger.error(
        { err: error, endpoint, eventId: item.id },
        'Network or timeout failure; retrying event'
      );
      return 'retry';
    } finally {
      clearTimeout(timeout);
    }

    return 'drop';
  };

  return {
    enqueue,
    start,
    getMetrics
  };
}

function buildForwarderPayload(
  rawPayload: unknown,
  id: string,
  deviceHint?: string
): Record<string, unknown> {
  const sourceObject = asObject(rawPayload);
  return {
    ...sourceObject,
    _forwarder: {
      deviceHint: deviceHint ?? null,
      receivedAt: new Date().toISOString(),
      eventId: id
    }
  };
}

function dropOverflow(queue: PendingQueueItem[], maxQueue: number, logger: Logger): number {
  if (queue.length <= maxQueue) {
    return 0;
  }

  const dropCount = queue.length - maxQueue;
  const droppedItems = queue.splice(0, dropCount);
  logger.warn(
    {
      droppedCount: dropCount,
      droppedIds: droppedItems.map((item) => item.id)
    },
    'Queue exceeded MAX_QUEUE; dropped oldest pending events'
  );
  return dropCount;
}

function computeRetryDelayMs(attempts: number, retryBaseMs: number, retryMaxMs: number): number {
  const rawDelay = Math.min(retryMaxMs, retryBaseMs * 2 ** Math.max(0, attempts - 1));
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.max(1, Math.round(rawDelay * jitterFactor));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  return { payload: value };
}

function safeStringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized ?? 'null';
  } catch {
    return String(value);
  }
}

function knownIdToHex(value: string | number): string {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 0) {
      return value.toString(16);
    }
    return Buffer.from(String(value), 'utf8').toString('hex');
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '0';
  }
  if (/^[0-9a-f]+$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return Buffer.from(trimmed, 'utf8').toString('hex');
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
