ALTER TABLE "Device"
ADD COLUMN IF NOT EXISTS "meshtasticNodeId" TEXT,
ADD COLUMN IF NOT EXISTS "macaddr" TEXT,
ADD COLUMN IF NOT EXISTS "publicKey" TEXT,
ADD COLUMN IF NOT EXISTS "isUnmessagable" BOOLEAN;

CREATE TABLE IF NOT EXISTS "DeviceTelemetrySample" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "batteryLevel" INTEGER,
    "voltage" DOUBLE PRECISION,
    "channelUtilization" DOUBLE PRECISION,
    "airUtilTx" DOUBLE PRECISION,
    "uptimeSeconds" INTEGER,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceTelemetrySample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeviceTelemetrySample_deviceId_capturedAt_idx"
ON "DeviceTelemetrySample"("deviceId", "capturedAt");

CREATE INDEX IF NOT EXISTS "DeviceTelemetrySample_capturedAt_idx"
ON "DeviceTelemetrySample"("capturedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'DeviceTelemetrySample_deviceId_fkey'
  ) THEN
    ALTER TABLE "DeviceTelemetrySample"
    ADD CONSTRAINT "DeviceTelemetrySample_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
