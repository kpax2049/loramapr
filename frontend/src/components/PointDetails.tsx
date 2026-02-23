import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getMeasurements,
  getUnifiedEventById,
  listUnifiedEvents,
  type MeasurementQueryParams
} from '../api/endpoints';
import type { Measurement, UnifiedEventDetail, UnifiedEventListItem } from '../api/types';
import type { EventsNavigationInput } from '../utils/eventsNavigation';

type PointDetailsProps = {
  measurement?: Measurement | null;
  deviceUid?: string | null;
  onOpenEvents?: (input: EventsNavigationInput) => void;
};

function formatValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return String(value);
}

function formatCapturedAt(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getMeasurementEventId(measurement: Measurement): string | null {
  return (
    normalizeOptionalText(measurement.sourceEventId ?? null) ??
    normalizeOptionalText(measurement.eventId ?? null)
  );
}

function resolveDeviceUid(measurement: Measurement, fallbackDeviceUid?: string | null): string | null {
  return normalizeOptionalText(measurement.deviceUid ?? null) ?? normalizeOptionalText(fallbackDeviceUid);
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
}

type DetailRow = {
  label: string;
  value: string;
};

const RAW_EVENT_JSON_EXPANDED_KEY = 'pointDetailsRawEventJsonExpanded';
const ALL_METADATA_EXPANDED_KEY = 'pointDetailsAllMetadataExpanded';

function readStoredExpandedState(key: string, fallback = false): boolean {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (raw === '1') {
    return true;
  }
  if (raw === '0') {
    return false;
  }
  return fallback;
}

function storeExpandedState(key: string, value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(key, value ? '1' : '0');
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return '[Unserializable JSON]';
  }
}

