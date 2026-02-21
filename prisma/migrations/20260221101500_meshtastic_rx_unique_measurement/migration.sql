-- Ensure one MeshtasticRx row per Measurement for idempotent upserts.
DROP INDEX IF EXISTS "MeshtasticRx_measurementId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "MeshtasticRx_measurementId_key"
  ON "MeshtasticRx"("measurementId");
