-- CreateTable
CREATE TABLE "DeviceAutoSessionConfig" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "homeLat" DOUBLE PRECISION,
    "homeLon" DOUBLE PRECISION,
    "radiusMeters" INTEGER,
    "minOutsideSeconds" INTEGER,
    "minInsideSeconds" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceAutoSessionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAutoSessionConfig_deviceId_key" ON "DeviceAutoSessionConfig"("deviceId");

-- AddForeignKey
ALTER TABLE "DeviceAutoSessionConfig" ADD CONSTRAINT "DeviceAutoSessionConfig_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
