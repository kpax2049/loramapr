-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('INGEST', 'QUERY');

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" UUID NOT NULL,
    "keyHash" TEXT NOT NULL,
    "label" TEXT,
    "scopes" "ApiKeyScope"[],
    "ownerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
