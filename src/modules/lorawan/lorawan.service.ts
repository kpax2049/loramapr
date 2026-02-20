import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, WebhookEventSource } from '@prisma/client';
import { logError, logInfo, logWarn } from '../../common/logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { MeasurementsService } from '../measurements/measurements.service';
import { normalizeTtsUplinkToMeasurement } from './tts-normalize';
import type { TtsUplink } from './tts-uplink.schema';
import { deriveUplinkId } from './uplink-id';

@Injectable()
export class LorawanService implements OnApplicationBootstrap, OnModuleDestroy {
  private workerTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly workerId = randomUUID();
  private readonly workerEnabled = isWorkerEnabled();
  private lastWorkerRunAt: Date | null = null;
  private lastWorkerError: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly measurementsService: MeasurementsService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.workerEnabled) {
      return;
    }
    await this.prisma.$queryRaw`SELECT 1`;
    if (this.workerTimer) {
      return;
    }
    this.workerTimer = setInterval(() => {
      void this.runWorkerOnce();
    }, 2000);
  }

  onModuleDestroy(): void {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  getWorkerStatus(): {
    ok: boolean;
    lastRunAt?: Date;
    lastError?: string;
  } {
    if (!this.workerEnabled) {
      return {
        ok: false,
        lastError: 'disabled'
      };
    }

    return {
      ok: this.lastWorkerError === null,
      lastRunAt: this.lastWorkerRunAt ?? undefined,
      lastError: this.lastWorkerError ?? undefined
    };
  }

  async enqueueUplink(parsed: TtsUplink): Promise<void> {
    const deviceUid =
      parsed.end_device_ids?.dev_eui ?? parsed.end_device_ids?.device_id ?? undefined;
    const uplinkId = deriveUplinkId(parsed);
    const portnum = getLorawanPortnum(parsed);

    try {
      await this.prisma.webhookEvent.create({
        data: {
          source: WebhookEventSource.LORAWAN,
          eventType: 'uplink',
          deviceUid,
          portnum,
          packetId: uplinkId,
          payloadJson: parsed as Prisma.InputJsonValue
        }
      });
      logInfo('webhook.ingest.accepted', {
        source: 'lorawan',
        deviceUid: deviceUid ?? null,
        uplinkId
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        logInfo('webhook.ingest.duplicate', {
          source: 'lorawan',
          deviceUid: deviceUid ?? null,
          uplinkId
        });
        return;
      }
      logError('webhook.ingest.failed', {
        source: 'lorawan',
        deviceUid: deviceUid ?? null,
        uplinkId,
        reason: getErrorMessage(error)
      });
      throw error;
    }
  }

  async listEvents(params: {
    deviceUid?: string;
    processingError?: string;
    processed?: boolean;
    limit: number;
    cursor?: Date;
  }) {
    const where: Record<string, unknown> = {};
    if (params.deviceUid) {
      where.deviceUid = params.deviceUid;
    }
    if (params.processingError) {
      where.error = params.processingError;
    }
    if (params.processed !== undefined) {
      where.processedAt = params.processed ? { not: null } : null;
    }
    if (params.cursor) {
      where.receivedAt = { lt: params.cursor };
    }
    return this.prisma.webhookEvent.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: params.limit,
      select: {
        id: true,
        receivedAt: true,
        processedAt: true,
        error: true,
        deviceUid: true,
        packetId: true
      }
    }).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        receivedAt: row.receivedAt,
        processedAt: row.processedAt,
        processingError: row.error,
        deviceUid: row.deviceUid,
        uplinkId: row.packetId
      }))
    );
  }

  async getEventById(id: string) {
    return this.prisma.webhookEvent.findUnique({
      where: { id },
      select: {
        id: true,
        payloadJson: true,
        receivedAt: true,
        processedAt: true,
        deviceUid: true,
        packetId: true,
        error: true
      }
    }).then((row) =>
      row
        ? {
            id: row.id,
            payload: row.payloadJson,
            receivedAt: row.receivedAt,
            processedAt: row.processedAt,
            deviceUid: row.deviceUid,
            uplinkId: row.packetId,
            processingError: row.error
          }
        : null
    );
  }

  async getSummary() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalEvents, processedEvents, unprocessedEvents, errorsByType, lastEvent, lastMeasurement] =
      await Promise.all([
        this.prisma.webhookEvent.count({
          where: { receivedAt: { gte: since } }
        }),
        this.prisma.webhookEvent.count({
          where: { receivedAt: { gte: since }, processedAt: { not: null } }
        }),
        this.prisma.webhookEvent.count({
          where: { processedAt: null }
        }),
        this.prisma.webhookEvent.groupBy({
          by: ['error'],
          where: {
            receivedAt: { gte: since },
            error: { not: null }
          },
          _count: { _all: true }
        }),
        this.prisma.webhookEvent.aggregate({
          _max: { receivedAt: true }
        }),
        this.prisma.measurement.aggregate({
          _max: { capturedAt: true }
        })
      ]);

    return {
      totalEvents,
      processedEvents,
      unprocessedEvents,
      errorsByType: errorsByType.map((row) => ({
        processingError: row.error as string,
        count: row._count._all
      })),
      lastEventReceivedAt: lastEvent._max.receivedAt ?? null,
      lastMeasurementCreatedAt: lastMeasurement._max.capturedAt ?? null
    };
  }

  async reprocessEvent(id: string): Promise<boolean> {
    const result = await this.prisma.webhookEvent.updateMany({
      where: { id },
      data: {
        processedAt: null,
        error: null,
        processingStartedAt: null,
        processingWorkerId: null
      }
    });
    return result.count > 0;
  }

  async reprocessEvents(params: {
    deviceUid?: string;
    since?: Date;
    processingError?: string;
    limit: number;
  }): Promise<number> {
    const where: Record<string, unknown> = {};
    if (params.deviceUid) {
      where.deviceUid = params.deviceUid;
    }
    if (params.processingError) {
      where.error = params.processingError;
    }
    if (params.since) {
      where.receivedAt = { gte: params.since };
    }

    const ids = await this.prisma.webhookEvent.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { receivedAt: 'asc' },
      take: params.limit,
      select: { id: true }
    });

    if (ids.length === 0) {
      return 0;
    }

    const result = await this.prisma.webhookEvent.updateMany({
      where: { id: { in: ids.map((row) => row.id) } },
      data: {
        processedAt: null,
        error: null,
        processingStartedAt: null,
        processingWorkerId: null
      }
    });

    return result.count;
  }

  private async runWorkerOnce(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    const runStartedAt = new Date();
    try {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);
      const claimed = await this.prisma.$transaction(async (tx) => {
        const candidates = await tx.webhookEvent.findMany({
          where: {
            processedAt: null,
            source: { in: [WebhookEventSource.LORAWAN, WebhookEventSource.MESHTASTIC] },
            OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleBefore } }]
          },
          orderBy: { receivedAt: 'asc' },
          take: 25,
          select: { id: true }
        });

        if (candidates.length === 0) {
          return [] as Array<{
            id: string;
            deviceUid: string | null;
            payloadJson: Prisma.JsonValue;
            source: WebhookEventSource;
            receivedAt: Date;
          }>;
        }

        const candidateIds = candidates.map((row) => row.id);
        await tx.webhookEvent.updateMany({
          where: {
            id: { in: candidateIds },
            processedAt: null,
            OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleBefore } }]
          },
          data: {
            processingStartedAt: now,
            processingWorkerId: this.workerId
          }
        });

        return tx.webhookEvent.findMany({
          where: {
            id: { in: candidateIds },
            processingWorkerId: this.workerId,
            processingStartedAt: now
          },
          select: {
            id: true,
            deviceUid: true,
            payloadJson: true,
            source: true,
            receivedAt: true
          }
        });
      });

      for (const event of claimed) {
        await this.processEvent(
          event.id,
          event.source,
          event.deviceUid ?? undefined,
          event.payloadJson,
          event.receivedAt
        );
      }
      this.lastWorkerError = null;
    } catch (error) {
      const message = getErrorMessage(error);
      this.lastWorkerError = message;
      logError('webhook.worker.failed', {
        source: 'lorawan',
        reason: message
      });
    } finally {
      this.lastWorkerRunAt = runStartedAt;
      this.isProcessing = false;
    }
  }

  private async processEvent(
    id: string,
    source: WebhookEventSource,
    deviceUid: string | undefined,
    payload: Prisma.JsonValue,
    receivedAt: Date
  ): Promise<void> {
    const processedAt = new Date();
    try {
      if (source === WebhookEventSource.MESHTASTIC) {
        await this.processMeshtasticEvent(id, deviceUid, payload, receivedAt, processedAt);
        return;
      }

      await this.processTtsEvent(id, deviceUid, payload, processedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'processing_failed';
      await this.prisma.webhookEvent.update({
        where: { id },
        data: {
          processedAt,
          error: message
        }
      });
      logError('webhook.normalize.failed', {
        source: normalizeSource(source),
        webhookEventId: id,
        deviceUid: deviceUid ?? null,
        reason: message
      });
    }
  }

  private async processTtsEvent(
    id: string,
    deviceUid: string | undefined,
    payload: Prisma.JsonValue,
    processedAt: Date
  ): Promise<void> {
    const parsed = payload as TtsUplink;
    const normalized = normalizeTtsUplinkToMeasurement(parsed);
    if (!normalized.ok) {
      await this.prisma.webhookEvent.update({
        where: { id },
        data: {
          processedAt,
          error: normalized.reason
        }
      });
      logWarn('webhook.normalize.rejected', {
        source: 'lorawan',
        webhookEventId: id,
        deviceUid: deviceUid ?? null,
        normalizedToMeasurement: false,
        reason: normalized.reason
      });
      return;
    }

    await this.measurementsService.ingestCanonical(deviceUid ?? normalized.item.deviceUid, [
      normalized.item
    ]);

    await this.prisma.webhookEvent.update({
      where: { id },
      data: {
        processedAt,
        error: null
      }
    });
    logInfo('webhook.normalize.accepted', {
      source: 'lorawan',
      webhookEventId: id,
      deviceUid: deviceUid ?? normalized.item.deviceUid,
      normalizedToMeasurement: true
    });
  }

  private async processMeshtasticEvent(
    id: string,
    deviceUid: string | undefined,
    payload: Prisma.JsonValue,
    receivedAt: Date,
    processedAt: Date
  ): Promise<void> {
    const nodeInfo = extractMeshtasticNodeInfo(payload);
    if (nodeInfo.found) {
      const resolvedNodeInfoDeviceUid = resolveNodeInfoDeviceUid(nodeInfo.deviceUid, deviceUid);
      if (resolvedNodeInfoDeviceUid !== 'unknown') {
        await this.upsertMeshtasticNodeInfo(
          resolvedNodeInfoDeviceUid,
          nodeInfo.fields,
          processedAt
        );
      }
      await this.prisma.webhookEvent.update({
        where: { id },
        data: {
          processedAt,
          error: null,
          deviceUid:
            resolvedNodeInfoDeviceUid !== 'unknown'
              ? resolvedNodeInfoDeviceUid
              : (deviceUid ?? null)
        }
      });
      logInfo('webhook.normalize.accepted', {
        source: 'meshtastic',
        webhookEventId: id,
        deviceUid:
          resolvedNodeInfoDeviceUid !== 'unknown'
            ? resolvedNodeInfoDeviceUid
            : (deviceUid ?? null),
        normalizedToMeasurement: false,
        reason: 'node_info'
      });
      return;
    }

    const normalized = normalizeMeshtasticPayload(payload, receivedAt);
    if (!normalized) {
      await this.prisma.webhookEvent.update({
        where: { id },
        data: {
          processedAt,
          error: 'missing_gps'
        }
      });
      logWarn('webhook.normalize.rejected', {
        source: 'meshtastic',
        webhookEventId: id,
        deviceUid: deviceUid ?? null,
        normalizedToMeasurement: false,
        reason: 'missing_gps'
      });
      return;
    }

    const effectiveDeviceUid = resolveNodeInfoDeviceUid(normalized.deviceUid, deviceUid);
    await this.measurementsService.ingestCanonical(effectiveDeviceUid, [
      {
        capturedAt: normalized.capturedAt,
        lat: normalized.lat,
        lon: normalized.lon,
        rssi: normalized.rssi,
        snr: normalized.snr,
        gatewayId: normalized.gatewayId ?? undefined,
        rxMetadata: normalized.rxMetadata,
        payloadRaw: normalized.payloadRaw
      }
    ]);

    await this.prisma.webhookEvent.update({
      where: { id },
      data: {
        processedAt,
        error: null
      }
    });
    logInfo('webhook.normalize.accepted', {
      source: 'meshtastic',
      webhookEventId: id,
      deviceUid: effectiveDeviceUid,
      normalizedToMeasurement: true
    });
  }

  private async upsertMeshtasticNodeInfo(
    deviceUid: string,
    fields: MeshtasticNodeInfoFields,
    timestamp: Date
  ): Promise<void> {
    // Keep icon mapping frontend-driven unless the user explicitly overrides it.
    // This worker intentionally does not set iconKey from Meshtastic metadata.
    const updateData: Prisma.DeviceUpdateInput = {
      lastSeenAt: timestamp,
      lastNodeInfoAt: timestamp
    };
    const createData: Prisma.DeviceCreateInput = {
      deviceUid,
      lastSeenAt: timestamp,
      lastNodeInfoAt: timestamp,
      iconOverride: false
    };

    if (fields.hwModel !== undefined) {
      updateData.hwModel = fields.hwModel;
      createData.hwModel = fields.hwModel;
    }
    if (fields.meshtasticNodeId !== undefined) {
      updateData.meshtasticNodeId = fields.meshtasticNodeId;
      createData.meshtasticNodeId = fields.meshtasticNodeId;
    }
    if (fields.firmwareVersion !== undefined) {
      updateData.firmwareVersion = fields.firmwareVersion;
      createData.firmwareVersion = fields.firmwareVersion;
    }
    if (fields.appVersion !== undefined) {
      updateData.appVersion = fields.appVersion;
      createData.appVersion = fields.appVersion;
    }
    if (fields.longName !== undefined) {
      updateData.longName = fields.longName;
      createData.longName = fields.longName;
    }
    if (fields.shortName !== undefined) {
      updateData.shortName = fields.shortName;
      createData.shortName = fields.shortName;
    }
    if (fields.macaddr !== undefined) {
      updateData.macaddr = fields.macaddr;
      createData.macaddr = fields.macaddr;
    }
    if (fields.publicKey !== undefined) {
      updateData.publicKey = fields.publicKey;
      createData.publicKey = fields.publicKey;
    }
    if (fields.isUnmessagable !== undefined) {
      updateData.isUnmessagable = fields.isUnmessagable;
      createData.isUnmessagable = fields.isUnmessagable;
    }
    if (fields.role !== undefined) {
      updateData.role = fields.role;
      createData.role = fields.role;
    }

    await this.prisma.device.upsert({
      where: { deviceUid },
      update: updateData,
      create: createData
    });
  }
}

