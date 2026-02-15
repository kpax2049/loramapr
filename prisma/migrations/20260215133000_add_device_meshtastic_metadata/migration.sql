ALTER TABLE "Device"
ADD COLUMN "hwModel" TEXT,
ADD COLUMN "firmwareVersion" TEXT,
ADD COLUMN "appVersion" TEXT,
ADD COLUMN "longName" TEXT,
ADD COLUMN "shortName" TEXT,
ADD COLUMN "role" TEXT,
ADD COLUMN "lastNodeInfoAt" TIMESTAMP(3);
