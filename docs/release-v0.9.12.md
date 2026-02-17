# Release v0.9.12 - Guided Onboarding Tour

## Added
- The header `?` help menu is now the single tour entry point and includes `Start tour`, `Reset tour`, and inline keyboard shortcuts.
- Sectioned tour coverage now spans tabs, selected device header, device controls, sessions, playback, coverage, stats/right panel, shortcuts, and optional debug blocks.
- Stable `data-tour` anchors were added across key UI containers and controls for deterministic step targeting.

## Changed
- Tour execution now auto-switches sidebar tabs for section-specific steps.
- Shortcuts steps auto-open the help popover and restore prior popover state when leaving that section.
- Stats steps can temporarily expand the right panel shell and restore previous visibility when the tour exits that section.
- Missing/hidden targets are skipped automatically so conditional features do not break the flow.

## Acceptance
- Tour covers: tabs, selected device header, device picker, sessions picker, start/stop session, playback, coverage, right panel, shortcuts (`Z`).
- Starting tour from `?` works; bottom launch button is removed.
- Tour can auto-switch tabs for drill-down steps.
- Steps skip gracefully when features are absent.
- Works in light/dark and does not break Leaflet interactions.