type MeshtasticNormalized = {
  deviceUid: string;
  capturedAt: Date;
  lat: number;
  lon: number;
  rssi?: number;
  snr?: number;
  gatewayId?: string | null;
  rxMetadata?: Array<{
    nodeId: string;
    rssi?: number;
    snr?: number;
    hop?: number;
  }>;
  payloadRaw: Record<string, unknown>;
};

type MeshtasticNodeInfoFields = {
  meshtasticNodeId?: string;
  hwModel?: string;
  firmwareVersion?: string;
  appVersion?: string;
  longName?: string;
  shortName?: string;
  macaddr?: string;
  publicKey?: string;
  isUnmessagable?: boolean;
  role?: string;
};

type MeshtasticNodeInfoDetected = {
  found: boolean;
  deviceUid?: string;
  fields: MeshtasticNodeInfoFields;
};

type MeshtasticNodeInfoPacket = {
  packet: Record<string, unknown>;
  user: Record<string, unknown>;
};

function normalizeMeshtasticPayload(
  payload: Prisma.JsonValue,
  receivedAt: Date
): MeshtasticNormalized | null {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  if (!record) {
    return null;
  }

  const position = extractPosition(record);
  if (!position) {
    return null;
  }

  const lat = normalizeCoordinate(position.lat, 90);
  const lon = normalizeCoordinate(position.lon, 180);
  if (lat === null || lon === null) {
    return null;
  }

  const rssi = findFirstMeshtasticNumber(record, ['rxRssi', 'rx_rssi', 'rssi']);
  const snr = findFirstMeshtasticNumber(record, ['rxSnr', 'rx_snr', 'snr']);
  const gatewayId = getGatewayId(record);
  const rxMetadata = buildMeshtasticRxMetadata(record, gatewayId, rssi, snr);

  const capturedAt = resolveCapturedAt(record, receivedAt);
  const deviceUid = getMeshtasticDeviceUid(record);

  return {
    deviceUid,
    capturedAt,
    lat,
    lon,
    rssi: rssi ?? undefined,
    snr: snr ?? undefined,
    gatewayId: gatewayId ?? null,
    rxMetadata,
    payloadRaw: record
  };
}

