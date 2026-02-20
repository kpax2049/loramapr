DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'WebhookEventSource'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'WebhookEventSource' AND e.enumlabel = 'meshtastic'
    ) THEN
      ALTER TYPE "WebhookEventSource" RENAME VALUE 'meshtastic' TO 'MESHTASTIC';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'WebhookEventSource' AND e.enumlabel = 'lorawan'
    ) THEN
      ALTER TYPE "WebhookEventSource" RENAME VALUE 'lorawan' TO 'LORAWAN';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'WebhookEventSource' AND e.enumlabel = 'agent'
    ) THEN
      ALTER TYPE "WebhookEventSource" RENAME VALUE 'agent' TO 'AGENT';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'WebhookEventSource' AND e.enumlabel = 'sim'
    ) THEN
      ALTER TYPE "WebhookEventSource" RENAME VALUE 'sim' TO 'SIM';
    END IF;
  END IF;
END
$$;
