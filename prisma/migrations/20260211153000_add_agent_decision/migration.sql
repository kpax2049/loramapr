-- CreateTable
CREATE TABLE "AgentDecision" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "deviceUid" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "inside" BOOLEAN,
    "distanceM" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentDecision_deviceId_createdAt_idx" ON "AgentDecision"("deviceId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentDecision" ADD CONSTRAINT "AgentDecision_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
