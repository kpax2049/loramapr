# Data Retention

This page describes backend data-retention behavior implemented by `src/modules/retention/retention.service.ts`.

## Defaults

- `RETENTION_WEBHOOKEVENT_DAYS=30`
- `RETENTION_AGENTDECISION_DAYS=90`
- `RETENTION_RUN_AT_STARTUP=false`
- `RETENTION_SCHEDULE_CRON="0 3 * * *"` (daily at 03:00 server time)

## What is deleted

The retention job deletes:

- `WebhookEvent` rows older than `RETENTION_WEBHOOKEVENT_DAYS` **only when** `processedAt IS NOT NULL`
- `AgentDecision` rows older than `RETENTION_AGENTDECISION_DAYS`

## What is not deleted by this job

The retention job does **not** delete:

- `Measurement`
- `Session`
- `Device`
- `RxMetadata`
- `CoverageBin`

## Why processed-only deletion is used for `WebhookEvent`

`WebhookEvent` keeps unprocessed rows so operators can inspect/retry ingestion failures.
Deleting only processed rows protects troubleshooting/reprocessing workflows and reduces risk of losing events that still need handling.

## Configuration

Set retention env vars in the backend runtime environment (for example `.env`, container env, or systemd env file used by backend):

```bash
RETENTION_WEBHOOKEVENT_DAYS=30
RETENTION_AGENTDECISION_DAYS=90
RETENTION_RUN_AT_STARTUP=false
RETENTION_SCHEDULE_CRON="0 3 * * *"
```

Notes:

- `RETENTION_SCHEDULE_CRON` currently supports daily schedule format only: `"<minute> <hour> * * *"`.
- Invalid values fall back to default schedule (`0 3 * * *`) with a warning in logs.

## Manual run

There is currently **no** manual HTTP endpoint like `POST /api/admin/retention/run`.

To force a run manually:

1. Start backend once with `RETENTION_RUN_AT_STARTUP=true`.
2. Confirm logs contain `Retention run (startup) complete: ...`.
3. Set `RETENTION_RUN_AT_STARTUP=false` afterward to avoid running on every restart.

