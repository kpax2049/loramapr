-- CreateTable
CREATE TABLE "RxMetadata" (
    "id" UUID NOT NULL,
    "measurementId" UUID NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "rssi" INTEGER,
    "snr" DOUBLE PRECISION,
    "channelIndex" INTEGER,
    "time" TIMESTAMP(3),
    "fineTimestamp" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RxMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RxMetadata_gatewayId_receivedAt_idx" ON "RxMetadata"("gatewayId", "receivedAt");

-- CreateIndex
CREATE INDEX "RxMetadata_measurementId_idx" ON "RxMetadata"("measurementId");

-- CreateIndex
CREATE INDEX "RxMetadata_gatewayId_measurementId_idx" ON "RxMetadata"("gatewayId", "measurementId");

-- CreateIndex
CREATE INDEX "RxMetadata_receivedAt_idx" ON "RxMetadata"("receivedAt");

-- AddForeignKey
ALTER TABLE "RxMetadata" ADD CONSTRAINT "RxMetadata_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
