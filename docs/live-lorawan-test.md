# Live LoRaWAN Test

This guide helps you validate end-to-end LoRaWAN ingestion and UI behavior.

## Mint API keys

Create a QUERY key:
```bash
npm run apikey:mint -- --scopes QUERY
```

Create an INGEST key:
```bash
npm run apikey:mint -- --scopes INGEST
```

## Set frontend key

Set the frontend query key:
```bash
export VITE_QUERY_API_KEY="YOUR_QUERY_KEY"
```

## Steps

1) Confirm webhook events arrive (panel or `/api/lorawan/events`)
2) Confirm events process successfully (no `processingError`)
3) Confirm measurements appear (map + `/api/devices/:id/latest`)
4) If `missing_gps`: update formatter, reprocess events

## Curl helpers

Post a fixture (requires TTS webhook auth headers):
```bash
curl -X POST http://localhost:3000/api/lorawan/uplink \
  -H "Content-Type: application/json" \
  -H "X-Downlink-Apikey: $TTS_WEBHOOK_API_KEY" \
  --data-binary @test/fixtures/tts/uplink_with_gps.json
```

Fetch summary (requires QUERY scope):
```bash
curl http://localhost:3000/api/lorawan/summary \
  -H "X-API-Key: YOUR_QUERY_KEY"
```
