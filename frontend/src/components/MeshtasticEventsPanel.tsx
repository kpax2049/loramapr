import { Fragment, useMemo, useState } from 'react';
import { useMeshtasticEvent, useMeshtasticEvents } from '../query/meshtastic';

type MeshtasticEventsPanelProps = {
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

function collectGpsFields(value: unknown, path: string[], depth: number, out: Set<string>) {
  if (depth <= 0) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectGpsFields(entry, [...path, `[${index}]`], depth - 1, out));
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const lower = key.toLowerCase();
    const nextPath = [...path, key];
    if (
      lower === 'lat' ||
      lower === 'lon' ||
      lower === 'latitude' ||
      lower === 'longitude' ||
      lower === 'latitudei' ||
      lower === 'longitudei' ||
      lower === 'latitude_i' ||
      lower === 'longitude_i'
    ) {
      out.add(nextPath.join('.'));
    }
    collectGpsFields(nested, nextPath, depth - 1, out);
  }
}

function getGpsFields(payload: unknown): string[] {
  const fields = new Set<string>();
  collectGpsFields(payload, [], 4, fields);
  return Array.from(fields.values());
}

export default function MeshtasticEventsPanel({ deviceUid }: MeshtasticEventsPanelProps) {
  const { data: eventsResponse, isLoading, refetch, error } = useMeshtasticEvents(deviceUid, 50);
  const events = eventsResponse?.items ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: detail, isLoading: isDetailLoading, error: detailError } = useMeshtasticEvent(
    expandedId
  );

  const detailPayload = detail?.payload;
  const gpsFields = useMemo(() => getGpsFields(detailPayload), [detailPayload]);
  const hasGps = gpsFields.length > 0;
  const listErrorMessage = getErrorMessage(error);
  const listErrorStatus = getErrorStatus(error);
  const detailErrorMessage = getErrorMessage(detailError);
  const detailErrorStatus = getErrorStatus(detailError);
  const authErrorMessage =
    'Meshtastic debug endpoints require X-API-Key (QUERY scope). Set VITE_QUERY_API_KEY.';
  const listErrorHint = listErrorStatus === 401 || listErrorStatus === 403 ? authErrorMessage : null;
  const detailErrorHint =
    detailErrorStatus === 401 || detailErrorStatus === 403 ? authErrorMessage : null;

  return (
    <section className="lorawan-panel" aria-label="Meshtastic events">
      <div className="lorawan-panel__header">
        <h3>Meshtastic events</h3>
      </div>
      <div className="lorawan-panel__actions">
        <button type="button" onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

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
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const isExpanded = expandedId === event.id;
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
                    </tr>
                    {isExpanded ? (
                      <tr className="lorawan-panel__details-row">
                        <td colSpan={5}>
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
                              <dt>GPS detected</dt>
                              <dd>{hasGps ? 'Yes' : 'No'}</dd>
                              <dt>GPS fields</dt>
                              <dd>{hasGps ? gpsFields.join(', ') : '—'}</dd>
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
