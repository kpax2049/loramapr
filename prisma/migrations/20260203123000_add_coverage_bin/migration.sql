-- CreateTable
CREATE TABLE "CoverageBin" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "sessionId" UUID,
    "gatewayId" TEXT,
    "day" TIMESTAMP(3) NOT NULL,
    "latBin" INTEGER NOT NULL,
    "lonBin" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "rssiAvg" DOUBLE PRECISION,
    "snrAvg" DOUBLE PRECISION,
    "rssiMin" INTEGER,
    "rssiMax" INTEGER,
    "snrMin" DOUBLE PRECISION,
    "snrMax" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverageBin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoverageBin_deviceId_day_idx" ON "CoverageBin"("deviceId", "day");

-- CreateIndex
CREATE INDEX "CoverageBin_sessionId_day_idx" ON "CoverageBin"("sessionId", "day");

-- CreateIndex
CREATE INDEX "CoverageBin_gatewayId_day_idx" ON "CoverageBin"("gatewayId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "CoverageBin_deviceId_sessionId_gatewayId_day_latBin_lonBin_key" ON "CoverageBin"("deviceId", "sessionId", "gatewayId", "day", "latBin", "lonBin");

-- AddForeignKey
ALTER TABLE "CoverageBin" ADD CONSTRAINT "CoverageBin_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageBin" ADD CONSTRAINT "CoverageBin_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
