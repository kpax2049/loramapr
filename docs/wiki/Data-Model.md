# Data Model

This page reflects `prisma/schema.prisma` as implemented.

## Core Models

### `Device`

Key fields:

- `id` (UUID, PK)
- `deviceUid` (unique)
- metadata: `name`, `notes`, `meshtasticNodeId`, `hwModel`, `firmwareVersion`, `appVersion`, `longName`, `shortName`, `macaddr`, `publicKey`, `isUnmessagable`, `role`
- lifecycle/status: `lastNodeInfoAt`, `iconKey`, `iconOverride`, `isArchived`, `createdAt`, `updatedAt`, `lastSeenAt`

Relations:

- 1 -> many `Session` (`sessions`)
- 1 -> many `Measurement` (`measurements`)
- 1 -> many `DeviceTelemetrySample` (`telemetrySamples`)
- 1 -> many `CoverageBin` (`coverageBins`)
- 1 -> many `AgentDecision` (`agentDecisions`)
- optional 1 -> 1 `DeviceAutoSessionConfig` (`autoSessionConfig`)

Indexes:

- `@unique(deviceUid)`
- `@@index([deviceUid])`

### `Session`

Key fields:

- `id` (UUID, PK)
- `deviceId` (FK -> `Device.id`)
- `startedAt`, `endedAt`
- `name`, `notes`
- lifecycle: `isArchived`, `archivedAt`, `updatedAt`

Relations:

- many -> 1 `Device`
- 1 -> many `Measurement` (`measurements`)
- 1 -> many `CoverageBin` (`coverageBins`)

Index:

- `@@index([deviceId, startedAt])`

### `Measurement`

Key fields:

- identity/links: `id`, `deviceId`, `sessionId` (nullable)
- canonical telemetry/time: `capturedAt`, `lat`, `lon`
- signal/radio summary: `rssi`, `snr`, `sf`, `bw`, `freq`, `gatewayId`
- raw/source payload fields: `payloadRaw`, `rxMetadata` (JSON)
- ingest timestamp: `ingestedAt`

Relations:

- many -> 1 `Device`
- many -> 1 `Session` (nullable)
- 1 -> many `RxMetadata` (`rxMetadataRows`)

Indexes:

- `@@index([deviceId, capturedAt])`
- `@@index([sessionId, capturedAt])`
- `@@index([sessionId])`
- `@@index([gatewayId])`

### `DeviceTelemetrySample`

Key fields:

- `id`
- `deviceId` (FK -> `Device.id`)
- `capturedAt`
- `source` (`'meshtastic'` currently)
- telemetry metrics: `batteryLevel`, `voltage`, `channelUtilization`, `airUtilTx`, `uptimeSeconds`
- `raw` (JSON telemetry subtree for debugging)
- `createdAt`

Relation:

- many -> 1 `Device` (`onDelete: Cascade`)

Indexes:

- `@@index([deviceId, capturedAt])`
- `@@index([capturedAt])`

### `RxMetadata`

Key fields:

- `id`
- `measurementId` (FK -> `Measurement.id`)
- `gatewayId`
- `rssi`, `snr`, `channelIndex`, `time`, `fineTimestamp`, `receivedAt`

Relation:

- many -> 1 `Measurement` (`onDelete: Cascade`)

Indexes / constraints:

- `@@index([gatewayId, receivedAt])`
- `@@index([measurementId])`
- `@@index([gatewayId, measurementId])`
- `@@index([receivedAt])`
- `@@unique([measurementId, gatewayId])`

### `WebhookEvent`

Key fields:

- `id`
- `source`
- `receivedAt`
- `payloadJson` (JSON; mapped to DB column `payload`)
- processing lifecycle: `processingStartedAt`, `processingWorkerId`, `processedAt`, `processingError`
- identity/mapping: `eventType`, `deviceUid`, `portnum`, `packetId` (unique; mapped to DB column `uplinkId`)

Indexes:

- `@@index([receivedAt])`
- `@@index([processedAt])`
- `@@index([source, receivedAt])`
- `@@index([deviceUid])`
- `@@index([deviceUid, receivedAt])`
- `@@index([portnum, receivedAt])`
- `@unique(packetId)`

### `AgentDecision`

Key fields:

- `id`
- `deviceId` (FK -> `Device.id`)
- `deviceUid`
- `decision`, `reason`
- `inside`, `distanceM`, `capturedAt`, `createdAt`

Relation:

- many -> 1 `Device` (`onDelete: Cascade`)

Index:

- `@@index([deviceId, createdAt])`

### Coverage / Heatmap Model: `CoverageBin`

Key fields:

- `id`
- dimensions: `deviceId`, `sessionId` (nullable), `gatewayId` (nullable), `day`, `latBin`, `lonBin`
- aggregates: `count`, `rssiAvg`, `snrAvg`, `rssiMin`, `rssiMax`, `snrMin`, `snrMax`
- `updatedAt`

Relations:

- many -> 1 `Device` (`onDelete: Cascade`)
- many -> 1 `Session` (nullable, `onDelete: Cascade`)

Indexes / constraints:

- `@@index([deviceId, day])`
- `@@index([sessionId, day])`
- `@@index([gatewayId, day])`
- `@@unique([deviceId, sessionId, gatewayId, day, latBin, lonBin])`

## Relationship Summary

- `Device` 1 -> many `Session`
- `Session` 1 -> many `Measurement`
- `Measurement.sessionId` is nullable (supports detached measurements after session delete)
- `Measurement` 1 -> many `RxMetadata`
- `Device` 1 -> many `DeviceTelemetrySample`
- `WebhookEvent` maps to devices primarily by `deviceUid` (string), while `Measurement`/`Session` use `deviceId` UUID FKs.

## Device UID Mapping Assumptions

- `Device.deviceUid` is unique and acts as source-facing identity.
- Webhook ingestion paths store/resolve `WebhookEvent.deviceUid`.
- Canonical measurement/session records are persisted against `Device.id` (UUID FK) after resolving or upserting by `deviceUid`.

## Canonical vs Source-Specific Measurement Fields

Canonical measurement fields (common storage shape):

- `capturedAt`, `lat`, `lon`
- linked identity: `deviceId`, optional `sessionId`

Common normalized signal fields:

- `gatewayId`, `rssi`, `snr`, `sf`, `bw`, `freq`

Source-specific/raw fields:

- `payloadRaw` (raw payload string)
- `rxMetadata` (JSON payload-side metadata)
- expanded receiver rows in `RxMetadata` (especially relevant for LoRaWAN multi-gateway metadata)

## Meshtastic Promotions

- `NODEINFO_APP` packets update `Device` metadata fields (for example `hwModel`, `longName`, `shortName`, `macaddr`, `publicKey`, `isUnmessagable`) and timestamps (`lastNodeInfoAt`, `lastSeenAt`).
- `TELEMETRY_APP` packets create `DeviceTelemetrySample` rows from `decoded.telemetry.deviceMetrics`.
- Raw packets remain stored in `WebhookEvent.payloadJson`, so promoted events are still visible in Events Explorer.
