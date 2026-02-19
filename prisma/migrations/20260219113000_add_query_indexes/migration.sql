-- Align Measurement query indexes with common read patterns
DROP INDEX IF EXISTS "Measurement_deviceId_capturedAt_idx";
CREATE INDEX "Measurement_deviceId_capturedAt_idx" ON "Measurement"("deviceId", "capturedAt" DESC);

DROP INDEX IF EXISTS "Measurement_sessionId_capturedAt_idx";
CREATE INDEX "Measurement_sessionId_capturedAt_idx" ON "Measurement"("sessionId", "capturedAt" DESC);

CREATE INDEX IF NOT EXISTS "Measurement_sessionId_idx" ON "Measurement"("sessionId");
CREATE INDEX IF NOT EXISTS "Measurement_gatewayId_idx" ON "Measurement"("gatewayId");

-- Improve WebhookEvent filtering/sorting by source/device
CREATE INDEX IF NOT EXISTS "WebhookEvent_source_receivedAt_idx" ON "WebhookEvent"("source", "receivedAt" DESC);
CREATE INDEX IF NOT EXISTS "WebhookEvent_deviceUid_idx" ON "WebhookEvent"("deviceUid");
