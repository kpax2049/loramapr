import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LorawanService } from '../lorawan/lorawan.service';
import { RetentionService } from '../retention/retention.service';
import { PrismaService } from '../../prisma/prisma.service';

type WorkerRuntimeStatus = {
  ok: boolean;
  lastRunAt?: Date;
  lastError?: string;
};

export type StatusResponse = {
  version: string;
  now: string;
  db: {
    ok: boolean;
    latencyMs?: number;
  };
  workers: {
    webhookProcessor: {
      ok: boolean;
      lastRunAt?: string;
      lastError?: string;
    };
    retention: {
      ok: boolean;
      lastRunAt?: string;
      lastError?: string;
    };
  };
  ingest: {
    latestWebhookReceivedAt: string | null;
    latestWebhookError: string | null;
  };
};

@Injectable()
export class StatusService {
  private readonly version = resolveAppVersion();

  constructor(
    private readonly prisma: PrismaService,
    private readonly lorawanService: LorawanService,
    private readonly retentionService: RetentionService
  ) {}

  async getStatus(): Promise<StatusResponse> {
    const db = await this.getDbStatus();
    const latestWebhook = db.ok
      ? await this.getLatestWebhookStatus()
      : {
          latestWebhookReceivedAt: null,
          latestWebhookError: null
        };

    return {
      version: this.version,
      now: new Date().toISOString(),
      db,
      workers: {
        webhookProcessor: formatWorkerStatus(this.lorawanService.getWorkerStatus()),
        retention: formatWorkerStatus(this.retentionService.getWorkerStatus())
      },
      ingest: latestWebhook
    };
  }

  private async getDbStatus(): Promise<{ ok: boolean; latencyMs?: number }> {
    const startedAt = process.hrtime.bigint();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      return {
        ok: true,
        latencyMs: Number(latencyMs.toFixed(2))
      };
    } catch {
      return { ok: false };
    }
  }

  private async getLatestWebhookStatus(): Promise<{
    latestWebhookReceivedAt: string | null;
    latestWebhookError: string | null;
  }> {
    try {
      const latestWebhook = await this.prisma.webhookEvent.findFirst({
        orderBy: { receivedAt: 'desc' },
        select: {
          receivedAt: true,
          processingError: true
        }
      });

      return {
        latestWebhookReceivedAt: latestWebhook?.receivedAt.toISOString() ?? null,
        latestWebhookError: latestWebhook?.processingError ?? null
      };
    } catch {
      return {
        latestWebhookReceivedAt: null,
        latestWebhookError: null
      };
    }
  }
}

function formatWorkerStatus(status: WorkerRuntimeStatus): {
  ok: boolean;
  lastRunAt?: string;
  lastError?: string;
} {
  return {
    ok: status.ok,
    lastRunAt: status.lastRunAt?.toISOString(),
    lastError: status.lastError
  };
}

function resolveAppVersion(): string {
  if (process.env.APP_VERSION && process.env.APP_VERSION.trim().length > 0) {
    return process.env.APP_VERSION.trim();
  }

  if (process.env.npm_package_version && process.env.npm_package_version.trim().length > 0) {
    return process.env.npm_package_version.trim();
  }

  try {
    const packageJsonPath = join(process.cwd(), 'package.json');
    const raw = readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim().length > 0) {
      return parsed.version.trim();
    }
  } catch {
    // Fall through to unknown.
  }

  return 'unknown';
}
