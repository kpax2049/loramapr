# Release v0.9.13 - Documentation Wiki Pack

## Added
- Added a complete `docs/wiki/` documentation pack for onboarding, architecture, ingestion, data model, operations, and troubleshooting.
- Added `scripts/wiki/sync-wiki.sh` to mirror `docs/wiki/*` into the GitHub Wiki repo with SSH-first fallback behavior, delete-sync semantics, and optional commit message override.
- Added expanded sync runbook guidance in `docs/wiki/SYNC_TO_GITHUB_WIKI.md`, including auth and common-failure handling.

## Changed
- Updated wiki sidebar links to GitHub Wiki-native page links so navigation resolves to rendered pages instead of raw markdown endpoints.
- Replaced placeholder wiki home content with a real wiki index page and section-based entry points.
- Added `.tmp/` to `.gitignore` to keep local wiki sync working directories out of source control.

## Acceptance
- GitHub Wiki Home and sidebar render and navigate correctly.
- Scripted wiki sync can be rerun safely and only commits when changes exist.
- Core app runtime remains unchanged.
