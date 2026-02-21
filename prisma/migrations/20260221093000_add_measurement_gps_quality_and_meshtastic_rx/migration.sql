-- Add optional GPS quality and motion fields to canonical measurements.
ALTER TABLE "Measurement"
  ADD COLUMN "altitude" DOUBLE PRECISION,
  ADD COLUMN "pdop" DOUBLE PRECISION,
  ADD COLUMN "satsInView" INTEGER,
  ADD COLUMN "precisionBits" INTEGER,
  ADD COLUMN "locationSource" TEXT,
  ADD COLUMN "groundSpeed" DOUBLE PRECISION,
  ADD COLUMN "groundTrack" DOUBLE PRECISION;

-- Add per-measurement Meshtastic RX metadata table.
CREATE TABLE "MeshtasticRx" (
  "id" UUID NOT NULL,
  "measurementId" UUID NOT NULL,
  "rxTime" TIMESTAMP(3),
  "rxRssi" INTEGER,
  "rxSnr" DOUBLE PRECISION,
  "hopLimit" INTEGER,
  "hopStart" INTEGER,
  "relayNode" INTEGER,
  "transportMechanism" TEXT,
  "fromId" TEXT,
  "toId" TEXT,
  "raw" JSONB,

  CONSTRAINT "MeshtasticRx_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeshtasticRx_measurementId_idx" ON "MeshtasticRx"("measurementId");
CREATE INDEX "MeshtasticRx_rxTime_idx" ON "MeshtasticRx"("rxTime");
CREATE INDEX "MeshtasticRx_rxRssi_idx" ON "MeshtasticRx"("rxRssi");

ALTER TABLE "MeshtasticRx"
  ADD CONSTRAINT "MeshtasticRx_measurementId_fkey"
  FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
