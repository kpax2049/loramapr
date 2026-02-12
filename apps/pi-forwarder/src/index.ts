import { ForwarderConfigError, loadConfig } from './env';
import { createLogger } from './logger';
import { createPoster } from './poster';
import { runCliListenSource } from './sources/cli_listen';
import { runStdinSource } from './sources/stdin';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const poster = createPoster(config, logger);
  poster.start();

  logger.info(
    {
      source: config.SOURCE,
      apiBaseUrl: config.API_BASE_URL,
      postTimeoutMs: config.POST_TIMEOUT_MS,
      retryBaseMs: config.RETRY_BASE_MS,
      retryMaxMs: config.RETRY_MAX_MS,
      maxQueue: config.MAX_QUEUE
    },
    'Starting pi-forwarder'
  );

  setInterval(() => {
    const metrics = poster.getMetrics();
    logger.info(
      {
        source: config.SOURCE,
        heartbeatSeconds: config.POLL_HEARTBEAT_SECONDS,
        queueLength: metrics.queueLength,
        successfulPosts: metrics.successfulPosts,
        failedPosts: metrics.failedPosts,
        lastSuccessAt: metrics.lastSuccessAt
      },
      'pi-forwarder heartbeat'
    );
  }, config.POLL_HEARTBEAT_SECONDS * 1000).unref();

  if (config.SOURCE === 'stdin') {
    await runStdinSource({
      logger,
      onEvent: poster.enqueue,
      exitOnEof: true
    });
    return;
  }

  if (config.MESHTASTIC_HOST) {
    logger.info(
      { meshtasticHost: config.MESHTASTIC_HOST },
      'MESHTASTIC_HOST is configured but not used yet in cli mode'
    );
  }

  await runCliListenSource({
    logger,
    onEvent: poster.enqueue,
    cliPath: config.CLI_PATH,
    meshtasticPort: config.MESHTASTIC_PORT
  });
}

void main().catch((error) => {
  if (!(error instanceof ForwarderConfigError)) {
    // Config errors are already logged once in env.ts
    console.error('[pi-forwarder] fatal startup error', error);
  }
  process.exit(1);
});
