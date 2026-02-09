# Overlay Panel Kit

This spec documents the existing overlay panel system as implemented in `frontend/src/App.css` and `frontend/src/index.css`.

Dev access: start the frontend dev server and open `/ui-kit` (or `/?ui-kit=1`) in the browser.

## Tokens

Base typography + mono face (from `frontend/src/index.css`):

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

:root {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    'Liberation Mono', monospace;
  color: #e2e8f0;
  background-color: #0b1220;
  line-height: 1.5;
  font-weight: 400;
}
```

Panel + map tokens (from `frontend/src/App.css`):

```css
:root {
  --panel-bg: rgba(15, 23, 42, 0.96);
  --panel-border: rgba(148, 163, 184, 0.25);
  --panel-shadow: 0 16px 40px rgba(2, 6, 23, 0.65);
  --panel-text: #e2e8f0;
  --panel-muted: rgba(148, 163, 184, 0.8);
  --panel-accent: #f59e0b;
  --panel-surface: rgba(2, 6, 23, 0.55);
  --panel-radius: 10px;
  --map-point-strong: #22c55e;
  --map-point-medium: #f59e0b;
  --map-point-weak: #ef4444;
  --map-point-unknown: #94a3b8;
  --map-point-default: #38bdf8;
  --map-point-compare: #f472b6;
  --map-point-cursor: var(--panel-accent);
}
```

## Typography

Section header:

```css
.playback-panel__header h3 {
  margin: 0;
  font-size: 1rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-family: var(--font-mono);
}
```

Label:

```css
.controls label,
.controls__label {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--panel-muted);
  font-family: var(--font-mono);
}
```

Meta:

```css
.sessions-panel__meta {
  display: grid;
  gap: 0.2rem;
  font-size: 0.75rem;
  color: var(--panel-muted);
}
```

Body:

```css
.stats-card__grid dd {
  margin: 0;
  font-size: 0.95rem;
}
```

Mono body:

```css
.controls__device-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.72rem;
  color: var(--panel-muted);
  font-family: var(--font-mono);
  min-width: 0;
}
```

## Panels

Controls-style panel:

```css
.controls {
  position: absolute;
  top: 1.5rem;
  left: 1.5rem;
  z-index: 1000;
  width: min(340px, calc(100vw - 3rem));
  display: grid;
  gap: 0.9rem;
  padding: 1.1rem 1.25rem;
  border-radius: var(--panel-radius);
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  border-left: 3px solid var(--panel-accent);
}
```

Right-column stack container:

```css
.right-column {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 1000;
  width: min(320px, calc(100vw - 3rem));
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: calc(100vh - 3rem);
  overflow: auto;
  min-height: 0;
}
```

Right-column panel:

```css
.playback-panel {
  display: grid;
  gap: 0.75rem;
  padding: 1.1rem 1.25rem;
  border-radius: var(--panel-radius);
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  color: var(--panel-text);
  box-shadow: var(--panel-shadow);
  border-left: 3px solid var(--panel-accent);
}
```

Alternate panel (sessions):

```css
.sessions-panel {
  display: grid;
  gap: 0.75rem;
  padding: 1.1rem 1.25rem;
  border-radius: var(--panel-radius);
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  color: var(--panel-text);
  box-shadow: var(--panel-shadow);
  border-left: 3px solid var(--panel-accent);
  height: min(360px, 60vh);
}
```

Alternate panel (LoRaWAN events):

```css
.lorawan-panel {
  display: grid;
  gap: 0.75rem;
  padding: 1.1rem 1.25rem;
  border-radius: var(--panel-radius);
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  color: var(--panel-text);
  box-shadow: var(--panel-shadow);
  border-left: 3px solid var(--panel-accent);
}
```

## Buttons

Default button:

```css
.controls__button {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: var(--panel-surface);
  color: var(--panel-text);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
  cursor: pointer;
}
```

Compact button:

```css
.controls__button--compact {
  width: auto;
  padding: 0.35rem 0.6rem;
  font-size: 0.7rem;
  flex: 0 0 auto;
}
```

Default hover state:

```css
.controls__button:hover {
  border-color: rgba(148, 163, 184, 0.6);
}
```

Playback panel button:

```css
.playback-panel__button {
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: var(--panel-surface);
  color: var(--panel-text);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
}
```

Destructive/stop button:

```css
.sessions-panel__stop {
  align-self: start;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(239, 68, 68, 0.15);
  color: #fecaca;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
}
```

## Segmented Control

```css
.controls__segmented {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 999px;
  overflow: hidden;
  background: var(--panel-surface);
}
```

```css
.controls__segment {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  color: var(--panel-text);
  cursor: pointer;
  user-select: none;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
}
```

```css
.controls__segment input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
```

```css
.controls__segment.is-active {
  background: var(--panel-accent);
  color: #0b1220;
}
```

## Pickers

Controls select + datetime:

```css
.controls select,
.controls input[type='datetime-local'] {
  width: 100%;
  min-width: 0;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: var(--panel-surface);
  color: inherit;
  font-size: 0.9rem;
}
```

Playback select:

```css
.playback-panel__group select,
.playback-panel__controls select {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: var(--panel-surface);
  color: inherit;
  font-size: 0.9rem;
}
```

Sessions text input:

```css
.sessions-panel__actions input {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: var(--panel-surface);
  font-size: 0.9rem;
  color: inherit;
}
```

Range input (playback scrubber):

```css
.playback-panel__scrubber input[type='range'] {
  width: 100%;
}
```

## Menu Status

Controls status block:

```css
.controls__status {
  display: grid;
  gap: 0.35rem;
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: var(--panel-surface);
  font-size: 0.75rem;
  font-family: var(--font-mono);
}
```

```css
.controls__status-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  color: var(--panel-muted);
}
```

```css
.controls__status-row strong {
  color: var(--panel-text);
  font-weight: 500;
}
```

```css
.controls__status-error strong {
  color: #fecaca;
}
```

Playback status text:

```css
.playback-panel__status {
  font-size: 0.8rem;
  color: var(--panel-muted);
}
```

```css
.playback-panel__status--error {
  color: #fecaca;
}
```

Global status chip:

```css
.status {
  position: absolute;
  left: 1.5rem;
  bottom: 1.5rem;
  z-index: 1000;
  display: grid;
  gap: 0.25rem;
  padding: 0.6rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  color: var(--panel-text);
  font-size: 0.85rem;
  font-family: var(--font-mono);
}
```

```css
.status__error {
  color: #fecaca;
}
```

## Layering

Overlay z-index references:

```css
.playback-blocker {
  position: absolute;
  inset: 0;
  z-index: 900;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.55);
  color: var(--panel-text);
  font-family: var(--font-mono);
}
```

```css
.controls {
  position: absolute;
  top: 1.5rem;
  left: 1.5rem;
  z-index: 1000;
  width: min(340px, calc(100vw - 3rem));
  display: grid;
  gap: 0.9rem;
  padding: 1.1rem 1.25rem;
  border-radius: var(--panel-radius);
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  border-left: 3px solid var(--panel-accent);
}
```

```css
.right-column {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 1000;
  width: min(320px, calc(100vw - 3rem));
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: calc(100vh - 3rem);
  overflow: auto;
  min-height: 0;
}
```

```css
.dev-counter {
  position: absolute;
  bottom: 1.5rem;
  left: 1.5rem;
  z-index: 1000;
  padding: 0.45rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  color: var(--panel-text);
  font-size: 0.75rem;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}
```

```css
.limit-banner {
  position: absolute;
  top: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(245, 158, 11, 0.6);
  background: rgba(2, 6, 23, 0.85);
  color: #fcd34d;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

```css
.diagnostic-banner {
  position: absolute;
  top: 3.4rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  max-width: min(720px, 90vw);
  padding: 0.6rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(248, 113, 113, 0.55);
  background: rgba(15, 23, 42, 0.92);
  color: #fecaca;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
  text-align: center;
}
```

```css
.status {
  position: absolute;
  left: 1.5rem;
  bottom: 1.5rem;
  z-index: 1000;
  display: grid;
  gap: 0.25rem;
  padding: 0.6rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  color: var(--panel-text);
  font-size: 0.85rem;
  font-family: var(--font-mono);
}
```