function extractMeshtasticNodeInfo(payload: Prisma.JsonValue): MeshtasticNodeInfoDetected {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  if (!record) {
    return {
      found: false,
      fields: {}
    };
  }

  const nodeInfoPacket = findNodeInfoPacket(record);
  if (!nodeInfoPacket) {
    return {
      found: false,
      fields: {}
    };
  }

  const fromId = readStringField(nodeInfoPacket.packet, ['fromId', 'from_id']);
  const from = readStringField(nodeInfoPacket.packet, ['from']);
  const userId = readStringField(nodeInfoPacket.user, ['id', 'nodeId', 'node_id']);

  // Node id metadata can come from decoded.user.id, fromId, or from.
  const nodeId = resolveNodeInfoDeviceUid(userId, fromId, from);
  // Device resolution prefers fromId over decoded.user.id, then from.
  const resolvedDeviceUid = resolveNodeInfoDeviceUid(fromId, userId, from);

  const fields: MeshtasticNodeInfoFields = {};
  if (nodeId !== 'unknown') {
    fields.meshtasticNodeId = nodeId;
  }

  const hwModel = readStringField(nodeInfoPacket.user, ['hwModel', 'hardwareModel']);
  if (hwModel !== undefined) {
    fields.hwModel = hwModel;
  }

  const firmwareVersion = readStringField(nodeInfoPacket.user, [
    'firmwareversion',
    'firmware',
    'fwversion',
    'fwver'
  ]);
  if (firmwareVersion !== undefined) {
    fields.firmwareVersion = firmwareVersion;
  }

  const appVersion = readStringField(nodeInfoPacket.user, ['appVersion', 'appVer']);
  if (appVersion !== undefined) {
    fields.appVersion = appVersion;
  }

  const longName = readStringField(nodeInfoPacket.user, ['longName']);
  if (longName !== undefined) {
    fields.longName = longName;
  }

  const shortName = readStringField(nodeInfoPacket.user, ['shortName']);
  if (shortName !== undefined) {
    fields.shortName = shortName;
  }

  const macaddr = readStringField(nodeInfoPacket.user, ['macaddr', 'macAddr', 'mac_address']);
  if (macaddr !== undefined) {
    fields.macaddr = macaddr;
  }

  const publicKey = readStringField(nodeInfoPacket.user, ['publicKey', 'public_key']);
  if (publicKey !== undefined) {
    fields.publicKey = publicKey;
  }

  const isUnmessagable = readBooleanField(nodeInfoPacket.user, [
    'isUnmessagable',
    'is_unmessagable',
    'unmessagable'
  ]);
  if (isUnmessagable !== undefined) {
    fields.isUnmessagable = isUnmessagable;
  }

  const role = readStringField(nodeInfoPacket.user, ['role']);
  if (role !== undefined) {
    fields.role = role;
  }

  return {
    found: true,
    deviceUid: resolvedDeviceUid !== 'unknown' ? resolvedDeviceUid : undefined,
    fields
  };
}

