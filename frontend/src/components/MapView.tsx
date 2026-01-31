import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMapEvents } from 'react-leaflet';
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
  onSelectPoint?: (id: string) => void;
};

type MapPoint = {
  id: string;
  lat: number;
  lon: number;
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
  onSelectPoint
}: MapViewProps) {
  const [currentZoom, setCurrentZoom] = useState(zoom);

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
        measurements.map((measurement) => (
          <CircleMarker
            key={measurement.id}
            center={[measurement.lat, measurement.lon]}
            radius={6}
            pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.8 }}
            eventHandlers={{
              click: () => onSelectPoint?.(measurement.id)
            }}
          />
        ))}
    </MapContainer>
  );
}
