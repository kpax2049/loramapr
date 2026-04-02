import type { CSSProperties } from 'react';
import {
  formatDistanceMeters,
  formatSessionDuration,
  formatSessionTimestamp,
  formatSignalMetric,
  type SessionComparisonStyle
} from '../sessionComparison';

export type SessionComparisonRangePoint = {
  capturedAt: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  rssi: number | null;
  snr: number | null;
};

export type SessionComparisonItem = {
  id: string;
  label: string;
  startedAt: string | null | undefined;
  durationMs: number | null;
  measurementCount: number | null;
  distanceMeters: number | null;
  medianRssi: number | null;
  medianSnr: number | null;
  farthestPoint: SessionComparisonRangePoint | null;
  lastRangePoint: SessionComparisonRangePoint | null;
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

type ComparisonLeaderMetric = 'range' | 'rssi' | 'snr';

type ComparisonLeader = {
  label: string;
  sessionLabel: string;
  value: string;
  color: string;
};

function formatMeasurementCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString();
}

function pickComparisonLeader(
  items: SessionComparisonItem[],
  metric: ComparisonLeaderMetric
): ComparisonLeader | null {
  let leader: SessionComparisonItem | null = null;
  let leaderValue = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    if (item.isLoading || item.error) {
      continue;
    }

    const value =
      metric === 'range'
        ? item.farthestPoint?.distanceMeters ?? null
        : metric === 'rssi'
          ? item.farthestPoint?.rssi ?? null
          : item.farthestPoint?.snr ?? null;

    if (value === null || !Number.isFinite(value)) {
      continue;
    }

    if (!leader || value > leaderValue) {
      leader = item;
      leaderValue = value;
    }
  }

  if (!leader) {
    return null;
  }

  return {
    label:
      metric === 'range'
        ? 'Greatest max range'
        : metric === 'rssi'
          ? 'Best edge RSSI'
          : 'Best edge SNR',
    sessionLabel: leader.label,
    value:
      metric === 'range'
        ? formatDistanceMeters(leader.farthestPoint?.distanceMeters ?? null)
        : formatSignalMetric(metric === 'rssi' ? leader.farthestPoint?.rssi : leader.farthestPoint?.snr, metric),
    color: leader.style.color
  };
}

function renderLeaderMetric(items: SessionComparisonItem[], metric: ComparisonLeaderMetric) {
  const leader = pickComparisonLeader(items, metric);

  return (
    <div className="session-compare-panel__summary-card">
      <span className="session-compare-panel__summary-label">
        {leader?.label ??
          (metric === 'range'
            ? 'Greatest max range'
            : metric === 'rssi'
              ? 'Best edge RSSI'
              : 'Best edge SNR')}
      </span>
      {leader ? (
        <>
          <strong style={{ color: leader.color }}>{leader.value}</strong>
          <span title={leader.sessionLabel}>{leader.sessionLabel}</span>
        </>
      ) : (
        <>
          <strong>—</strong>
          <span>Unavailable</span>
        </>
      )}
    </div>
  );
}

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
  const hasRangeData = items.some((item) => item.farthestPoint !== null);

  return (
    <section className="session-compare-panel" aria-label="Compare sessions workspace">
      <div className="session-compare-panel__workspace">
        <div className="session-compare-panel__header">
          <div className="session-compare-panel__header-copy">
            <span className="session-compare-panel__eyebrow">Compare workspace</span>
            <h4>Compare Sessions</h4>
            <p>
              {items.length} selected
              {visibleCount !== items.length ? ` · ${visibleCount} visible` : ''}
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

        <div className="session-compare-panel__summary-strip">
          {renderLeaderMetric(items, 'range')}
          {renderLeaderMetric(items, 'rssi')}
          {renderLeaderMetric(items, 'snr')}
        </div>

        {!hasRangeData ? (
          <div className="session-compare-panel__notice">
            Home/base coordinates are required to rank max range and edge signal.
          </div>
        ) : null}
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
              style={swatchStyle}
            >
              <div className="session-compare-panel__item-top">
                <div className="session-compare-panel__identity">
                  <span className="session-compare-panel__swatch" aria-hidden="true" />
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
                <>
                  <div className="session-compare-panel__headline">
                    <span className="session-compare-panel__headline-label">Max range</span>
                    <strong>{formatDistanceMeters(item.farthestPoint?.distanceMeters ?? null)}</strong>
                    <span>{formatSessionTimestamp(item.farthestPoint?.capturedAt ?? null)}</span>
                  </div>
                  <dl className="session-compare-panel__metrics">
                    <div>
                      <dt>Edge RSSI</dt>
                      <dd>{formatSignalMetric(item.farthestPoint?.rssi ?? null, 'rssi')}</dd>
                    </div>
                    <div>
                      <dt>Edge SNR</dt>
                      <dd>{formatSignalMetric(item.farthestPoint?.snr ?? null, 'snr')}</dd>
                    </div>
                    <div>
                      <dt>Last successful</dt>
                      <dd>{formatDistanceMeters(item.lastRangePoint?.distanceMeters ?? null)}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{formatSessionDuration(item.durationMs)}</dd>
                    </div>
                    <div>
                      <dt>Measurements</dt>
                      <dd>{formatMeasurementCount(item.measurementCount)}</dd>
                    </div>
                    <div>
                      <dt>Total distance</dt>
                      <dd>{formatDistanceMeters(item.distanceMeters)}</dd>
                    </div>
                    <div>
                      <dt>Median RSSI</dt>
                      <dd>{formatSignalMetric(item.medianRssi, 'rssi')}</dd>
                    </div>
                    <div>
                      <dt>Median SNR</dt>
                      <dd>{formatSignalMetric(item.medianSnr, 'snr')}</dd>
                    </div>
                  </dl>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
