-- CreateIndex
CREATE INDEX "Device_deviceUid_idx" ON "Device"("deviceUid");

-- CreateIndex
CREATE INDEX "Measurement_deviceId_capturedAt_idx" ON "Measurement"("deviceId", "capturedAt");

-- CreateIndex
CREATE INDEX "Measurement_sessionId_capturedAt_idx" ON "Measurement"("sessionId", "capturedAt");

-- CreateIndex
CREATE INDEX "Session_deviceId_startedAt_idx" ON "Session"("deviceId", "startedAt");
