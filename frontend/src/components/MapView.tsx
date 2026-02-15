import {
  forwardRef,
  type MutableRefObject,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import simplify from 'simplify-js';
import type { CoverageBin } from '../api/types';
import DeviceIcon, { buildDeviceIdentityLabel } from './DeviceIcon';

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_ZOOM = 12;

const markerIconUrl = new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString();
const markerRetinaUrl = new URL(
  'leaflet/dist/images/marker-icon-2x.png',
  import.meta.url,
).toString();
const markerShadowUrl = new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString();

type MapViewProps = {
  center?: [number, number];
  zoom?: number;
  mapLayerMode?: 'points' | 'coverage';
  coverageMetric?: 'count' | 'rssiAvg' | 'snrAvg';
  measurements?: MapPoint[];
  compareMeasurements?: MapPoint[];
  track?: TrackPoint[];
  overviewTrack?: TrackPoint[];
  coverageBins?: CoverageBin[];
  coverageBinSize?: number | null;
  showPoints?: boolean;
  showTrack?: boolean;
  playbackCursorPosition?: [number, number] | null;
  latestLocationMarker?: LatestLocationMarker | null;
  showLatestLocationMarker?: boolean;
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  onZoomChange?: (zoom: number) => void;
  selectedPointId?: string | null;
  onSelectPoint?: (id: string) => void;
  onUserInteraction?: () => void;
  onOverviewSelectTime?: (timeMs: number) => void;
};

type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  capturedAt?: string;
  rssi?: number | null;
  snr?: number | null;
};

type TrackPoint = {
  lat: number;
  lon: number;
  capturedAt: string;
};

type LatestLocationMarker = {
  deviceName: string | null;
  deviceUid: string;
  longName?: string | null;
  shortName?: string | null;
  hwModel?: string | null;
  role?: string | null;
  capturedAt: string | null;
  lat: number;
  lon: number;
  rssi: number | null;
  snr: number | null;
  gatewayId: string | null;
};

export type MapViewHandle = {
  fitBounds: (bounds: L.LatLngBoundsExpression, options?: L.FitBoundsOptions) => void;
  focusPoint: (point: [number, number], fallbackZoom?: number) => void;
};

function boundsToBbox(bounds: L.LatLngBounds): [number, number, number, number] {
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();

  return [southWest.lng, southWest.lat, northEast.lng, northEast.lat];
}

function BoundsListener({
  onChange,
  onZoomChange,
  onUserInteraction
}: {
  onChange?: (bbox: [number, number, number, number]) => void;
  onZoomChange?: (zoom: number) => void;
  onUserInteraction?: () => void;
}) {
  const map = useMapEvents({
    load: () => {
      if (onChange) {
        onChange(boundsToBbox(map.getBounds()));
      }
      if (onZoomChange) {
        onZoomChange(map.getZoom());
      }
    },
    moveend: () => {
      if (onChange) {
        onChange(boundsToBbox(map.getBounds()));
      }
    },
    dragstart: () => {
      onUserInteraction?.();
    },
    zoomstart: () => {
      onUserInteraction?.();
    },
    zoomend: () => {
      if (onChange) {
        onChange(boundsToBbox(map.getBounds()));
      }
      if (onZoomChange) {
        onZoomChange(map.getZoom());
      }
    }
  });

  useEffect(() => {
    if (onChange) {
      onChange(boundsToBbox(map.getBounds()));
    }
    if (onZoomChange) {
      onZoomChange(map.getZoom());
    }
  }, [map, onChange]);

  return null;
}

function MapResizeSync() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let frame: number | null = null;

    const invalidate = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        map.invalidateSize();
      });
    };

    invalidate();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            invalidate();
          })
        : null;

    resizeObserver?.observe(container);
    if (container.parentElement) {
      resizeObserver?.observe(container.parentElement);
    }

    const transitionTarget = container.closest('.layout');
    const handleTransitionEnd = () => {
      invalidate();
    };

    window.addEventListener('resize', invalidate);
    transitionTarget?.addEventListener('transitionend', handleTransitionEnd);

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('resize', invalidate);
      transitionTarget?.removeEventListener('transitionend', handleTransitionEnd);
      resizeObserver?.disconnect();
    };
  }, [map]);

  return null;
}

function MapInstanceSync({ mapRef }: { mapRef: MutableRefObject<L.Map | null> }) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
    return () => {
      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
  }, [map, mapRef]);

  return null;
}

function zoomToTolerance(zoom: number): number {
  const clampedZoom = Math.min(Math.max(zoom, 1), 20);
  const tolerance = 0.5 / Math.pow(2, clampedZoom);
  return Math.max(0.00005, Math.min(0.05, tolerance));
}