function findNodeInfoPacket(root: Record<string, unknown>): MeshtasticNodeInfoPacket | null {
  const stack: unknown[] = [root];
  const seen = new Set<Record<string, unknown>>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }

    if (Array.isArray(current)) {
      for (const entry of current) {
        stack.push(entry);
      }
      continue;
    }

    const record = current as Record<string, unknown>;
    if (seen.has(record)) {
      continue;
    }
    seen.add(record);

    const decoded = asRecord(record.decoded);
    const user = decoded ? asRecord(decoded.user) : null;
    const portnum = decoded ? readStringField(decoded, ['portnum']) : undefined;
    if (user && portnum === 'NODEINFO_APP') {
      return { packet: record, user };
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  return null;
}

function readStringField(record: Record<string, unknown>, aliases: string[]): string | undefined {
  const aliasSet = new Set(aliases.map((key) => normalizeLookupKey(key)));
  for (const [key, value] of Object.entries(record)) {
    if (!aliasSet.has(normalizeLookupKey(key))) {
      continue;
    }
    const normalized = toNonEmptyString(value);
    if (normalized !== null) {
      return normalized;
    }
  }
  return undefined;
}

function readBooleanField(record: Record<string, unknown>, aliases: string[]): boolean | undefined {
  const aliasSet = new Set(aliases.map((key) => normalizeLookupKey(key)));
  for (const [key, value] of Object.entries(record)) {
    if (!aliasSet.has(normalizeLookupKey(key))) {
      continue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
    if (typeof value === 'number') {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
    }
  }
  return undefined;
}

function resolveNodeInfoDeviceUid(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0 && trimmed !== 'unknown') {
      return trimmed;
    }
  }
  return 'unknown';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizeLookupKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, '');
}

