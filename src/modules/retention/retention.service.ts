import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WEBHOOK_DAYS = 30;
const DEFAULT_AGENT_DECISION_DAYS = 90;
const DEFAULT_RUN_AT_STARTUP = false;
const DEFAULT_SCHEDULE_CRON = '0 3 * * *';

type DailySchedule = {
  minute: number;
  hour: number;
  cron: string;
};

@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private lastRunError: string | null = null;
  private schedule: DailySchedule = resolveDailySchedule(
    process.env.RETENTION_SCHEDULE_CRON,
    this.logger
  );

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
    this.schedule = resolveDailySchedule(process.env.RETENTION_SCHEDULE_CRON, this.logger);
    this.scheduleNextRun();

    if (readBooleanEnv('RETENTION_RUN_AT_STARTUP', DEFAULT_RUN_AT_STARTUP)) {
      await this.runRetention('startup');
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getWorkerStatus(): {
    ok: boolean;
    lastRunAt?: Date;
    lastError?: string;
  } {
    return {
      ok: this.lastRunError === null,
      lastRunAt: this.lastRunAt ?? undefined,
      lastError: this.lastRunError ?? undefined
    };
  }

  private scheduleNextRun(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const now = new Date();
    const nextRun = computeNextRun(now, this.schedule.hour, this.schedule.minute);
    const delay = Math.max(1_000, nextRun.getTime() - now.getTime());

    this.logger.log(
      `Retention schedule set to "${this.schedule.cron}" (next run: ${nextRun.toISOString()})`
    );

    this.timer = setTimeout(() => {
      void this.runRetention('scheduled').finally(() => {
        this.scheduleNextRun();
      });
    }, delay);
  }

  private async runRetention(source: 'startup' | 'scheduled'): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(`Skipping ${source} retention run because a previous run is still active`);
      return;
    }

    this.isRunning = true;
    const runStartedAt = new Date();
    try {
      const webhookDays = readPositiveIntEnv(
        'RETENTION_WEBHOOKEVENT_DAYS',
        DEFAULT_WEBHOOK_DAYS
      );
      const webhookCutoff = new Date(Date.now() - webhookDays * DAY_MS);

      const webhookDeleted = await this.prisma.webhookEvent.deleteMany({
        where: {
          receivedAt: { lt: webhookCutoff },
          processedAt: { not: null }
        }
      });

      const agentDecisionDays = readPositiveIntEnv(
        'RETENTION_AGENTDECISION_DAYS',
        DEFAULT_AGENT_DECISION_DAYS
      );
      const agentDecisionCutoff = new Date(Date.now() - agentDecisionDays * DAY_MS);
      const agentDeleted = await this.prisma.agentDecision.deleteMany({
        where: {
          createdAt: { lt: agentDecisionCutoff }
        }
      });

      this.logger.log(
        `Retention run (${source}) complete: WebhookEvent deleted=${webhookDeleted.count} older_than_days=${webhookDays}, AgentDecision deleted=${agentDeleted.count} older_than_days=${agentDecisionDays}`
      );
      this.lastRunError = null;
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      this.lastRunError = message;
      this.logger.error(`Retention run (${source}) failed: ${message}`);
    } finally {
      this.lastRunAt = runStartedAt;
      this.isRunning = false;
    }
  }
}

function parseDailyCron(input: string): DailySchedule | null {
  const parts = input.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minuteRaw, hourRaw, dayRaw, monthRaw, weekdayRaw] = parts;
  if (dayRaw !== '*' || monthRaw !== '*' || weekdayRaw !== '*') {
    return null;
  }

  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) {
    return null;
  }
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) {
    return null;
  }

  return {
    minute,
    hour,
    cron: `${minute} ${hour} * * *`
  };
}

function resolveDailySchedule(rawCron: string | undefined, logger: Logger): DailySchedule {
  const requested = (rawCron ?? DEFAULT_SCHEDULE_CRON).trim();
  const parsed = parseDailyCron(requested);
  if (parsed) {
    return parsed;
  }

  const fallback = parseDailyCron(DEFAULT_SCHEDULE_CRON);
  if (!fallback) {
    throw new Error(`Invalid default retention schedule: ${DEFAULT_SCHEDULE_CRON}`);
  }

  logger.warn(
    `Invalid RETENTION_SCHEDULE_CRON="${requested}". Falling back to "${DEFAULT_SCHEDULE_CRON}" (daily schedule only: "<minute> <hour> * * *").`
  );
  return fallback;
}

function computeNextRun(now: Date, hour: number, minute: number): Date {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function readPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return defaultValue;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer (got "${raw}")`);
  }
  return value;
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`${name} must be a boolean-like value (got "${raw}")`);
}
