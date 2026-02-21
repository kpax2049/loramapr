ALTER TABLE "Measurement"
  ADD COLUMN IF NOT EXISTS "sourceEventId" UUID,
  ADD COLUMN IF NOT EXISTS "source" TEXT;

CREATE INDEX IF NOT EXISTS "Measurement_sourceEventId_idx"
  ON "Measurement"("sourceEventId");