function extractPosition(record: Record<string, unknown>): { lat: number; lon: number } | null {
  const candidates = collectMeshtasticRecords(record);
  for (const candidate of candidates) {
    const pairs: Array<[string, string]> = [
      ['lat', 'lon'],
      ['latitude', 'longitude'],
      ['latitudeI', 'longitudeI'],
      ['latitude_i', 'longitude_i']
    ];

    for (const [latKey, lonKey] of pairs) {
      const lat = getNumber(candidate[latKey]);
      const lon = getNumber(candidate[lonKey]);
      if (lat !== null && lon !== null) {
        return { lat, lon };
      }
    }
  }

  return null;
}

function resolveCapturedAt(record: Record<string, unknown>, receivedAt: Date): Date {
  const captured = findFirstMeshtasticNumber(record, [
    'time',
    'timestamp',
    'rxTime',
    'rx_time',
    'capturedAt',
    'captured_at'
  ]);
  if (captured !== null) {
    return new Date(toEpochMs(captured));
  }
  return receivedAt;
}

function getMeshtasticDeviceUid(record: Record<string, unknown>): string {
  const deviceUid = findFirstMeshtasticString(record, [
    'fromId',
    'from_id',
    'from',
    'nodeId',
    'node_id'
  ]);
  if (deviceUid !== null) {
    return deviceUid;
  }
  return 'unknown';
}

