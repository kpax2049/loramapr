# Device Payload Format

The backend requires GPS coordinates in the decoded payload to ingest a Measurement.

Accepted key patterns (first match wins):
1) lat + lon
2) latitude + longitude
3) gps.lat + gps.lon
4) gps.latitude + gps.longitude

Optional fields supported: alt, hdop

Example `decoded_payload` JSON that will successfully ingest:
```json
{ "lat": 49.44, "lon": 7.77, "alt": 240, "hdop": 1.2 }
```

## Failure mode

If GPS keys are missing, the webhook event is stored with `processingError="missing_gps"` and no Measurement is created.
