-- AlterTable
ALTER TABLE "WebhookEvent"
ADD COLUMN "processedAt" TIMESTAMP(3),
ADD COLUMN "processingError" TEXT,
ADD COLUMN "eventType" TEXT,
ADD COLUMN "deviceUid" TEXT,
ADD COLUMN "uplinkId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_uplinkId_key" ON "WebhookEvent"("uplinkId");

-- CreateIndex
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");
