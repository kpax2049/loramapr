-- Introduce normalized source enum values for raw webhook events.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WebhookEventSource') THEN
    CREATE TYPE "WebhookEventSource" AS ENUM ('meshtastic', 'lorawan', 'agent', 'sim');
  END IF;
END
$$;

-- Backfill legacy source values before converting the column type.
UPDATE "WebhookEvent"
SET "source" = CASE
  WHEN "source" = 'tts' THEN 'lorawan'
  WHEN "source" IN ('meshtastic', 'lorawan', 'agent', 'sim') THEN "source"
  ELSE 'sim'
END;

ALTER TABLE "WebhookEvent"
  ALTER COLUMN "source" TYPE "WebhookEventSource"
  USING ("source"::"WebhookEventSource");

ALTER TABLE "WebhookEvent"
  ADD COLUMN IF NOT EXISTS "portnum" TEXT;

-- Raw events explorer query indexes.
CREATE INDEX IF NOT EXISTS "WebhookEvent_source_receivedAt_idx"
  ON "WebhookEvent"("source", "receivedAt" DESC);

CREATE INDEX IF NOT EXISTS "WebhookEvent_deviceUid_receivedAt_idx"
  ON "WebhookEvent"("deviceUid", "receivedAt" DESC);

CREATE INDEX IF NOT EXISTS "WebhookEvent_portnum_receivedAt_idx"
  ON "WebhookEvent"("portnum", "receivedAt" DESC);
