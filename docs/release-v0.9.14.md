# Release v0.9.14 - One-command bootstrap

## Added
- Added first-run orchestration at repo root with both `Makefile` and `bin/loramapr` commands: `up`, `down`, `logs`, `ps`, `reset`, `demo`, and `keys`.
- Added setup secret generation (`scripts/setup/generate-secrets.js` with shell wrapper) that:
  - creates `.env` from `.env.example` when missing,
  - generates only missing `QUERY_API_KEY` and `INGEST_API_KEY`,
  - preserves existing secret values to avoid unintended rotation.

## Changed
- Updated `.env.example` to reflect the minimal complete environment needed for backend startup in the current dev compose flow.
- Updated `docs/wiki/Quickstart.md` to align with the new bootstrap workflow (`make keys` + `make up`) and operational follow-ups (`make down`, `make reset`, `make demo`).

## Milestone
- This is the first release where a clean clone can be started with one command after environment setup (`cp .env.example .env` or `make keys`, then `make up`).

## Acceptance
- Fresh clone bootstrap is reproducible through documented commands without manual container/npm runtime setup.
- Core application behavior is unchanged outside startup/bootstrap ergonomics.
