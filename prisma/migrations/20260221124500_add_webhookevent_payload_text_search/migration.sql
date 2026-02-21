ALTER TABLE "WebhookEvent"
  ADD COLUMN IF NOT EXISTS "payloadText" TEXT;

CREATE INDEX IF NOT EXISTS "WebhookEvent_payloadText_tsv_idx"
  ON "WebhookEvent"
  USING GIN (to_tsvector('english', COALESCE("payloadText", '')));
