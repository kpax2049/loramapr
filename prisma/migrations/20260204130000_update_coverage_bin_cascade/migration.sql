-- DropForeignKey
ALTER TABLE "CoverageBin" DROP CONSTRAINT IF EXISTS "CoverageBin_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "CoverageBin" DROP CONSTRAINT IF EXISTS "CoverageBin_sessionId_fkey";

-- AddForeignKey
ALTER TABLE "CoverageBin" ADD CONSTRAINT "CoverageBin_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageBin" ADD CONSTRAINT "CoverageBin_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
