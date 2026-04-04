import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, WebhookEventSource } from '@prisma/client';
import { BIN_SIZE_DEG } from '../coverage/coverage.constants';

export type EventsSource = 'meshtastic' | 'lorawan' | 'agent' | 'sim';

export type EventsCursor = {
  receivedAt: Date;
  id: string;
};

export type ListEventsParams = {
  source?: EventsSource;
  deviceUid?: string;
  portnum?: string;
  since?: Date;
  until?: Date;
  q?: string;
  limit: number;
  cursor?: EventsCursor;
};

export type EventListItem = {
  id: string;
  source: EventsSource;
  receivedAt: Date;
  deviceUid: string | null;
  portnum: string | null;
  packetId: string | null;
  rxRssi: number | null;
  rxSnr: number | null;
  hopLimit: number | null;
  relayNode: string | null;
  transportMechanism: string | null;
  batteryLevel: number | null;
  voltage: number | null;
  hwModel: string | null;
  shortName: string | null;
  lat: number | null;
  lon: number | null;
  time: string | null;
};

export type EventDetail = {
  id: string;
  source: EventsSource;
  receivedAt: Date;
  processedAt: Date | null;
  deviceUid: string | null;
  portnum: string | null;
  packetId: string | null;
  eventType: string | null;
  error: string | null;
  payloadJson: Prisma.JsonValue;
};

export type EventsListResponse = {
  items: EventListItem[];
  nextCursor?: string;
  returnedCount: number;
  totalFilteredCount?: number;
};

export type RecoverSessionPreview = {
  selectedEventCount: number;
  eligibleEventCount: number;
  eligibleMeasurementCount: number;
  alreadyAssignedEventCount: number;
  incompatibleEventCount: number;
  warningCount: number;
  warnings: string[];
  blockingErrors: string[];
  canCreate: boolean;
  startTime: string | null;
  endTime: string | null;
  durationMs: number | null;
  inferredDeviceId: string | null;
  inferredDeviceUid: string | null;
  inferredDeviceName: string | null;
  mixedRawDevices: boolean;
  mixedMeasurementDevices: boolean;
  hasLargeTimeGap: boolean;
  maxGapMs: number | null;
  defaultSessionName: string | null;
};

export type RecoverSessionResult = {
  sessionId: string;
  deviceId: string;
  deviceUid: string | null;
  sessionName: string | null;
  selectedEventCount: number;
  attachedEventCount: number;
  attachedMeasurementCount: number;
  startTime: string;
  endTime: string;
  durationMs: number;
};

type RecoverSessionSummaryInternal = RecoverSessionPreview & {
  startAt: Date | null;
  endAt: Date | null;
  eligibleMeasurementIds: string[];
  affectedDays: Date[];
};