function getGatewayId(record: Record<string, unknown>): string | null {
  return findFirstMeshtasticString(record, [
    'rxNodeId',
    'rx_node_id',
    'receiver',
    'via',
    'relayNode',
    'relay_node'
  ]);
}

function buildMeshtasticRxMetadata(
  record: Record<string, unknown>,
  gatewayId: string | null,
  rssi: number | null,
  snr: number | null
): Array<{ nodeId: string; rssi?: number; snr?: number; hop?: number }> | undefined {
  const entries: Array<{ nodeId: string; rssi?: number; snr?: number; hop?: number }> = [];
  const seen = new Set<string>();

  const addEntry = (entry: { nodeId: string; rssi?: number; snr?: number; hop?: number } | null) => {
    if (!entry) {
      return;
    }
    const key = `${entry.nodeId}|${entry.hop ?? ''}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    entries.push(entry);
  };

  const primaryHop = getNumber(record.hop);
  addEntry(
    gatewayId
      ? {
          nodeId: gatewayId,
          rssi: rssi ?? undefined,
          snr: snr ?? undefined,
          hop: primaryHop !== null ? Math.trunc(primaryHop) : undefined
        }
      : null
  );

  const hops = record.hops;
  if (Array.isArray(hops)) {
    for (const hopEntry of hops) {
      addEntry(buildRxEntryFromUnknown(hopEntry));
    }
  }

  const relays = record.relays ?? record.route;
  if (Array.isArray(relays)) {
    for (const relayEntry of relays) {
      addEntry(buildRxEntryFromUnknown(relayEntry));
    }
  }

  return entries.length > 0 ? entries : undefined;
}

function buildRxEntryFromUnknown(
  value: unknown
): { nodeId: string; rssi?: number; snr?: number; hop?: number } | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return { nodeId: value };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { nodeId: String(value) };
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const nodeId = pickNodeId(record);
  if (!nodeId) {
    return null;
  }
  const rssi = getNumber(record.rssi);
  const snr = getNumber(record.snr);
  const hop = getNumber(record.hop);

  const entry: { nodeId: string; rssi?: number; snr?: number; hop?: number } = { nodeId };
  if (rssi !== null) {
    entry.rssi = rssi;
  }
  if (snr !== null) {
    entry.snr = snr;
  }
  if (hop !== null) {
    entry.hop = Math.trunc(hop);
  }
  return entry;
}

function pickNodeId(record: Record<string, unknown>): string | null {
  const candidates = [
    record.rxNodeId,
    record.nodeId,
    record.receiver,
    record.via,
    record.from,
    record.id
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return null;
}

function normalizeCoordinate(value: number, limit: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const abs = Math.abs(value);
  if (abs > limit || (Number.isInteger(value) && abs >= 1_000_000)) {
    return value / 1e7;
  }
  return value;
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function findFirstMeshtasticNumber(record: Record<string, unknown>, keys: string[]): number | null {
  const candidates = collectMeshtasticRecords(record);
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = getNumber(candidate[key]);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
}

function findFirstMeshtasticString(record: Record<string, unknown>, keys: string[]): string | null {
  const candidates = collectMeshtasticRecords(record);
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = toNonEmptyString(candidate[key]);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
}

function toEpochMs(value: number): number {
  if (Math.abs(value) >= 1_000_000_000_000) {
    return value;
  }
  return value * 1000;
}

function collectMeshtasticRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const preferred: Array<Record<string, unknown>> = [];
  const addPreferred = (value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      preferred.push(value as Record<string, unknown>);
    }
  };

  addPreferred(root);
  addPreferred(root.position);
  addPreferred(root.decoded);
  if (root.decoded && typeof root.decoded === 'object' && !Array.isArray(root.decoded)) {
    const decoded = root.decoded as Record<string, unknown>;
    addPreferred(decoded.position);
    addPreferred(decoded.user);
    addPreferred(decoded.telemetry);
  }
  addPreferred(root.payload);
  if (root.payload && typeof root.payload === 'object' && !Array.isArray(root.payload)) {
    const payload = root.payload as Record<string, unknown>;
    addPreferred(payload.position);
    addPreferred(payload.decoded);
    if (payload.decoded && typeof payload.decoded === 'object' && !Array.isArray(payload.decoded)) {
      const payloadDecoded = payload.decoded as Record<string, unknown>;
      addPreferred(payloadDecoded.position);
      addPreferred(payloadDecoded.user);
      addPreferred(payloadDecoded.telemetry);
    }
  }

  const stack: unknown[] = [root];
  const all: Array<Record<string, unknown>> = [];
  const seen = new Set<Record<string, unknown>>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (Array.isArray(current)) {
      for (const entry of current) {
        stack.push(entry);
      }
      continue;
    }
    const asRecord = current as Record<string, unknown>;
    if (seen.has(asRecord)) {
      continue;
    }
    seen.add(asRecord);
    all.push(asRecord);
    for (const value of Object.values(asRecord)) {
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  const ordered: Array<Record<string, unknown>> = [];
  const orderedSeen = new Set<Record<string, unknown>>();
  for (const candidate of [...preferred, ...all]) {
    if (orderedSeen.has(candidate)) {
      continue;
    }
    orderedSeen.add(candidate);
    ordered.push(candidate);
  }
  return ordered;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function isWorkerEnabled(): boolean {
  const flag = process.env.LORAWAN_WORKER_ENABLED;
  if (flag === undefined || flag === '') {
    return true;
  }
  return flag.toLowerCase() === 'true';
}

function getLorawanPortnum(payload: TtsUplink): string | null {
  const fPort = payload.uplink_message?.f_port;
  if (typeof fPort === 'number' && Number.isFinite(fPort)) {
    return String(Math.trunc(fPort));
  }
  return null;
}

function normalizeSource(source: WebhookEventSource): 'lorawan' | 'meshtastic' | 'agent' {
  if (source === WebhookEventSource.MESHTASTIC) {
    return 'meshtastic';
  }
  if (source === WebhookEventSource.AGENT) {
    return 'agent';
  }
  return 'lorawan';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
