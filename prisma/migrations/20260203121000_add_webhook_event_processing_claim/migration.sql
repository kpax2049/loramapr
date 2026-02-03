-- AlterTable
ALTER TABLE "WebhookEvent"
ADD COLUMN "processingStartedAt" TIMESTAMP(3),
ADD COLUMN "processingWorkerId" TEXT;
