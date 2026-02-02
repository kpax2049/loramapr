import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import simplify from 'simplify-js';

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
  measurements?: MapPoint[];
  track?: TrackPoint[];
  showPoints?: boolean;
  showTrack?: boolean;
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  onZoomChange?: (zoom: number) => void;
  selectedPointId?: string | null;
  onSelectPoint?: (id: string) => void;
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

function boundsToBbox(bounds: L.LatLngBounds): [number, number, number, number] {
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();

  return [southWest.lng, southWest.lat, northEast.lng, northEast.lat];
}

function BoundsListener({
  onChange,
  onZoomChange
}: {
  onChange?: (bbox: [number, number, number, number]) => void;
  onZoomChange?: (zoom: number) => void;
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

function zoomToTolerance(zoom: number): number {
  const clampedZoom = Math.min(Math.max(zoom, 1), 20);
  const tolerance = 0.5 / Math.pow(2, clampedZoom);
  return Math.max(0.00005, Math.min(0.05, tolerance));
}

type RssiBucket = 'strong' | 'medium' | 'weak' | 'unknown' | 'default';

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

type PointPalette = Record<RssiBucket, string>;

function readPalette(): PointPalette {
  if (typeof window === 'undefined') {
    return {
      strong: '',
      medium: '',
      weak: '',
      unknown: '',
      default: ''
    };
  }
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name).trim();

  return {
    strong: read('--map-point-strong'),
    medium: read('--map-point-medium'),
    weak: read('--map-point-weak'),
    unknown: read('--map-point-unknown'),
    default: read('--map-point-default')
  };
}

function configureLeafletIcons() {
  L.Icon.Default.mergeOptions({
    iconUrl: markerIconUrl,
    iconRetinaUrl: markerRetinaUrl,
    shadowUrl: markerShadowUrl
  });
}

export default function MapView({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  measurements = [],
  track = [],
  showPoints = true,
  showTrack = true,
  onBoundsChange,
  onZoomChange,
  selectedPointId = null,
  onSelectPoint
}: MapViewProps) {
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const palette = useMemo(() => readPalette(), []);

  useEffect(() => {
    configureLeafletIcons();
  }, []);

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

  useEffect(() => {
    if (onZoomChange) {
      onZoomChange(currentZoom);
    }
  }, [currentZoom, onZoomChange]);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      preferCanvas={true}
      style={{ height: '100vh', width: '100%' }}
    >
      <BoundsListener onChange={onBoundsChange} onZoomChange={setCurrentZoom} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {showTrack && trackPositions.length > 0 && (
        <Polyline
          positions={trackPositions}
          pathOptions={{ color: '#0f172a', weight: 3, opacity: 0.7 }}
        />
      )}
      {showPoints &&
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
    </MapContainer>
  );
}

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
