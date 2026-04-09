# LoRaMapr Wiki

LoRaMapr is a self-hosted app for recording, replaying, and analyzing real-world radio coverage.

Primary workflow: fixed base + mobile field testing (commonly home node + field node).

Ingestion paths currently documented in this wiki:

- Meshtastic via Pi Forwarder (`POST /api/meshtastic/event`)
- LoRaWAN via TTS webhook (`POST /api/lorawan/uplink`)

Core product workflows include sessions, playback, coverage (bins/heatmap), session comparison, events explorer debugging, device management, and GeoJSON export.

## Start Here

- [[Quickstart]]
- [[Deploy-Self-Hosted|Deploy Self Hosted]]
- [[UI-Workflows|UI Workflows]]
- [[Ingestion]]
- [[Coverage-and-Heatmaps|Coverage and Heatmaps]]
- [[Playback-and-Time|Playback and Time]]

## Operations

- [[API-Keys-and-Scopes|API Keys and Scopes]]
- [[Backup-Restore|Backup Restore]]
- [[Data-Retention|Data Retention]]
- [[Troubleshooting]]

## Product Components

- [[Pi-Forwarder|Pi Forwarder]]
- [[Hands-Free-Sessions|Home Auto Session (HAS)]]
- [[Architecture]]
- [[Data-Model|Data Model]]

## Release History

- [[Changelog]]
