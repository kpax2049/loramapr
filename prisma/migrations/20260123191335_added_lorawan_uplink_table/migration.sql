-- CreateTable
CREATE TABLE "LorawanUplink" (
    "id" UUID NOT NULL,
    "payloadRaw" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LorawanUplink_pkey" PRIMARY KEY ("id")
);
