import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

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
  measurements?: MeasurementPoint[];
  track?: TrackPoint[];
  showPoints?: boolean;
  showTrack?: boolean;
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  onSelectPoint?: (id: string) => void;
};

type MeasurementPoint = {
  id: string;
  lat: number;
  lon: number;
  capturedAt: string;
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

function BoundsListener({ onChange }: { onChange?: (bbox: [number, number, number, number]) => void }) {
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
    }
  });

  useEffect(() => {
    if (onChange) {
      onChange(boundsToBbox(map.getBounds()));
    }
  }, [map, onChange]);

  return null;
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
  onSelectPoint
}: MapViewProps) {
  useEffect(() => {
    configureLeafletIcons();
  }, []);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '100vh', width: '100%' }}
    >
      <BoundsListener onChange={onBoundsChange} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {showTrack && track.length > 0 && (
        <Polyline
          positions={track.map((point) => [point.lat, point.lon] as [number, number])}
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