const LARGE_SELECTION_GAP_MS = 20 * 60 * 1000;
const MAX_RECOVERY_EVENT_IDS = 500;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListEventsParams): Promise<EventsListResponse> {
    if (params.q) {
      return this.listWithSearch(params);
    }

    const where = buildWhereClause(params);
    const countWhere = buildWhereClause({
      ...params,
      cursor: undefined
    });
    const [rows, totalFilteredCount] = await Promise.all([
      this.prisma.webhookEvent.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        take: params.limit + 1,
        select: {
          id: true,
          source: true,
          receivedAt: true,
          deviceUid: true,
          portnum: true,
          packetId: true,
          payloadJson: true
        }
      }),
      this.prisma.webhookEvent.count({
        where: countWhere
      })
    ]);

    const hasMore = rows.length > params.limit;
    const sliced = hasMore ? rows.slice(0, params.limit) : rows;
    const items = sliced.map((row) => formatListItem(row));

    if (!hasMore || items.length === 0) {
      return {
        items,
        returnedCount: items.length,
        totalFilteredCount
      };
    }

    const last = items[items.length - 1];
    return {
      items,
      returnedCount: items.length,
      totalFilteredCount,
      nextCursor: encodeCursor({
        receivedAt: last.receivedAt,
        id: last.id
      })
    };
  }

  private async listWithSearch(params: ListEventsParams): Promise<EventsListResponse> {
    const q = params.q?.trim();
    if (!q) {
      return { items: [], returnedCount: 0 };
    }

    const qLike = `%${escapeLikePattern(q)}%`;
    const conditions: Prisma.Sql[] = [];

    if (params.source) {
      conditions.push(
        Prisma.sql`"source" = ${normalizeSourceForDb(params.source)}::"WebhookEventSource"`
      );
    }
    if (params.deviceUid) {
      conditions.push(Prisma.sql`"deviceUid" = ${params.deviceUid}`);
    }
    if (params.portnum) {
      conditions.push(Prisma.sql`"portnum" = ${params.portnum}`);
    }
    if (params.since) {
      conditions.push(Prisma.sql`"receivedAt" >= ${params.since}`);
    }
    if (params.until) {
      conditions.push(Prisma.sql`"receivedAt" <= ${params.until}`);
    }
    if (params.cursor) {
      conditions.push(
        Prisma.sql`("receivedAt" < ${params.cursor.receivedAt} OR ("receivedAt" = ${params.cursor.receivedAt} AND "id" < ${params.cursor.id}))`
      );
    }

    conditions.push(
      Prisma.sql`(
        "deviceUid" ILIKE ${qLike} ESCAPE '\\'
        OR "portnum" ILIKE ${qLike} ESCAPE '\\'
        OR "uplinkId" ILIKE ${qLike} ESCAPE '\\'
        OR to_tsvector('english', COALESCE("payloadText", '')) @@ plainto_tsquery('english', ${q})
      )`
    );

    const whereSql =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        source: WebhookEventSource;
        receivedAt: Date;
        deviceUid: string | null;
        portnum: string | null;
        packetId: string | null;
        payloadJson: Prisma.JsonValue;
      }>
    >(Prisma.sql`
      SELECT
        "id",
        "source",
        "receivedAt",
        "deviceUid",
        "portnum",
        "uplinkId" AS "packetId",
        "payload" AS "payloadJson"
      FROM "WebhookEvent"
      ${whereSql}
      ORDER BY "receivedAt" DESC, "id" DESC
      LIMIT ${params.limit + 1}
    `);

    const hasMore = rows.length > params.limit;
    const sliced = hasMore ? rows.slice(0, params.limit) : rows;
    const items = sliced.map((row) => formatListItem(row));

    if (!hasMore || items.length === 0) {
      return {
        items,
        returnedCount: items.length
      };
    }

    const last = items[items.length - 1];
    return {
      items,
      returnedCount: items.length,
      nextCursor: encodeCursor({
        receivedAt: last.receivedAt,
        id: last.id
      })
    };
  }

  async getById(id: string): Promise<EventDetail | null> {
    const row = await this.prisma.webhookEvent.findUnique({
      where: { id },
      select: {
        id: true,
        source: true,
        receivedAt: true,
        processedAt: true,
        deviceUid: true,
        portnum: true,
        packetId: true,
        eventType: true,
        error: true,
        payloadJson: true
      }
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      source: normalizeSourceForApi(row.source),
      receivedAt: row.receivedAt,
      processedAt: row.processedAt,
      deviceUid: row.deviceUid,
      portnum: row.portnum,
      packetId: row.packetId,
      eventType: row.eventType,
      error: row.error,
      payloadJson: row.payloadJson
    };
  }

  async previewRecoverSessionFromEvents(params: {
    eventIds: string[];
    ownerId?: string;
  }): Promise<RecoverSessionPreview> {
    return this.prisma.$transaction(async (tx) => {
      const summary = await this.buildRecoverSessionSummary(tx, params);
      return toRecoverSessionPreview(summary);
    });
  }

  async createSessionFromSelectedEvents(params: {
    eventIds: string[];
    ownerId?: string;
    name?: string;
    notes?: string;
  }): Promise<RecoverSessionResult> {
    return this.prisma.$transaction(async (tx) => {
      const summary = await this.buildRecoverSessionSummary(tx, params);

      if (!summary.canCreate) {
        throw new BadRequestException(summary.blockingErrors.join(' '));
      }
      if (!summary.startAt || !summary.endAt || !summary.inferredDeviceId) {
        throw new BadRequestException('Could not infer a valid session window and device');
      }

      const createdSession = await tx.session.create({
        data: {
          deviceId: summary.inferredDeviceId,
          name: normalizeOptionalText(params.name) ?? summary.defaultSessionName ?? undefined,
          notes: normalizeOptionalText(params.notes),
          startedAt: summary.startAt,
          endedAt: summary.endAt
        },
        select: {
          id: true,
          deviceId: true,
          name: true
        }
      });

      const updated = await tx.measurement.updateMany({
        where: {
          id: { in: summary.eligibleMeasurementIds },
          sessionId: null
        },
        data: {
          sessionId: createdSession.id
        }
      });

      if (updated.count !== summary.eligibleMeasurementIds.length) {
        throw new BadRequestException(
          'Selected events changed while recovering. Refresh the selection and try again.'
        );
      }

      await this.rebuildCoverageBinsForRecoveredSession(tx, {
        deviceId: createdSession.deviceId,
        newSessionId: createdSession.id,
        affectedDays: summary.affectedDays
      });

      const attachedEventCount = summary.eligibleEventCount;
      const attachedMeasurementCount = summary.eligibleMeasurementCount;
      const durationMs = Math.max(0, summary.endAt.getTime() - summary.startAt.getTime());

      return {
        sessionId: createdSession.id,
        deviceId: createdSession.deviceId,
        deviceUid: summary.inferredDeviceUid,
        sessionName: createdSession.name ?? null,
        selectedEventCount: summary.selectedEventCount,
        attachedEventCount,
        attachedMeasurementCount,
        startTime: summary.startAt.toISOString(),
        endTime: summary.endAt.toISOString(),
        durationMs
      };
    });
  }

  private async buildRecoverSessionSummary(
    tx: Prisma.TransactionClient,
    params: { eventIds: string[]; ownerId?: string }
  ): Promise<RecoverSessionSummaryInternal> {
    const eventIds = normalizeEventIdSelection(params.eventIds);

    const events = await tx.webhookEvent.findMany({
      where: {
        id: { in: eventIds }
      },
      select: {
        id: true,
        receivedAt: true,
        deviceUid: true
      }
    });

    if (events.length !== eventIds.length) {
      const foundIds = new Set(events.map((event) => event.id));
      const missing = eventIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Some selected events were not found: ${missing.slice(0, 5).join(', ')}`
      );
    }

    const eventById = new Map(events.map((event) => [event.id, event]));
    const orderedEvents = eventIds.map((id) => eventById.get(id)).filter(Boolean) as Array<{
      id: string;
      receivedAt: Date;
      deviceUid: string | null;
    }>;

    const measurements = await tx.measurement.findMany({
      where: {
        sourceEventId: {
          in: eventIds
        }
      },
      select: {
        id: true,
        sourceEventId: true,
        sessionId: true,
        deviceId: true,
        capturedAt: true,
        lat: true,
        lon: true,
        gatewayId: true,
        rssi: true,
        snr: true,
        device: {
          select: {
            id: true,
            deviceUid: true,
            name: true,
            ownerId: true
          }
        }
      }
    });

    const measurementsByEventId = new Map<string, typeof measurements>();
    for (const measurement of measurements) {
      const sourceEventId = measurement.sourceEventId;
      if (!sourceEventId) {
        continue;
      }
      const current = measurementsByEventId.get(sourceEventId);
      if (current) {
        current.push(measurement);
      } else {
        measurementsByEventId.set(sourceEventId, [measurement]);
      }
    }

    await this.assertRecoverSelectionOwnerScope(tx, {
      ownerId: params.ownerId,
      selectedEvents: orderedEvents,
      measurementsByEventId
    });

    let earliest: Date | null = null;
    let latest: Date | null = null;
    for (const event of orderedEvents) {
      if (!earliest || event.receivedAt < earliest) {
        earliest = event.receivedAt;
      }
      if (!latest || event.receivedAt > latest) {
        latest = event.receivedAt;
      }
    }

    const alreadyAssignedEventIds = new Set<string>();
    const incompatibleEventIds = new Set<string>();
    const eligibleMeasurements: typeof measurements = [];
    const eligibleEventIds = new Set<string>();

    for (const event of orderedEvents) {
      const eventMeasurements = measurementsByEventId.get(event.id) ?? [];
      if (eventMeasurements.length === 0) {
        incompatibleEventIds.add(event.id);
        continue;
      }

      let hasAssigned = false;
      for (const measurement of eventMeasurements) {
        if (measurement.sessionId) {
          hasAssigned = true;
        } else {
          eligibleMeasurements.push(measurement);
          eligibleEventIds.add(event.id);
        }
      }
      if (hasAssigned) {
        alreadyAssignedEventIds.add(event.id);
      }
    }

    const eligibleMeasurementIds = eligibleMeasurements.map((measurement) => measurement.id);

    const eligibleDeviceIds = new Set(eligibleMeasurements.map((measurement) => measurement.deviceId));
    const mixedMeasurementDevices = eligibleDeviceIds.size > 1;
    const inferredDevice =
      eligibleMeasurements.length > 0 && eligibleDeviceIds.size === 1
        ? eligibleMeasurements[0].device
        : null;

    const rawDeviceUids = new Set(
      orderedEvents
        .map((event) => normalizeOptionalText(event.deviceUid))
        .filter((value): value is string => Boolean(value))
    );
    const mixedRawDevices = rawDeviceUids.size > 1;

    const maxGapMs = computeMaxGapMs(orderedEvents);
    const hasLargeTimeGap = maxGapMs !== null && maxGapMs >= LARGE_SELECTION_GAP_MS;

    const warnings: string[] = [];
    if (alreadyAssignedEventIds.size > 0) {
      warnings.push(
        `${alreadyAssignedEventIds.size} selected event${alreadyAssignedEventIds.size === 1 ? '' : 's'} already assigned to another session`
      );
    }
    if (incompatibleEventIds.size > 0) {
      warnings.push(
        `${incompatibleEventIds.size} selected event${incompatibleEventIds.size === 1 ? '' : 's'} have no usable location measurement`
      );
    }
    if (mixedRawDevices) {
      warnings.push('Selection includes multiple raw device identifiers');
    }
    if (hasLargeTimeGap && maxGapMs !== null) {
      warnings.push(`Selection includes a large internal time gap (${formatDuration(maxGapMs)})`);
    }

    const blockingErrors: string[] = [];
    if (alreadyAssignedEventIds.size > 0) {
      blockingErrors.push(
        'Some selected events are already assigned to another session. Adjust selection and retry.'
      );
    }
    if (eligibleMeasurements.length === 0) {
      blockingErrors.push('No usable route/location events found in this selection.');
    }
    if (mixedMeasurementDevices) {
      blockingErrors.push('Selected events resolve to multiple devices. Use a single-device range.');
    }

    const durationMs =
      earliest && latest ? Math.max(0, latest.getTime() - earliest.getTime()) : null;
    const affectedDays = Array.from(
      new Set(
        eligibleMeasurements
          .map((measurement) => startOfUtcDay(measurement.capturedAt).toISOString())
      )
    ).map((isoValue) => new Date(isoValue));

    const preview: RecoverSessionSummaryInternal = {
      selectedEventCount: orderedEvents.length,
      eligibleEventCount: eligibleEventIds.size,
      eligibleMeasurementCount: eligibleMeasurements.length,
      alreadyAssignedEventCount: alreadyAssignedEventIds.size,
      incompatibleEventCount: incompatibleEventIds.size,
      warningCount: warnings.length,
      warnings,
      blockingErrors,
      canCreate: blockingErrors.length === 0,
      startTime: earliest ? earliest.toISOString() : null,
      endTime: latest ? latest.toISOString() : null,
      durationMs,
      inferredDeviceId: inferredDevice?.id ?? null,
      inferredDeviceUid: inferredDevice?.deviceUid ?? null,
      inferredDeviceName: inferredDevice?.name ?? null,
      mixedRawDevices,
      mixedMeasurementDevices,
      hasLargeTimeGap,
      maxGapMs,
      defaultSessionName:
        earliest && latest ? buildRecoverDefaultSessionName(earliest, latest) : null,
      startAt: earliest,
      endAt: latest,
      eligibleMeasurementIds,
      affectedDays
    };

    return preview;
  }

  private async assertRecoverSelectionOwnerScope(
    tx: Prisma.TransactionClient,
    params: {
      ownerId?: string;
      selectedEvents: Array<{
        id: string;
        receivedAt: Date;
        deviceUid: string | null;
      }>;
      measurementsByEventId: Map<
        string,
        Array<{
          id: string;
          sourceEventId: string | null;
          sessionId: string | null;
          deviceId: string;
          capturedAt: Date;
          lat: number;
          lon: number;
          gatewayId: string | null;
          rssi: number | null;
          snr: number | null;
          device: {
            id: string;
            deviceUid: string;
            name: string | null;
            ownerId: string | null;
          };
        }>
      >;
    }
  ): Promise<void> {
    if (!params.ownerId) {
      return;
    }

    const eventDeviceUids = Array.from(
      new Set(
        params.selectedEvents
          .map((event) => normalizeOptionalText(event.deviceUid))
          .filter((value): value is string => Boolean(value))
      )
    );

    const devices = eventDeviceUids.length
      ? await tx.device.findMany({
          where: {
            deviceUid: { in: eventDeviceUids }
          },
          select: {
            deviceUid: true,
            ownerId: true
          }
        })
      : [];
    const ownerByDeviceUid = new Map(devices.map((device) => [device.deviceUid, device.ownerId]));

    for (const event of params.selectedEvents) {
      const ownerCandidates = new Set<string | null>();
      const measurements = params.measurementsByEventId.get(event.id) ?? [];
      for (const measurement of measurements) {
        ownerCandidates.add(measurement.device.ownerId ?? null);
      }

      const eventDeviceUid = normalizeOptionalText(event.deviceUid);
      if (eventDeviceUid) {
        ownerCandidates.add(ownerByDeviceUid.get(eventDeviceUid) ?? null);
      }

      if (ownerCandidates.size === 0) {
        throw new BadRequestException(
          `Could not verify ownership for selected event ${event.id}`
        );
      }
      if (
        Array.from(ownerCandidates).some(
          (ownerCandidate) => ownerCandidate !== params.ownerId
        )
      ) {
        throw new BadRequestException(
          'Selected events include data outside the current owner scope'
        );
      }
    }
  }

  private async rebuildCoverageBinsForRecoveredSession(
    tx: Prisma.TransactionClient,
    params: {
      deviceId: string;
      newSessionId: string;
      affectedDays: Date[];
    }
  ): Promise<void> {
    if (params.affectedDays.length === 0) {
      return;
    }

    for (const day of params.affectedDays) {
      const dayStart = startOfUtcDay(day);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      await tx.coverageBin.deleteMany({
        where: {
          deviceId: params.deviceId,
          day: dayStart,
          OR: [{ sessionId: null }, { sessionId: params.newSessionId }]
        }
      });

      const measurements = await tx.measurement.findMany({
        where: {
          deviceId: params.deviceId,
          capturedAt: { gte: dayStart, lt: dayEnd },
          OR: [{ sessionId: null }, { sessionId: params.newSessionId }]
        },
        select: {
          sessionId: true,
          gatewayId: true,
          lat: true,
          lon: true,
          rssi: true,
          snr: true
        }
      });

      if (measurements.length === 0) {
        continue;
      }

      const aggregates = new Map<
        string,
        {
          sessionId: string | null;
          gatewayId: string | null;
          latBin: number;
          lonBin: number;
          count: number;
          rssiSum: number;
          rssiCount: number;
          rssiMin: number | null;
          rssiMax: number | null;
          snrSum: number;
          snrCount: number;
          snrMin: number | null;
          snrMax: number | null;
        }
      >();

      for (const measurement of measurements) {
        const latBin = Math.floor(measurement.lat / BIN_SIZE_DEG);
        const lonBin = Math.floor(measurement.lon / BIN_SIZE_DEG);
        const key = [
          measurement.sessionId ?? 'null',
          measurement.gatewayId ?? 'null',
          latBin,
          lonBin
        ].join('|');
        const existing = aggregates.get(key);
        const aggregate =
          existing ??
          {
            sessionId: measurement.sessionId,
            gatewayId: measurement.gatewayId,
            latBin,
            lonBin,
            count: 0,
            rssiSum: 0,
            rssiCount: 0,
            rssiMin: null,
            rssiMax: null,
            snrSum: 0,
            snrCount: 0,
            snrMin: null,
            snrMax: null
          };

        aggregate.count += 1;
        if (typeof measurement.rssi === 'number' && Number.isFinite(measurement.rssi)) {
          aggregate.rssiSum += measurement.rssi;
          aggregate.rssiCount += 1;
          aggregate.rssiMin =
            aggregate.rssiMin === null
              ? measurement.rssi
              : Math.min(aggregate.rssiMin, measurement.rssi);
          aggregate.rssiMax =
            aggregate.rssiMax === null
              ? measurement.rssi
              : Math.max(aggregate.rssiMax, measurement.rssi);
        }
        if (typeof measurement.snr === 'number' && Number.isFinite(measurement.snr)) {
          aggregate.snrSum += measurement.snr;
          aggregate.snrCount += 1;
          aggregate.snrMin =
            aggregate.snrMin === null
              ? measurement.snr
              : Math.min(aggregate.snrMin, measurement.snr);
          aggregate.snrMax =
            aggregate.snrMax === null
              ? measurement.snr
              : Math.max(aggregate.snrMax, measurement.snr);
        }

        if (!existing) {
          aggregates.set(key, aggregate);
        }
      }

      const rows = Array.from(aggregates.values()).map((aggregate) => ({
        deviceId: params.deviceId,
        sessionId: aggregate.sessionId,
        gatewayId: aggregate.gatewayId,
        day: dayStart,
        latBin: aggregate.latBin,
        lonBin: aggregate.lonBin,
        count: aggregate.count,
        rssiAvg:
          aggregate.rssiCount > 0 ? aggregate.rssiSum / aggregate.rssiCount : null,
        snrAvg:
          aggregate.snrCount > 0 ? aggregate.snrSum / aggregate.snrCount : null,
        rssiMin: aggregate.rssiMin,
        rssiMax: aggregate.rssiMax,
        snrMin: aggregate.snrMin,
        snrMax: aggregate.snrMax
      }));

      await tx.coverageBin.createMany({
        data: rows
      });
    }
  }
}

function toRecoverSessionPreview(
  summary: RecoverSessionSummaryInternal
): RecoverSessionPreview {
  return {
    selectedEventCount: summary.selectedEventCount,
    eligibleEventCount: summary.eligibleEventCount,
    eligibleMeasurementCount: summary.eligibleMeasurementCount,
    alreadyAssignedEventCount: summary.alreadyAssignedEventCount,
    incompatibleEventCount: summary.incompatibleEventCount,
    warningCount: summary.warningCount,
    warnings: summary.warnings,
    blockingErrors: summary.blockingErrors,
    canCreate: summary.canCreate,
    startTime: summary.startTime,
    endTime: summary.endTime,
    durationMs: summary.durationMs,
    inferredDeviceId: summary.inferredDeviceId,
    inferredDeviceUid: summary.inferredDeviceUid,
    inferredDeviceName: summary.inferredDeviceName,
    mixedRawDevices: summary.mixedRawDevices,
    mixedMeasurementDevices: summary.mixedMeasurementDevices,
    hasLargeTimeGap: summary.hasLargeTimeGap,
    maxGapMs: summary.maxGapMs,
    defaultSessionName: summary.defaultSessionName
  };
}

function normalizeEventIdSelection(eventIds: string[]): string[] {
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    throw new BadRequestException('eventIds must include at least one event id');
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawEventId of eventIds) {
    if (typeof rawEventId !== 'string') {
      continue;
    }
    const trimmed = rawEventId.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  if (normalized.length === 0) {
    throw new BadRequestException('eventIds must include at least one valid event id');
  }
  if (normalized.length > MAX_RECOVERY_EVENT_IDS) {
    throw new BadRequestException(
      `eventIds cannot exceed ${MAX_RECOVERY_EVENT_IDS} entries`
    );
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function computeMaxGapMs(
  events: Array<{
    id: string;
    receivedAt: Date;
    deviceUid: string | null;
  }>
): number | null {
  if (events.length < 2) {
    return null;
  }
  const ordered = [...events].sort((left, right) => {
    const leftMs = left.receivedAt.getTime();
    const rightMs = right.receivedAt.getTime();
    if (leftMs === rightMs) {
      return left.id.localeCompare(right.id);
    }
    return leftMs - rightMs;
  });

  let maxGap = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const gap = ordered[index].receivedAt.getTime() - ordered[index - 1].receivedAt.getTime();
    if (gap > maxGap) {
      maxGap = gap;
    }
  }

  return maxGap > 0 ? maxGap : null;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function buildRecoverDefaultSessionName(startAt: Date, endAt: Date): string {
  const startIso = startAt.toISOString();
  const endIso = endAt.toISOString();
  const startDay = startIso.slice(0, 10);
  const startClock = startIso.slice(11, 16);
  const endDay = endIso.slice(0, 10);
  const endClock = endIso.slice(11, 16);

  if (startDay === endDay) {
    return `Recovered ${startDay} ${startClock}-${endClock} UTC`;
  }
  return `Recovered ${startDay} ${startClock} to ${endDay} ${endClock} UTC`;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function buildWhereClause(params: ListEventsParams): Prisma.WebhookEventWhereInput | undefined {
  const and: Prisma.WebhookEventWhereInput[] = [];

  if (params.source) {
    and.push({ source: normalizeSourceForDb(params.source) });
  }
  if (params.deviceUid) {
    and.push({ deviceUid: params.deviceUid });
  }
  if (params.portnum) {
    and.push({ portnum: params.portnum });
  }
  if (params.since || params.until) {
    const receivedAt: Prisma.DateTimeFilter = {};
    if (params.since) {
      receivedAt.gte = params.since;
    }
    if (params.until) {
      receivedAt.lte = params.until;
    }
    and.push({ receivedAt });
  }
  if (params.q) {
    and.push({
      OR: [
        { deviceUid: { contains: params.q, mode: 'insensitive' } },
        { portnum: { contains: params.q, mode: 'insensitive' } },
        { packetId: { contains: params.q, mode: 'insensitive' } }
      ]
    });
  }
  if (params.cursor) {
    and.push({
      OR: [
        { receivedAt: { lt: params.cursor.receivedAt } },
        {
          AND: [{ receivedAt: params.cursor.receivedAt }, { id: { lt: params.cursor.id } }]
        }
      ]
    });
  }

  if (and.length === 0) {
    return undefined;
  }

  return { AND: and };
}

function formatListItem(row: {
  id: string;
  source: WebhookEventSource;
  receivedAt: Date;
  deviceUid: string | null;
  portnum: string | null;
  packetId: string | null;
  payloadJson: Prisma.JsonValue;
}): EventListItem {
  const payload = toRecord(row.payloadJson);
  const candidates = payload ? collectCandidateRecords(payload) : [];
  const position = extractPositionSummary(payload, candidates);
  const portnum =
    normalizePortnum(row.portnum) ??
    normalizePortnum(extractStringFromCandidates(candidates, ['portnum']));
  const packetId =
    row.packetId ??
    extractStringFromCandidates(candidates, ['packetId', 'uplinkId', 'id']);

  return {
    id: row.id,
    source: normalizeSourceForApi(row.source),
    receivedAt: row.receivedAt,
    deviceUid: row.deviceUid,
    portnum,
    packetId,
    rxRssi: extractNumberFromCandidates(candidates, ['rxRssi', 'rx_rssi', 'rssi']),
    rxSnr: extractNumberFromCandidates(candidates, ['rxSnr', 'rx_snr', 'snr']),
    hopLimit: extractIntegerFromCandidates(candidates, ['hopLimit', 'hop_limit']),
    relayNode: extractStringFromCandidates(candidates, ['relayNode', 'relay_node']),
    transportMechanism: extractStringFromCandidates(candidates, ['transportMechanism', 'transport_mechanism']),
    batteryLevel: extractIntegerFromCandidates(candidates, ['batteryLevel', 'battery_level']),
    voltage: extractNumberFromCandidates(candidates, ['voltage']),
    hwModel: extractStringFromCandidates(candidates, ['hwModel', 'hardwareModel', 'hw_model']),
    shortName: extractStringFromCandidates(candidates, ['shortName', 'short_name']),
    lat: position.lat,
    lon: position.lon,
    time: position.time
  };
}

function extractPositionSummary(
  payload: Record<string, unknown> | null,
  candidatesOverride?: Record<string, unknown>[]
): {
  lat: number | null;
  lon: number | null;
  time: string | null;
} {
  if (!payload) {
    return { lat: null, lon: null, time: null };
  }

  const candidates = candidatesOverride ?? collectCandidateRecords(payload);
  for (const candidate of candidates) {
    const lat = extractNumber(candidate, ['lat', 'latitude', 'latitudeI', 'latitude_i']);
    const lon = extractNumber(candidate, ['lon', 'longitude', 'longitudeI', 'longitude_i']);
    if (lat === null || lon === null) {
      continue;
    }

    const normalizedLat = normalizeCoordinate(lat, 90);
    const normalizedLon = normalizeCoordinate(lon, 180);
    if (normalizedLat === null || normalizedLon === null) {
      continue;
    }

    return {
      lat: normalizedLat,
      lon: normalizedLon,
      time: extractTimeIso(candidate)
    };
  }

  return { lat: null, lon: null, time: null };
}

function extractNumberFromCandidates(
  candidates: Record<string, unknown>[],
  keys: string[]
): number | null {
  for (const candidate of candidates) {
    const value = extractNumber(candidate, keys);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function extractIntegerFromCandidates(
  candidates: Record<string, unknown>[],
  keys: string[]
): number | null {
  const value = extractNumberFromCandidates(candidates, keys);
  return value === null ? null : Math.trunc(value);
}

function extractStringFromCandidates(
  candidates: Record<string, unknown>[],
  keys: string[]
): string | null {
  for (const candidate of candidates) {
    const value = extractString(candidate, keys);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function collectCandidateRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const stack: unknown[] = [root];
  const results: Record<string, unknown>[] = [];
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
    results.push(record);

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  return results;
}

function extractTimeIso(record: Record<string, unknown>): string | null {
  const isoLike = extractString(record, ['time', 'timestamp', 'receivedAt']);
  if (isoLike) {
    const maybeDate = new Date(isoLike);
    if (!Number.isNaN(maybeDate.getTime())) {
      return maybeDate.toISOString();
    }
  }

  const seconds = extractNumber(record, ['time', 'timestamp', 'rxTime', 'rx_time']);
  if (seconds !== null) {
    const millis = seconds >= 1_000_000_000_000 ? seconds : seconds * 1000;
    return new Date(millis).toISOString();
  }

  return null;
}

function extractNumber(
  payload: Record<string, unknown> | null,
  keys: string[]
): number | null {
  if (!payload) {
    return null;
  }

  for (const key of keys) {
    const direct = payload[key];
    const parsedDirect = toFiniteNumber(direct);
    if (parsedDirect !== null) {
      return parsedDirect;
    }

    const nested = payload.payload;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const value = (nested as Record<string, unknown>)[key];
      const parsedNested = toFiniteNumber(value);
      if (parsedNested !== null) {
        return parsedNested;
      }
    }

    const decoded = payload.decoded;
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      const value = (decoded as Record<string, unknown>)[key];
      const parsedDecoded = toFiniteNumber(value);
      if (parsedDecoded !== null) {
        return parsedDecoded;
      }
    }
  }

  return null;
}

function extractInteger(
  payload: Record<string, unknown> | null,
  keys: string[]
): number | null {
  const value = extractNumber(payload, keys);
  return value === null ? null : Math.trunc(value);
}

function extractString(
  payload: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!payload) {
    return null;
  }

  for (const key of keys) {
    const value = payload[key];
    const parsed = toNonEmptyString(value);
    if (parsed) {
      return parsed;
    }

    const nested = payload.payload;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedParsed = toNonEmptyString((nested as Record<string, unknown>)[key]);
      if (nestedParsed) {
        return nestedParsed;
      }
    }

    const decoded = payload.decoded;
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      const decodedParsed = toNonEmptyString((decoded as Record<string, unknown>)[key]);
      if (decodedParsed) {
        return decodedParsed;
      }
    }
  }

  return null;
}

function toRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function normalizeSourceForDb(source: EventsSource): WebhookEventSource {
  if (source === 'meshtastic') {
    return WebhookEventSource.MESHTASTIC;
  }
  if (source === 'agent') {
    return WebhookEventSource.AGENT;
  }
  if (source === 'sim') {
    return WebhookEventSource.SIM;
  }
  return WebhookEventSource.LORAWAN;
}

function normalizeSourceForApi(source: WebhookEventSource): EventsSource {
  if (source === WebhookEventSource.MESHTASTIC) {
    return 'meshtastic';
  }
  if (source === WebhookEventSource.AGENT) {
    return 'agent';
  }
  if (source === WebhookEventSource.SIM) {
    return 'sim';
  }
  return 'lorawan';
}

function normalizePortnum(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.toUpperCase();
}

function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

export function encodeCursor(cursor: EventsCursor): string {
  return `${cursor.receivedAt.toISOString()}|${cursor.id}`;
}

export function decodeCursor(raw: string): EventsCursor | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const separatorIndex = trimmed.indexOf('|');
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return null;
  }
  const receivedAtRaw = trimmed.slice(0, separatorIndex);
  const id = trimmed.slice(separatorIndex + 1);
  const receivedAt = new Date(receivedAtRaw);
  if (Number.isNaN(receivedAt.getTime()) || id.trim().length === 0) {
    return null;
  }
  return {
    receivedAt,
    id
  };
}