type RssiBucket = 'strong' | 'medium' | 'weak' | 'unknown' | 'default';
type CoverageBucket = 'low' | 'med' | 'high';

function getRssiBucket(rssi?: number | null): RssiBucket {
  if (rssi === null || rssi === undefined) {
    return 'default';
  }
  if (!Number.isFinite(rssi)) {
    return 'unknown';
  }
  if (rssi >= -70) {
    return 'strong';
  }
  if (rssi >= -90) {
    return 'medium';
  }
  return 'weak';
}

function getCoverageSnrBucket(snr: number): CoverageBucket {
  if (snr >= 6) {
    return 'high';
  }
  if (snr >= -4) {
    return 'med';
  }
  return 'low';
}

function getCoverageCountBucket(count: number): CoverageBucket {
  if (count >= 21) {
    return 'high';
  }
  if (count >= 6) {
    return 'med';
  }
  return 'low';
}

function getCoverageRssiBucket(rssi: number): CoverageBucket {
  if (rssi >= -89) {
    return 'high';
  }
  if (rssi >= -109) {
    return 'med';
  }
  return 'low';
}

type PointPalette = Record<RssiBucket, string> & {
  cursor: string;
};

function readPalette(): PointPalette {
  if (typeof window === 'undefined') {
    return {
      strong: '',
      medium: '',
      weak: '',
      unknown: '',
      default: '',
      cursor: ''
    };
  }
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name).trim();

  return {
    strong: read('--map-point-strong'),
    medium: read('--map-point-medium'),
    weak: read('--map-point-weak'),
    unknown: read('--map-point-unknown'),
    default: read('--map-point-default'),
    cursor: read('--map-point-cursor')
  };
}

