import type { CSSProperties } from 'react';
import {
  formatDistanceMeters,
  formatSessionDuration,
  formatSessionTimestamp,
  formatSignalMetric,
  type SessionComparisonStyle
} from '../sessionComparison';

export type SessionComparisonItem = {
  id: string;
  label: string;
  startedAt: string | null | undefined;
  durationMs: number | null;
  measurementCount: number | null;
  distanceMeters: number | null;
  avgRssi: number | null;
  avgSnr: number | null;
  isVisible: boolean;
  isLoading: boolean;
  error: string | null;
  style: SessionComparisonStyle;
};

type SessionComparisonPanelProps = {
  items: SessionComparisonItem[];
  onToggleVisibility: (sessionId: string) => void;
  onClearComparison: () => void;
  onFitAll: () => void;
};

export default function SessionComparisonPanel({
  items,
  onToggleVisibility,
  onClearComparison,
  onFitAll
}: SessionComparisonPanelProps) {
  if (items.length < 2) {
    return null;
  }

  const visibleCount = items.filter((item) => item.isVisible).length;

  return (
    <section className="session-compare-panel" aria-label="Session comparison">
      <div className="session-compare-panel__header">
        <div className="session-compare-panel__header-copy">
          <h4>Session comparison</h4>
          <p>
            Reviewing {items.length} sessions together. Colors match the shared map overlay.
          </p>
        </div>
        <div className="session-compare-panel__header-actions">
          <button type="button" className="session-compare-panel__button" onClick={onFitAll}>
            Fit all
          </button>
          <button
            type="button"
            className="session-compare-panel__button session-compare-panel__button--danger"
            onClick={onClearComparison}
          >
            Exit compare
          </button>
        </div>
      </div>
      <div className="session-compare-panel__status">
        <span>{visibleCount} visible</span>
        <span>{items.length - visibleCount} hidden</span>
      </div>
      <div className="session-compare-panel__list">
        {items.map((item) => {
          const swatchStyle = {
            '--comparison-color': item.style.color
          } as CSSProperties;

          return (
            <article
              key={item.id}
              className={`session-compare-panel__item${item.isVisible ? '' : ' is-muted'}`}
            >
              <div className="session-compare-panel__item-top">
                <div className="session-compare-panel__identity">
                  <span className="session-compare-panel__swatch" style={swatchStyle} aria-hidden="true" />
                  <div className="session-compare-panel__identity-copy">
                    <strong title={item.label}>{item.label}</strong>
                    <span>{formatSessionTimestamp(item.startedAt)}</span>
                  </div>
                </div>
                <label className="session-compare-panel__visibility">
                  <input
                    type="checkbox"
                    checked={item.isVisible}
                    onChange={() => onToggleVisibility(item.id)}
                  />
                  Visible
                </label>
              </div>
              {item.error ? (
                <div className="session-compare-panel__message session-compare-panel__message--error">
                  {item.error}
                </div>
              ) : item.isLoading ? (
                <div className="session-compare-panel__message">Loading comparison data…</div>
              ) : (
                <dl className="session-compare-panel__metrics">
                  <div>
                    <dt>Duration</dt>
                    <dd>{formatSessionDuration(item.durationMs)}</dd>
                  </div>
                  <div>
                    <dt>Points</dt>
                    <dd>
                      {item.measurementCount !== null && item.measurementCount !== undefined
                        ? item.measurementCount.toLocaleString()
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Distance</dt>
                    <dd>{formatDistanceMeters(item.distanceMeters)}</dd>
                  </div>
                  <div>
                    <dt>Avg RSSI</dt>
                    <dd>{formatSignalMetric(item.avgRssi, 'rssi')}</dd>
                  </div>
                  <div>
                    <dt>Avg SNR</dt>
                    <dd>{formatSignalMetric(item.avgSnr, 'snr')}</dd>
                  </div>
                </dl>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