export default function PointDetails({ measurement, deviceUid, onOpenEvents }: PointDetailsProps) {
  const [isOpeningRawPacket, setIsOpeningRawPacket] = useState(false);
  const [rawEventExpanded, setRawEventExpanded] = useState(() =>
    readStoredExpandedState(RAW_EVENT_JSON_EXPANDED_KEY, false)
  );
  const [allMetadataExpanded, setAllMetadataExpanded] = useState(() =>
    readStoredExpandedState(ALL_METADATA_EXPANDED_KEY, false)
  );

  useEffect(() => {
    storeExpandedState(RAW_EVENT_JSON_EXPANDED_KEY, rawEventExpanded);
  }, [rawEventExpanded]);

  useEffect(() => {
    storeExpandedState(ALL_METADATA_EXPANDED_KEY, allMetadataExpanded);
  }, [allMetadataExpanded]);

  const detailQuery = useQuery<Measurement | null>({
    queryKey: [
      'point-details-measurement',
      measurement?.id ?? null,
      measurement?.sessionId ?? null,
      measurement?.deviceId ?? null,
      measurement?.capturedAt ?? null
    ],
    enabled: Boolean(measurement && (measurement.sessionId || measurement.deviceId)),
    staleTime: 15_000,
    queryFn: async ({ signal }) => {
      if (!measurement) {
        return null;
      }

      const params: MeasurementQueryParams = {
        includeRx: true,
        limit: 500
      };

      if (measurement.sessionId) {
        params.sessionId = measurement.sessionId;
      } else if (measurement.deviceId) {
        params.deviceId = measurement.deviceId;
      } else {
        return null;
      }

      const parsedCapturedAt = new Date(measurement.capturedAt);
      if (!Number.isNaN(parsedCapturedAt.getTime())) {
        const iso = parsedCapturedAt.toISOString();
        params.from = iso;
        params.to = iso;
      }

      const response = await getMeasurements(params, { signal });
      return response.items.find((item) => item.id === measurement.id) ?? null;
    }
  });

  const detailMeasurement =
    measurement && detailQuery.data
      ? {
          ...measurement,
          ...detailQuery.data,
          meshtasticRx: detailQuery.data.meshtasticRx ?? measurement.meshtasticRx ?? null
        }
      : measurement;
  const measurementEventId = detailMeasurement ? getMeasurementEventId(detailMeasurement) : null;
  const rawEventQuery = useQuery<UnifiedEventDetail>({
    queryKey: ['point-details-raw-event', measurementEventId],
    enabled: Boolean(measurementEventId),
    staleTime: 15_000,
    queryFn: ({ signal }) => getUnifiedEventById(measurementEventId as string, { signal })
  });
  if (!detailMeasurement) {
    return (
      <aside className="point-details" aria-label="Point details">
        <div className="point-details__empty">Select a point to see details.</div>
      </aside>
    );
  }

  const resolvedDeviceUid = resolveDeviceUid(detailMeasurement, deviceUid);
  const canOpenRawEvents = Boolean(measurementEventId || resolvedDeviceUid) && Boolean(onOpenEvents);
  const capturedAtMs = new Date(detailMeasurement.capturedAt).getTime();
  const hasCapturedAt = Number.isFinite(capturedAtMs);
  const canOpenRawPacket = Boolean(
    onOpenEvents && (measurementEventId || (resolvedDeviceUid && hasCapturedAt))
  );

  const altitude = detailMeasurement.altitude ?? detailMeasurement.alt;
  const gpsQualityRows: DetailRow[] = [];
  if (isPresent(altitude)) {
    gpsQualityRows.push({ label: 'Altitude', value: formatValue(altitude) });
  }
  if (isPresent(detailMeasurement.pdop)) {
    gpsQualityRows.push({ label: 'PDOP', value: formatValue(detailMeasurement.pdop) });
  }
  if (isPresent(detailMeasurement.satsInView)) {
    gpsQualityRows.push({ label: 'satsInView', value: formatValue(detailMeasurement.satsInView) });
  }
  if (isPresent(detailMeasurement.locationSource)) {
    gpsQualityRows.push({
      label: 'locationSource',
      value: formatValue(detailMeasurement.locationSource)
    });
  }
  if (isPresent(detailMeasurement.precisionBits)) {
    gpsQualityRows.push({
      label: 'precisionBits',
      value: formatValue(detailMeasurement.precisionBits)
    });
  }
  if (isPresent(detailMeasurement.groundSpeed)) {
    gpsQualityRows.push({
      label: 'groundSpeed',
      value: formatValue(detailMeasurement.groundSpeed)
    });
  }
  if (isPresent(detailMeasurement.groundTrack)) {
    gpsQualityRows.push({
      label: 'groundTrack',
      value: formatValue(detailMeasurement.groundTrack)
    });
  }

  const meshtasticRxRows: DetailRow[] =
    detailMeasurement.meshtasticRx
      ? [
          { label: 'rxRssi', value: formatValue(detailMeasurement.meshtasticRx.rxRssi) },
          { label: 'rxSnr', value: formatValue(detailMeasurement.meshtasticRx.rxSnr) },
          { label: 'hopLimit', value: formatValue(detailMeasurement.meshtasticRx.hopLimit) },
          { label: 'relayNode', value: formatValue(detailMeasurement.meshtasticRx.relayNode) },
          {
            label: 'transportMechanism',
            value: formatValue(detailMeasurement.meshtasticRx.transportMechanism)
          },
          { label: 'rxTime', value: formatCapturedAt(detailMeasurement.meshtasticRx.rxTime) }
        ]
      : [];
  const rawEventJson = rawEventQuery.data ? stringifyJson(rawEventQuery.data.payloadJson) : null;
  const allMetadataJson = stringifyJson(detailMeasurement);

  const handleOpenRawEvents = () => {
    if (!onOpenEvents) {
      return;
    }

    if (measurementEventId) {
      onOpenEvents({
        eventId: measurementEventId,
        deviceUid: resolvedDeviceUid
      });
      return;
    }

    onOpenEvents({
      deviceUid: resolvedDeviceUid,
      from: hasCapturedAt ? new Date(capturedAtMs - 2 * 60_000).toISOString() : null,
      to: hasCapturedAt ? new Date(capturedAtMs + 2 * 60_000).toISOString() : null
    });
  };

  const handleOpenRawPacket = async () => {
    if (!onOpenEvents) {
      return;
    }

    if (measurementEventId) {
      onOpenEvents({
        eventId: measurementEventId,
        deviceUid: resolvedDeviceUid
      });
      return;
    }

    if (!resolvedDeviceUid || !hasCapturedAt) {
      return;
    }

    const from = new Date(capturedAtMs - 30_000).toISOString();
    const to = new Date(capturedAtMs + 30_000).toISOString();
    setIsOpeningRawPacket(true);

    try {
      let candidates: UnifiedEventListItem[] = [];
      let portnum: string | null = 'POSITION_APP';
      const q = 'position';

      const strictMatch = await listUnifiedEvents({
        deviceUid: resolvedDeviceUid,
        portnum,
        since: from,
        until: to,
        limit: 200
      });
      candidates = strictMatch.items;

      if (candidates.length === 0) {
        const fallbackMatch = await listUnifiedEvents({
          deviceUid: resolvedDeviceUid,
          q,
          since: from,
          until: to,
          limit: 200
        });
        candidates = fallbackMatch.items;
        portnum = null;
      }

      const closest = findClosestEventByTimestamp(candidates, capturedAtMs);
      onOpenEvents({
        deviceUid: resolvedDeviceUid,
        portnum,
        q,
        from,
        to,
        eventId: closest?.id ?? null
      });
    } catch {
      onOpenEvents({
        deviceUid: resolvedDeviceUid,
        portnum: 'POSITION_APP',
        q: 'position',
        from,
        to
      });
    } finally {
      setIsOpeningRawPacket(false);
    }
  };

  return (
    <aside className="point-details" aria-label="Point details">
      <div className="point-details__header">
        <h2>Point details</h2>
        <dl className="point-details__summary">
          <div>
            <dt>Captured at</dt>
            <dd>{formatCapturedAt(detailMeasurement.capturedAt)}</dd>
          </div>
          <div>
            <dt>Session ID</dt>
            <dd>{detailMeasurement.sessionId ?? 'none'}</dd>
          </div>
          <div>
            <dt>Raw events</dt>
            <dd>
              {canOpenRawEvents || canOpenRawPacket ? (
                <div className="point-details__events-links">
                  {canOpenRawEvents ? (
                    <button type="button" className="point-details__events-link" onClick={handleOpenRawEvents}>
                      View raw event(s)
                    </button>
                  ) : null}
                  {canOpenRawPacket ? (
                    <button
                      type="button"
                      className="point-details__events-link"
                      onClick={() => void handleOpenRawPacket()}
                      disabled={isOpeningRawPacket}
                    >
                      {isOpeningRawPacket ? 'Opening…' : 'View raw packet'}
                    </button>
                  ) : null}
                </div>
              ) : '—'}
            </dd>
          </div>
          <div>
            <dt>Latitude</dt>
            <dd>{formatValue(detailMeasurement.lat)}</dd>
          </div>
          <div>
            <dt>Longitude</dt>
            <dd>{formatValue(detailMeasurement.lon)}</dd>
          </div>
        </dl>
      </div>
      <div className="point-details__body">
        <dl>
          <div>
            <dt>RSSI</dt>
            <dd>{formatValue(detailMeasurement.rssi)}</dd>
          </div>
          <div>
            <dt>SNR</dt>
            <dd>{formatValue(detailMeasurement.snr)}</dd>
          </div>
          <div>
            <dt>SF</dt>
            <dd>{formatValue(detailMeasurement.sf)}</dd>
          </div>
          <div>
            <dt>BW</dt>
            <dd>{formatValue(detailMeasurement.bw)}</dd>
          </div>
          <div>
            <dt>Frequency</dt>
            <dd>{formatValue(detailMeasurement.freq)}</dd>
          </div>
          <div>
            <dt>Gateway ID</dt>
            <dd>{formatValue(detailMeasurement.gatewayId)}</dd>
          </div>
        </dl>
        {gpsQualityRows.length > 0 ? (
          <>
            <h3 className="point-details__section-title">GPS quality</h3>
            <dl>
              {gpsQualityRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
        {meshtasticRxRows.length > 0 ? (
          <>
            <h3 className="point-details__section-title">Radio (Meshtastic)</h3>
            <dl>
              {meshtasticRxRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
        <section className="point-details__collapsible">
          <button
            type="button"
            className="point-details__collapsible-toggle"
            onClick={() => setRawEventExpanded((value) => !value)}
            aria-expanded={rawEventExpanded}
            aria-controls="point-details-raw-event-json"
          >
            <span>Raw event JSON</span>
            <span className="point-details__collapsible-symbol">{rawEventExpanded ? '-' : '+'}</span>
          </button>
          {rawEventExpanded ? (
            <div id="point-details-raw-event-json" className="point-details__collapsible-body">
              {measurementEventId ? (
                rawEventQuery.isLoading ? (
                  <div className="point-details__empty">Loading raw event…</div>
                ) : rawEventQuery.error ? (
                  <div className="point-details__empty">Could not load raw event JSON.</div>
                ) : rawEventJson ? (
                  <pre className="point-details__json">{rawEventJson}</pre>
                ) : (
                  <div className="point-details__empty">No raw event JSON available.</div>
                )
              ) : (
                <div className="point-details__empty">No linked source event.</div>
              )}
            </div>
          ) : null}
        </section>
        <section className="point-details__collapsible">
          <button
            type="button"
            className="point-details__collapsible-toggle"
            onClick={() => setAllMetadataExpanded((value) => !value)}
            aria-expanded={allMetadataExpanded}
            aria-controls="point-details-all-metadata"
          >
            <span>All metadata</span>
            <span className="point-details__collapsible-symbol">{allMetadataExpanded ? '-' : '+'}</span>
          </button>
          {allMetadataExpanded ? (
            <div id="point-details-all-metadata" className="point-details__collapsible-body">
              <pre className="point-details__json">{allMetadataJson}</pre>
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

function findClosestEventByTimestamp(
  items: UnifiedEventListItem[],
  targetMs: number
): UnifiedEventListItem | null {
  let closest: UnifiedEventListItem | null = null;
  let smallestDelta = Number.POSITIVE_INFINITY;

  for (const item of items) {
    const itemMs = parseEventTimestampMs(item);
    if (!Number.isFinite(itemMs)) {
      continue;
    }
    const delta = Math.abs(itemMs - targetMs);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      closest = item;
    }
  }

  return closest;
}

function parseEventTimestampMs(item: UnifiedEventListItem): number {
  const payloadTimeMs = item.time ? new Date(item.time).getTime() : Number.NaN;
  if (Number.isFinite(payloadTimeMs)) {
    return payloadTimeMs;
  }
  const receivedAtMs = new Date(item.receivedAt).getTime();
  return Number.isFinite(receivedAtMs) ? receivedAtMs : Number.NaN;
}