function configureLeafletIcons() {
  L.Icon.Default.mergeOptions({
    iconUrl: markerIconUrl,
    iconRetinaUrl: markerRetinaUrl,
    shadowUrl: markerShadowUrl
  });
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
{
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  mapLayerMode = 'points',
  coverageMetric = 'count',
  measurements = [],
  compareMeasurements = [],
  track = [],
  overviewTrack = [],
  coverageBins = [],
  coverageBinSize = 0.001,
  showPoints = true,
  showTrack = true,
  playbackCursorPosition = null,
  latestLocationMarker = null,
  showLatestLocationMarker = true,
  onBoundsChange,
  onZoomChange,
  selectedPointId = null,
  onSelectPoint,
  onUserInteraction,
  onOverviewSelectTime
},
ref
) {
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const palette = useMemo(() => readPalette(), []);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    configureLeafletIcons();
  }, []);

  useImperativeHandle(ref, () => ({
    fitBounds: (bounds, options) => {
      if (mapRef.current) {
        mapRef.current.fitBounds(bounds, options ?? { padding: [20, 20] });
      }
    },
    focusPoint: (point, fallbackZoom = 16) => {
      if (!mapRef.current) {
        return;
      }
      const currentZoom = mapRef.current.getZoom();
      const targetZoom = Number.isFinite(currentZoom)
        ? Math.max(currentZoom, fallbackZoom)
        : fallbackZoom;
      mapRef.current.setView(point, targetZoom);
    }
  }));

  const trackPositions = useMemo(() => {
    if (!showTrack || track.length === 0) {
      return [];
    }
    if (track.length <= 2) {
      return track.map((point) => [point.lat, point.lon] as [number, number]);
    }

    const tolerance = zoomToTolerance(currentZoom);
    const points = track.map((point) => ({ x: point.lon, y: point.lat }));
    const simplified = simplify(points, tolerance, true);
    const positions = simplified.map((point) => [point.y, point.x] as [number, number]);

    const first = [track[0].lat, track[0].lon] as [number, number];
    const last = [track[track.length - 1].lat, track[track.length - 1].lon] as [number, number];
    if (positions.length > 0) {
      positions[0] = first;
      positions[positions.length - 1] = last;
    }

    return positions;
  }, [track, currentZoom, showTrack]);

  const overviewTrackPoints = useMemo(
    () =>
      overviewTrack
        .map((point) => ({
          lat: point.lat,
          lon: point.lon,
          timeMs: new Date(point.capturedAt).getTime()
        }))
        .filter((point) => Number.isFinite(point.timeMs)),
    [overviewTrack]
  );

  const overviewTrackPositions = useMemo(() => {
    if (!showTrack || overviewTrack.length === 0) {
      return [];
    }
    if (overviewTrack.length <= 2) {
      return overviewTrack.map((point) => [point.lat, point.lon] as [number, number]);
    }

    const tolerance = zoomToTolerance(currentZoom);
    const points = overviewTrack.map((point) => ({ x: point.lon, y: point.lat }));
    const simplified = simplify(points, tolerance, true);
    const positions = simplified.map((point) => [point.y, point.x] as [number, number]);

    const first = [overviewTrack[0].lat, overviewTrack[0].lon] as [number, number];
    const last = [
      overviewTrack[overviewTrack.length - 1].lat,
      overviewTrack[overviewTrack.length - 1].lon
    ] as [number, number];
    if (positions.length > 0) {
      positions[0] = first;
      positions[positions.length - 1] = last;
    }

    return positions;
  }, [overviewTrack, currentZoom, showTrack]);

  useEffect(() => {
    if (onZoomChange) {
      onZoomChange(currentZoom);
    }
  }, [currentZoom, onZoomChange]);

  const coverageData = useMemo(() => {
    if (mapLayerMode !== 'coverage' || coverageBins.length === 0 || !coverageBinSize) {
      return { bins: [] as Array<CoverageBin & { bounds: [[number, number], [number, number]]; bucket: CoverageBucket }> };
    }
    const bins = coverageBins.map((bin) => {
      const minLat = bin.latBin * coverageBinSize;
      const minLon = bin.lonBin * coverageBinSize;
      const maxLat = minLat + coverageBinSize;
      const maxLon = minLon + coverageBinSize;
      const metricValue =
        coverageMetric === 'count'
          ? bin.count
          : coverageMetric === 'snrAvg'
            ? bin.snrAvg ?? 0
            : bin.rssiAvg ?? 0;
      const bucket =
        coverageMetric === 'count'
          ? getCoverageCountBucket(metricValue)
          : coverageMetric === 'snrAvg'
            ? getCoverageSnrBucket(metricValue)
            : getCoverageRssiBucket(metricValue);
      return {
        ...bin,
        bucket,
        bounds: [
          [minLat, minLon],
          [maxLat, maxLon]
        ] as [[number, number], [number, number]]
      };
    });

    return { bins };
  }, [mapLayerMode, coverageBins, coverageBinSize, coverageMetric]);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      preferCanvas={true}
      style={{ height: '100%', width: '100%' }}
    >
      <MapInstanceSync mapRef={mapRef} />
      <MapResizeSync />
      <BoundsListener
        onChange={onBoundsChange}
        onZoomChange={setCurrentZoom}
        onUserInteraction={onUserInteraction}
      />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {showTrack && overviewTrackPositions.length > 0 && (
        <Polyline
          positions={overviewTrackPositions}
          pathOptions={{ className: 'map-track map-track--overview' }}
          eventHandlers={
            onOverviewSelectTime && overviewTrackPoints.length > 0
              ? {
                  click: (event) => {
                    const { lat, lng } = event.latlng;
                    let nearestTime: number | null = null;
                    let nearestDistance = Number.POSITIVE_INFINITY;

                    for (const point of overviewTrackPoints) {
                      const dLat = point.lat - lat;
                      const dLon = point.lon - lng;
                      const distance = dLat * dLat + dLon * dLon;
                      if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestTime = point.timeMs;
                      }
                    }

                    if (nearestTime !== null) {
                      onOverviewSelectTime(nearestTime);
                    }
                  }
                }
              : undefined
          }
        />
      )}
      {showTrack && trackPositions.length > 0 && (
        <Polyline
          positions={trackPositions}
          pathOptions={{ className: 'map-track map-track--window' }}
        />
      )}
      {mapLayerMode === 'coverage' &&
        coverageData.bins.map((bin) => {
          const className = ['coverage-bin', `coverage-bin--${bin.bucket}`].join(' ');
          const fillOpacity = bin.bucket === 'high' ? 0.85 : bin.bucket === 'med' ? 0.6 : 0.35;

          return (
            <Rectangle
              key={`${bin.latBin}-${bin.lonBin}`}
              bounds={bin.bounds}
              pathOptions={{
                weight: 1,
                opacity: 0.7,
                fillOpacity,
                className
              }}
            />
          );
        })}
      {mapLayerMode === 'points' &&
        compareMeasurements.length > 0 &&
        compareMeasurements.map((measurement) => (
          <CircleMarker
            key={`compare-${measurement.id}`}
            center={[measurement.lat, measurement.lon]}
            radius={5}
            pathOptions={{
              className: 'map-point map-point--compare',
              weight: 2,
              fillOpacity: 0.6
            }}
            interactive={false}
          />
        ))}
      {mapLayerMode === 'points' &&
        showPoints &&
        measurements.map((measurement) => {
          const bucket = getRssiBucket(measurement.rssi);
          const color = palette[bucket] || palette.default;
          const isSelected = measurement.id === selectedPointId;
          const className = ['map-point', `map-point--${bucket}`, isSelected ? 'is-selected' : '']
            .filter(Boolean)
            .join(' ');

          return (
            <CircleMarker
              key={measurement.id}
              center={[measurement.lat, measurement.lon]}
              radius={isSelected ? 8 : 6}
              pathOptions={{
                color,
                weight: isSelected ? 3 : 2,
                fillColor: color,
                fillOpacity: 0.85,
                className
              }}
              eventHandlers={{
                click: () => onSelectPoint?.(measurement.id)
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>
                <div>
                  <div>{formatTimestamp(measurement.capturedAt)}</div>
                  {measurement.rssi !== null && measurement.rssi !== undefined && (
                    <div>RSSI: {measurement.rssi}</div>
                  )}
                  {measurement.snr !== null && measurement.snr !== undefined && (
                    <div>SNR: {measurement.snr}</div>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      {mapLayerMode === 'points' && playbackCursorPosition && (
        <CircleMarker
          center={playbackCursorPosition}
          radius={9}
          pathOptions={{
            color: palette.cursor || palette.default,
            weight: 3,
            fillColor: palette.cursor || palette.default,
            fillOpacity: 0.9,
            className: 'map-point map-point--cursor'
          }}
          interactive={false}
        />
      )}
      {showLatestLocationMarker && latestLocationMarker ? (
        <>
          <CircleMarker
            center={[latestLocationMarker.lat, latestLocationMarker.lon]}
            radius={11}
            pathOptions={{
              className: 'map-point map-point--latest-halo',
              weight: 2,
              fillOpacity: 0.2
            }}
            interactive={false}
          />
          <CircleMarker
            center={[latestLocationMarker.lat, latestLocationMarker.lon]}
            radius={7}
            pathOptions={{
              className: 'map-point map-point--latest',
              weight: 3,
              fillOpacity: 0.95
            }}
          >
            <Tooltip className="map-latest-tooltip" direction="top" offset={[0, -8]} opacity={0.95}>
              <div>
                <div className="map-latest-tooltip__title">Latest device location</div>
                <div className="map-latest-tooltip__row">
                  <span>Device</span>
                  <strong className="map-latest-tooltip__device">
                    <DeviceIcon
                      device={{
                        name: latestLocationMarker.deviceName,
                        longName: latestLocationMarker.longName,
                        shortName: latestLocationMarker.shortName,
                        deviceUid: latestLocationMarker.deviceUid,
                        hwModel: latestLocationMarker.hwModel,
                        role: latestLocationMarker.role
                      }}
                      className="map-latest-tooltip__device-icon"
                      size={13}
                    />
                    <span>
                      {buildDeviceIdentityLabel({
                        name: latestLocationMarker.deviceName,
                        longName: latestLocationMarker.longName,
                        shortName: latestLocationMarker.shortName,
                        deviceUid: latestLocationMarker.deviceUid,
                        hwModel: latestLocationMarker.hwModel
                      })}
                    </span>
                  </strong>
                </div>
                <div className="map-latest-tooltip__row">
                  <span>capturedAt</span>
                  <strong>{formatTimestamp(latestLocationMarker.capturedAt ?? undefined)}</strong>
                </div>
                <div className="map-latest-tooltip__row">
                  <span>lat/lon</span>
                  <strong>
                    {formatCoordinate(latestLocationMarker.lat)}, {formatCoordinate(latestLocationMarker.lon)}
                  </strong>
                </div>
                {latestLocationMarker.rssi !== null && latestLocationMarker.rssi !== undefined ? (
                  <div className="map-latest-tooltip__row">
                    <span>rssi</span>
                    <strong>{latestLocationMarker.rssi}</strong>
                  </div>
                ) : null}
                {latestLocationMarker.snr !== null && latestLocationMarker.snr !== undefined ? (
                  <div className="map-latest-tooltip__row">
                    <span>snr</span>
                    <strong>{latestLocationMarker.snr}</strong>
                  </div>
                ) : null}
                {latestLocationMarker.gatewayId ? (
                  <div className="map-latest-tooltip__row">
                    <span>gatewayId</span>
                    <strong>{latestLocationMarker.gatewayId}</strong>
                  </div>
                ) : null}
              </div>
            </Tooltip>
          </CircleMarker>
        </>
      ) : null}
    </MapContainer>
  );
});

export default MapView;

function formatTimestamp(value?: string): string {
  if (!value) {
    return 'Unknown time';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  return value.toFixed(6);
}
