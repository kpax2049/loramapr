import { Fragment, useState } from 'react';
import {
  useLorawanEvent,
  useLorawanEvents,
  useLorawanSummary,
  useReprocessLorawanBatch,
  useReprocessLorawanEvent
} from '../query/lorawan';

type LorawanEventsPanelProps = {
  deviceUid?: string;
};

type UnknownRecord = Record<string, unknown>;
type ErrorWithStatus = { status?: number; message?: string };

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as ErrorWithStatus).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error && 'status' in error) {
    const status = (error as ErrorWithStatus).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

function truncate(value: string | null | undefined, length = 12): string {
  if (!value) {
    return '—';
  }
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length)}…`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return '—';
}

function getDecodedPayload(payload: unknown): UnknownRecord | null {
  if (!isRecord(payload)) {
    return null;
  }
  const uplink = payload.uplink_message;
  if (!isRecord(uplink)) {
    return null;
  }
  const decoded = uplink.decoded_payload;
  return isRecord(decoded) ? decoded : null;
}

function hasGpsKeys(decoded: UnknownRecord | null): boolean {
  if (!decoded) {
    return false;
  }
  const keys = Object.keys(decoded);
  const lowerKeys = keys.map((key) => key.toLowerCase());
  if (lowerKeys.includes('lat') || lowerKeys.includes('lon') || lowerKeys.includes('latitude') || lowerKeys.includes('longitude')) {
    return true;
  }
  if (lowerKeys.some((key) => key.startsWith('gps'))) {
    return true;
  }
  const gps = decoded.gps;
  if (isRecord(gps)) {
    const gpsKeys = Object.keys(gps).map((key) => key.toLowerCase());
    if (gpsKeys.includes('lat') || gpsKeys.includes('lon') || gpsKeys.includes('latitude') || gpsKeys.includes('longitude')) {
      return true;
    }
  }
  return false;
}

function pickBestGateway(payload: unknown): {
  gatewayId?: string;
  rssi?: number;
  snr?: number;
} | null {
  if (!isRecord(payload)) {
    return null;
  }
  const uplink = payload.uplink_message;
  if (!isRecord(uplink)) {
    return null;
  }
  const metadata = uplink.rx_metadata;
  if (!Array.isArray(metadata)) {
    return null;
  }

  let best: { gatewayId?: string; rssi?: number; snr?: number } | null = null;
  let bestScore = -Infinity;

  for (const entry of metadata) {
    if (!isRecord(entry)) {
      continue;
    }
    const rssi = typeof entry.rssi === 'number' ? entry.rssi : undefined;
    const snr = typeof entry.snr === 'number' ? entry.snr : undefined;
    const gatewayIds = entry.gateway_ids;
    let gatewayId: string | undefined;

    if (isRecord(gatewayIds) && typeof gatewayIds.gateway_id === 'string') {
      gatewayId = gatewayIds.gateway_id;
    }
    if (typeof entry.gateway_id === 'string') {
      gatewayId = entry.gateway_id;
    }

    const score = rssi ?? snr ?? -Infinity;
    if (score > bestScore) {
      bestScore = score;
      best = { gatewayId, rssi, snr };
    }
  }

  return best;
}

export default function LorawanEventsPanel({ deviceUid }: LorawanEventsPanelProps) {
  const { data: events = [], isLoading, refetch, error } = useLorawanEvents(deviceUid, 50);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: detail, isLoading: isDetailLoading, error: detailError } = useLorawanEvent(expandedId);
  const summaryQuery = useLorawanSummary();
  const reprocessEventMutation = useReprocessLorawanEvent();
  const reprocessBatchMutation = useReprocessLorawanBatch();

  const detailPayload = detail?.payload;
  const decodedPayload = getDecodedPayload(detailPayload);
  const hasGps = hasGpsKeys(decodedPayload);
  const bestGateway = pickBestGateway(detailPayload);
  const listErrorMessage = getErrorMessage(error);
  const listErrorStatus = getErrorStatus(error);
  const detailErrorMessage = getErrorMessage(detailError);
  const detailErrorStatus = getErrorStatus(detailError);
  const authErrorMessage =
    'Lorawan debug endpoints require X-API-Key (QUERY scope). Set VITE_QUERY_API_KEY.';
  const listErrorHint = listErrorStatus === 401 || listErrorStatus === 403 ? authErrorMessage : null;
  const detailErrorHint =
    detailErrorStatus === 401 || detailErrorStatus === 403 ? authErrorMessage : null;
  const summary = summaryQuery.data;

  const handleReprocessMissingGps = () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    reprocessBatchMutation.mutate({ processingError: 'missing_gps', since });
  };

  return (
    <section className="lorawan-panel" aria-label="LoRaWAN events">
      <div className="lorawan-panel__header">
        <h3>LoRaWAN events</h3>
      </div>
      <div className="lorawan-panel__actions">
        <button
          type="button"
          onClick={handleReprocessMissingGps}
          disabled={reprocessBatchMutation.isPending}
        >
          {reprocessBatchMutation.isPending ? 'Reprocessing…' : 'Reprocess missing_gps'}
        </button>
        <button type="button" onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {summary ? (
        <div className="lorawan-panel__summary">
          <div className="lorawan-panel__summary-row">
            <span>Total</span>
            <strong>{summary.totalEvents}</strong>
            <span>Processed</span>
            <strong>{summary.processedEvents}</strong>
            <span>Pending</span>
            <strong>{summary.unprocessedEvents}</strong>
          </div>
          <div className="lorawan-panel__summary-row">
            <span>Last event</span>
            <strong>{formatTimestamp(summary.lastEventReceivedAt)}</strong>
            <span>Last measurement</span>
            <strong>{formatTimestamp(summary.lastMeasurementCreatedAt)}</strong>
          </div>
        </div>
      ) : summaryQuery.isError ? (
        <div className="lorawan-panel__summary-error">Summary unavailable</div>
      ) : null}

      {listErrorMessage ? (
        <div className="lorawan-panel__error">
          <div>{listErrorHint ?? listErrorMessage}</div>
          {listErrorHint && listErrorHint !== listErrorMessage ? <div>{listErrorMessage}</div> : null}
        </div>
      ) : null}

      {events.length === 0 && !isLoading && !listErrorMessage ? (
        <div className="lorawan-panel__empty">No events</div>
      ) : (
        <div className="lorawan-panel__table-wrapper">
          <table className="lorawan-panel__table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Processed</th>
                <th>Device</th>
                <th>Error</th>
                <th>Uplink</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const isExpanded = expandedId === event.id;
                const isReprocessing =
                  reprocessEventMutation.isPending && reprocessEventMutation.variables === event.id;
                return (
                  <Fragment key={event.id}>
                    <tr
                      className="lorawan-panel__row"
                      onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    >
                      <td>{formatTimestamp(event.receivedAt)}</td>
                      <td>{formatTimestamp(event.processedAt)}</td>
                      <td>{event.deviceUid ?? '—'}</td>
                      <td>{event.processingError ?? '—'}</td>
                      <td>{truncate(event.uplinkId)}</td>
                      <td>
                        {event.processingError ? (
                          <button
                            type="button"
                            className="lorawan-panel__row-button"
                            onClick={(eventClick) => {
                              eventClick.stopPropagation();
                              reprocessEventMutation.mutate(event.id);
                            }}
                            disabled={isReprocessing}
                          >
                            {isReprocessing ? 'Reprocessing…' : 'Reprocess'}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="lorawan-panel__details-row">
                        <td colSpan={6}>
                          {isDetailLoading ? (
                            <div className="lorawan-panel__details">Loading details…</div>
                          ) : detailError ? (
                            <div className="lorawan-panel__details lorawan-panel__details--error">
                              {detailErrorHint ?? detailErrorMessage ?? 'Failed to load event details.'}
                            </div>
                          ) : (
                            <dl className="lorawan-panel__details">
                              <dt>Device</dt>
                              <dd>{(detail ? detail.deviceUid : event.deviceUid) ?? '—'}</dd>
                              <dt>Processing error</dt>
                              <dd>{(detail ? detail.processingError : event.processingError) ?? '—'}</dd>
                              <dt>GPS in payload</dt>
                              <dd>{hasGps ? 'Yes' : 'No'}</dd>
                              <dt>Best gateway</dt>
                              <dd>
                                {bestGateway
                                  ? `${bestGateway.gatewayId ?? '—'} / ${formatNumber(
                                      bestGateway.rssi
                                    )} / ${formatNumber(bestGateway.snr)}`
                                  : '—'}
                              </dd>
                              <dt>Received</dt>
                              <dd>{formatTimestamp(detail ? detail.receivedAt : event.receivedAt)}</dd>
                              <dt>Processed</dt>
                              <dd>{formatTimestamp(detail ? detail.processedAt : event.processedAt)}</dd>
                            </dl>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
