import { useState } from 'react';
import MapView from '../components/MapView';
import '../App.css';

export default function UiKit() {
  const [theme, setTheme] = useState<
    'default' | 'yellow-black-sat' | 'space-map' | 'retro-future-gadget' | 'white-grid-industrial'
  >('default');
  const rootClassName =
    theme === 'default' ? 'app' : `app theme-${theme}`;

  return (
    <div className={rootClassName}>
      <MapView showPoints={false} showTrack={false} />
      <div className="controls">
        <div className="playback-panel__header">
          <h3>UI Kit</h3>
        </div>

        <div className="controls__group">
          <span className="controls__label">Theme</span>
          <div className="controls__segmented" role="radiogroup" aria-label="UI kit theme">
            <label className={`controls__segment ${theme === 'default' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="ui-kit-theme"
                value="default"
                checked={theme === 'default'}
                onChange={() => setTheme('default')}
              />
              Default
            </label>
            <label
              className={`controls__segment ${theme === 'yellow-black-sat' ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="ui-kit-theme"
                value="yellow-black-sat"
                checked={theme === 'yellow-black-sat'}
                onChange={() => setTheme('yellow-black-sat')}
              />
              yellow-black-sat
            </label>
            <label className={`controls__segment ${theme === 'space-map' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="ui-kit-theme"
                value="space-map"
                checked={theme === 'space-map'}
                onChange={() => setTheme('space-map')}
              />
              space-map
            </label>
            <label
              className={`controls__segment ${theme === 'retro-future-gadget' ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="ui-kit-theme"
                value="retro-future-gadget"
                checked={theme === 'retro-future-gadget'}
                onChange={() => setTheme('retro-future-gadget')}
              />
              retro-future-gadget
            </label>
            <label
              className={`controls__segment ${theme === 'white-grid-industrial' ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="ui-kit-theme"
                value="white-grid-industrial"
                checked={theme === 'white-grid-industrial'}
                onChange={() => setTheme('white-grid-industrial')}
              />
              white-grid-industrial
            </label>
          </div>
        </div>

        <div className="controls__group">
          <span className="controls__label">Typography</span>
          <div className="playback-panel__header">
            <h3>Section Header</h3>
          </div>
          <span className="controls__label">Label</span>
          <div className="sessions-panel__meta">Meta text for helper copy</div>
          <dl className="stats-card__grid">
            <div>
              <dt>Body</dt>
              <dd>Body copy in Space Grotesk.</dd>
            </div>
          </dl>
          <div className="controls__device-meta">
            <span>Mono body</span>
            <span>IBM Plex Mono</span>
          </div>
        </div>

        <div className="controls__group">
          <span className="controls__label">Buttons</span>
          <button type="button" className="controls__button">
            Default
          </button>
          <button type="button" className="controls__button controls__button--compact">
            Compact
          </button>
          <button type="button" className="sessions-panel__stop">
            Stop / Destructive
          </button>
        </div>

        <div className="controls__group">
          <span className="controls__label">Segmented</span>
          <div className="controls__segmented" role="radiogroup" aria-label="UI kit segmented">
            <label className="controls__segment is-active">
              <input type="radio" name="ui-kit-segment" defaultChecked />
              Primary
            </label>
            <label className="controls__segment">
              <input type="radio" name="ui-kit-segment" />
              Secondary
            </label>
          </div>
        </div>

        <div className="controls__group">
          <span className="controls__label">Pickers</span>
          <label htmlFor="ui-kit-select">Select</label>
          <select id="ui-kit-select">
            <option>Option A</option>
            <option>Option B</option>
          </select>
          <label htmlFor="ui-kit-datetime">Datetime</label>
          <input
            id="ui-kit-datetime"
            type="datetime-local"
            defaultValue="2026-02-08T09:30"
          />
        </div>
      </div>

      <div className="right-column">
        <div className="playback-panel">
          <div className="playback-panel__header">
            <h3>Right Column Panel</h3>
          </div>
          <div className="playback-panel__group">
            <label htmlFor="ui-kit-playback-select">Playback select</label>
            <select id="ui-kit-playback-select">
              <option>Session A</option>
              <option>Session B</option>
            </select>
          </div>
          <div className="playback-panel__scrubber">
            <input type="range" min="0" max="100" defaultValue="40" />
            <div className="playback-panel__scrubber-meta">
              <span>00:00</span>
              <span>01:00</span>
            </div>
          </div>
          <div className="playback-panel__controls">
            <button type="button" className="playback-panel__button">
              Play
            </button>
          </div>
        </div>

        <div className="sessions-panel">
          <div className="sessions-panel__header">
            <h3>Sessions Panel</h3>
            <span className="sessions-panel__device">Device selected</span>
          </div>
          <div className="sessions-panel__actions">
            <input type="text" placeholder="Session name" />
            <div className="sessions-panel__buttons">
              <button type="button">Start</button>
              <button type="button">Create</button>
            </div>
          </div>
          <div className="sessions-panel__active">
            <span className="sessions-panel__meta">Active session</span>
            <span className="sessions-panel__title">Morning drive</span>
            <button type="button" className="sessions-panel__stop">
              Stop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
