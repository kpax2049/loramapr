import {
  useCallback,
  forwardRef,
  type MutableRefObject,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  Polyline,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import simplify from 'simplify-js';
import type { CoverageBin } from '../api/types';
import DeviceIcon, {
  buildDeviceIdentityLabel,
  getDeviceIconDefinition,
  getEffectiveIconKey,
  type DeviceIdentityInput,
  type DeviceIconKey
} from './DeviceIcon';
import { createDeviceDivIcon } from '../map/deviceMarkerIcon';
import {
  getDeviceOnlineStatuses,
  type DeviceStatusBucket
} from '../utils/deviceOnlineStatus';
import { createHomeGeofenceDivIcon } from '../map/homeGeofenceMarkerIcon';

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_ZOOM = 12;
const FIORD_STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord';
const FIORD_ATTRIBUTION =
  '&copy; <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

const markerIconUrl = new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString();
const markerRetinaUrl = new URL(
  'leaflet/dist/images/marker-icon-2x.png',
  import.meta.url,
).toString();
const markerShadowUrl = new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString();

type MapViewProps = {
  center?: [number, number];
  zoom?: number;
  theme?: 'light' | 'dark';
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
  interactionEnabled?: boolean;
  playbackCursorPosition?: [number, number] | null;
  latestLocationMarker?: LatestLocationMarker | null;
  showLatestLocationMarker?: boolean;
  deviceLocationMarkers?: DeviceLocationMarker[];
  homeGeofenceOverlay?: HomeGeofenceOverlay | null;
  onSelectDeviceMarker?: (deviceId: string) => void;
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
  iconOverride?: boolean | null;
  iconKey?: DeviceIconKey | string | null;
  capturedAt: string | null;
  latestMeasurementAt?: string | null;
  latestWebhookReceivedAt?: string | null;
  lat: number;
  lon: number;
  rssi: number | null;
  snr: number | null;
  gatewayId: string | null;
};

type DeviceLocationMarker = LatestLocationMarker & {
  deviceId: string;
  latestWebhookSource?: string | null;
};

type HomeGeofenceOverlay = {
  lat: number;
  lon: number;
  radiusMeters: number;
};

type DeviceMarkerStatus = {
  measurementStatus: DeviceStatusBucket;
  webhookStatus: DeviceStatusBucket;
};

export type MapViewHandle = {
  fitBounds: (bounds: L.LatLngBoundsExpression, options?: L.FitBoundsOptions) => void;
  focusPoint: (point: [number, number], fallbackZoom?: number) => void;
};

function buildDeviceMarkerRenderKey(
  deviceId: string,
  iconKey: DeviceIconKey,
  status: DeviceMarkerStatus,
  theme: 'light' | 'dark'
): string {
  return [
    deviceId,
    iconKey,
    status.measurementStatus,
    status.webhookStatus,
    theme
  ].join('-');
}

function boundsToBbox(bounds: L.LatLngBounds): [number, number, number, number] | null {
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  const values = [southWest.lng, southWest.lat, northEast.lng, northEast.lat] as const;
  if (values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return [values[0], values[1], values[2], values[3]];
}

function toSafeBounds(bounds: L.LatLngBoundsExpression): L.LatLngBounds | null {
  try {
    const normalized = L.latLngBounds(bounds);
    const southWest = normalized.getSouthWest();
    const northEast = normalized.getNorthEast();
    if (
      !Number.isFinite(southWest.lat) ||
      !Number.isFinite(southWest.lng) ||
      !Number.isFinite(northEast.lat) ||
      !Number.isFinite(northEast.lng)
    ) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function toSafePoint(point: [number, number]): [number, number] | null {
  const [lat, lon] = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return [lat, lon];
}

function hasFiniteLatLon(point: { lat: number; lon: number }): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon);
}

function hasFiniteBinCoordinates(bin: Pick<CoverageBin, 'latBin' | 'lonBin'>): boolean {
  return Number.isFinite(bin.latBin) && Number.isFinite(bin.lonBin);
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
  const map = useMap();

  const emitBounds = () => {
    if (!onChange) {
      return;
    }
    try {
      const bbox = boundsToBbox(map.getBounds());
      if (bbox) {
        onChange(bbox);
      }
    } catch {
      // Ignore transient invalid Leaflet bounds states caused by bad/stale layer data.
    }
  };

  const emitZoom = () => {
    if (!onZoomChange) {
      return;
    }
    const zoom = map.getZoom();
    if (Number.isFinite(zoom)) {
      onZoomChange(zoom);
    }
  };

  useMapEvents({
    load: () => {
      emitBounds();
      emitZoom();
    },
    moveend: () => {
      emitBounds();
    },
    dragstart: () => {
      onUserInteraction?.();
    },
    zoomstart: () => {
      onUserInteraction?.();
    },
    zoomend: () => {
      emitBounds();
      emitZoom();
    }
  });

  useEffect(() => {
    emitBounds();
    emitZoom();
  }, [map, onChange, onZoomChange]);

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

function FiordStyleLayer({ styleUrl, attribution }: { styleUrl: string; attribution: string }) {
  const map = useMap();

  useEffect(() => {
    const layer = L.maplibreGL({ style: styleUrl });
    layer.addTo(map);
    map.attributionControl?.addAttribution(attribution);

    return () => {
      map.attributionControl?.removeAttribution(attribution);
      map.removeLayer(layer);
    };
  }, [map, styleUrl, attribution]);

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

type HomeGeofencePalette = {
  stroke: string;
  fill: string;
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

function readHomeGeofencePalette(): HomeGeofencePalette {
  if (typeof window === 'undefined') {
    return {
      stroke: 'rgba(14, 165, 233, 0.62)',
      fill: 'rgba(14, 165, 233, 0.16)'
    };
  }

  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim();
    return value.length > 0 ? value : fallback;
  };

  return {
    stroke: read('--map-home-geofence-stroke', 'rgba(14, 165, 233, 0.62)'),
    fill: read('--map-home-geofence-fill', 'rgba(14, 165, 233, 0.16)')
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
  theme = 'light',
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
  interactionEnabled = true,
  playbackCursorPosition = null,
  latestLocationMarker = null,
  showLatestLocationMarker = true,
  deviceLocationMarkers = [],
  homeGeofenceOverlay = null,
  onSelectDeviceMarker,
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
  const markerIconCacheRef = useRef<Map<string, L.DivIcon>>(new Map());

  const getMemoizedDeviceDivIcon = useCallback(
    (options: {
      iconKey: DeviceIconKey;
      badgeText?: string;
      status: DeviceMarkerStatus;
      theme: 'light' | 'dark';
      size: number;
    }): L.DivIcon => {
      const cacheKey = [
        options.iconKey,
        options.badgeText ?? '',
        options.status.measurementStatus,
        options.status.webhookStatus,
        options.theme,
        String(options.size)
      ].join('|');
      const cache = markerIconCacheRef.current;
      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }
      const created = createDeviceDivIcon(options);
      cache.set(cacheKey, created);
      return created;
    },
    []
  );

  useEffect(() => {
    configureLeafletIcons();
  }, []);

  useImperativeHandle(ref, () => ({
    fitBounds: (bounds, options) => {
      if (mapRef.current) {
        const safeBounds = toSafeBounds(bounds);
        if (!safeBounds) {
          return;
        }
        try {
          mapRef.current.fitBounds(safeBounds, options ?? { padding: [20, 20], maxZoom: 17 });
        } catch {
          // Ignore invalid-layer zoom failures caused by transient bad data.
        }
      }
    },
    focusPoint: (point, fallbackZoom = 16) => {
      if (!mapRef.current) {
        return;
      }
      const safePoint = toSafePoint(point);
      if (!safePoint) {
        return;
      }
      const currentZoom = mapRef.current.getZoom();
      const targetZoom = Number.isFinite(currentZoom)
        ? Math.max(currentZoom, fallbackZoom)
        : fallbackZoom;
      try {
        mapRef.current.setView(safePoint, targetZoom);
      } catch {
        // Ignore invalid-layer pan failures caused by transient bad data.
      }
    }
  }));

  const trackPositions = useMemo(() => {
    if (!showTrack || track.length === 0) {
      return [];
    }
    const validTrack = track.filter(hasFiniteLatLon);
    if (validTrack.length === 0) {
      return [];
    }
    if (validTrack.length <= 2) {
      return validTrack.map((point) => [point.lat, point.lon] as [number, number]);
    }

    const tolerance = zoomToTolerance(currentZoom);
    const points = validTrack.map((point) => ({ x: point.lon, y: point.lat }));
    const simplified = simplify(points, tolerance, true);
    const positions = simplified.map((point) => [point.y, point.x] as [number, number]);

    const first = [validTrack[0].lat, validTrack[0].lon] as [number, number];
    const last = [
      validTrack[validTrack.length - 1].lat,
      validTrack[validTrack.length - 1].lon
    ] as [number, number];
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
    const validOverview = overviewTrack.filter(hasFiniteLatLon);
    if (validOverview.length === 0) {
      return [];
    }
    if (validOverview.length <= 2) {
      return validOverview.map((point) => [point.lat, point.lon] as [number, number]);
    }

    const tolerance = zoomToTolerance(currentZoom);
    const points = validOverview.map((point) => ({ x: point.lon, y: point.lat }));
    const simplified = simplify(points, tolerance, true);
    const positions = simplified.map((point) => [point.y, point.x] as [number, number]);

    const first = [validOverview[0].lat, validOverview[0].lon] as [number, number];
    const last = [
      validOverview[validOverview.length - 1].lat,
      validOverview[validOverview.length - 1].lon
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
    const bins = coverageBins.flatMap((bin) => {
      if (!hasFiniteBinCoordinates(bin)) {
        return [];
      }
      const minLat = bin.latBin * coverageBinSize;
      const minLon = bin.lonBin * coverageBinSize;
      const maxLat = minLat + coverageBinSize;
      const maxLon = minLon + coverageBinSize;
      if (
        !Number.isFinite(minLat) ||
        !Number.isFinite(minLon) ||
        !Number.isFinite(maxLat) ||
        !Number.isFinite(maxLon)
      ) {
        return [];
      }
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

  const latestLocationIconInput = useMemo<DeviceIdentityInput | null>(() => {
    if (!latestLocationMarker) {
      return null;
    }
    return {
      name: latestLocationMarker.deviceName,
      longName: latestLocationMarker.longName,
      shortName: latestLocationMarker.shortName,
      deviceUid: latestLocationMarker.deviceUid,
      hwModel: latestLocationMarker.hwModel,
      role: latestLocationMarker.role,
      iconOverride: latestLocationMarker.iconOverride,
      iconKey: latestLocationMarker.iconKey
    };
  }, [latestLocationMarker]);

  const latestLocationIconKey = latestLocationIconInput ? getEffectiveIconKey(latestLocationIconInput) : 'unknown';
  const latestLocationIconDefinition = getDeviceIconDefinition(latestLocationIconKey);
  const resolvedMarkerTheme = useMemo<'light' | 'dark'>(() => {
    const documentTheme = typeof document !== 'undefined' ? document.documentElement.dataset.theme : null;
    return documentTheme === 'light' || documentTheme === 'dark' ? documentTheme : theme;
  }, [theme]);
  const homeGeofencePalette = useMemo(
    () => readHomeGeofencePalette(),
    [resolvedMarkerTheme]
  );
  const homeGeofenceDivIcon = useMemo(
    () =>
      createHomeGeofenceDivIcon({
        theme: resolvedMarkerTheme,
        size: 28
      }),
    [resolvedMarkerTheme]
  );
  const hasHomeGeofenceOverlay = useMemo(() => {
    if (!homeGeofenceOverlay) {
      return false;
    }
    return (
      Number.isFinite(homeGeofenceOverlay.lat) &&
      Number.isFinite(homeGeofenceOverlay.lon) &&
      Number.isFinite(homeGeofenceOverlay.radiusMeters) &&
      homeGeofenceOverlay.radiusMeters > 0
    );
  }, [homeGeofenceOverlay]);
  const homeGeofenceCenter = hasHomeGeofenceOverlay
    ? ([homeGeofenceOverlay?.lat ?? 0, homeGeofenceOverlay?.lon ?? 0] as [number, number])
    : null;
  const latestLocationStatuses = useMemo(() => {
    if (!latestLocationMarker) {
      return { measurementStatus: 'unknown', webhookStatus: 'unknown' } as const;
    }
    return getDeviceOnlineStatuses({
      latestMeasurementAt: latestLocationMarker.latestMeasurementAt ?? latestLocationMarker.capturedAt,
      latestWebhookReceivedAt: latestLocationMarker.latestWebhookReceivedAt ?? null
    });
  }, [
    latestLocationMarker?.capturedAt,
    latestLocationMarker?.latestMeasurementAt,
    latestLocationMarker?.latestWebhookReceivedAt
  ]);
  const latestLocationDivIcon = useMemo(() => {
    if (!latestLocationMarker) {
      return null;
    }
    return getMemoizedDeviceDivIcon({
      iconKey: latestLocationIconKey,
      badgeText: latestLocationIconDefinition.badgeText ?? undefined,
      status: latestLocationStatuses,
      theme: resolvedMarkerTheme,
      size: 32
    });
  }, [
    latestLocationIconKey,
    latestLocationIconDefinition.badgeText,
    latestLocationStatuses.measurementStatus,
    latestLocationStatuses.webhookStatus,
    resolvedMarkerTheme,
    getMemoizedDeviceDivIcon
  ]);
  const latestLocationMarkerRenderKey = useMemo(() => {
    if (!latestLocationMarker) {
      return null;
    }
    return buildDeviceMarkerRenderKey(
      latestLocationMarker.deviceUid,
      latestLocationIconKey,
      latestLocationStatuses,
      resolvedMarkerTheme
    );
  }, [
    latestLocationMarker,
    latestLocationIconKey,
    latestLocationStatuses.measurementStatus,
    latestLocationStatuses.webhookStatus,
    resolvedMarkerTheme
  ]);
  const deviceLocationMarkerEntries = useMemo(() => {
    if (deviceLocationMarkers.length === 0) {
      return [];
    }

    return deviceLocationMarkers
      .flatMap((marker) => {
        if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lon)) {
          return [];
        }

        const iconInput: DeviceIdentityInput = {
          name: marker.deviceName,
          longName: marker.longName,
          shortName: marker.shortName,
          deviceUid: marker.deviceUid,
          hwModel: marker.hwModel,
          role: marker.role,
          iconOverride: marker.iconOverride,
          iconKey: marker.iconKey
        };
        const iconKey = getEffectiveIconKey(iconInput);
        const iconDefinition = getDeviceIconDefinition(iconKey);
        const status = getDeviceOnlineStatuses({
          latestMeasurementAt: marker.latestMeasurementAt ?? marker.capturedAt,
          latestWebhookReceivedAt: marker.latestWebhookReceivedAt ?? null
        });
        const icon = getMemoizedDeviceDivIcon({
          iconKey,
          badgeText: iconDefinition.badgeText ?? undefined,
          status,
          theme: resolvedMarkerTheme,
          size: 30
        });
        const markerRenderKey = buildDeviceMarkerRenderKey(
          marker.deviceId,
          iconKey,
          status,
          resolvedMarkerTheme
        );

        return {
          marker,
          iconInput,
          iconKey,
          iconDefinition,
          icon,
          markerRenderKey
        };
      });
  }, [deviceLocationMarkers, resolvedMarkerTheme, getMemoizedDeviceDivIcon]);
  const tileConfig = useMemo(
    () => ({
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }),
    []
  );

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      preferCanvas={true}
      dragging={interactionEnabled}
      touchZoom={interactionEnabled}
      doubleClickZoom={interactionEnabled}
      scrollWheelZoom={interactionEnabled}
      boxZoom={interactionEnabled}
      keyboard={interactionEnabled}
      zoomControl={interactionEnabled}
      className="map-view"
      data-tour="map"
      style={{ height: '100%', width: '100%' }}
    >
      <MapInstanceSync mapRef={mapRef} />
      <MapResizeSync />
      <BoundsListener
        onChange={onBoundsChange}
        onZoomChange={setCurrentZoom}
        onUserInteraction={onUserInteraction}
      />
      {theme === 'dark' ? (
        <FiordStyleLayer styleUrl={FIORD_STYLE_URL} attribution={FIORD_ATTRIBUTION} />
      ) : (
        <TileLayer
          key={`tile-${theme}`}
          attribution={tileConfig.attribution}
          url={tileConfig.url}
          subdomains={['a', 'b', 'c']}
        />
      )}
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
          Number.isFinite(measurement.lat) && Number.isFinite(measurement.lon) ? (
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
          ) : null
        ))}
      {mapLayerMode === 'points' &&
        showPoints &&
        measurements.map((measurement) => {
          if (!Number.isFinite(measurement.lat) || !Number.isFinite(measurement.lon)) {
            return null;
          }
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
      {deviceLocationMarkerEntries.map(({ marker, icon, iconInput, iconKey, iconDefinition, markerRenderKey }) => (
        <Marker
          key={markerRenderKey}
          position={[marker.lat, marker.lon]}
          icon={icon}
          eventHandlers={
            onSelectDeviceMarker
              ? {
                  click: () => onSelectDeviceMarker(marker.deviceId)
                }
              : undefined
          }
        >
          <Popup className="map-latest-tooltip" autoPan={true}>
            <div>
              <div className="map-latest-tooltip__title">Latest device location</div>
              <div className="map-latest-tooltip__row">
                <span>Device</span>
                <strong className="map-latest-tooltip__device">
                  <DeviceIcon
                    device={iconInput}
                    iconKey={iconKey}
                    className="map-latest-tooltip__device-icon"
                    size={13}
                    title={iconDefinition.label}
                  />
                  <span>{buildDeviceIdentityLabel(iconInput)}</span>
                </strong>
              </div>
              <div className="map-latest-tooltip__row">
                <span>capturedAt</span>
                <strong>{formatTimestamp(marker.capturedAt ?? undefined)}</strong>
              </div>
              <div className="map-latest-tooltip__row">
                <span>lat/lon</span>
                <strong>
                  {formatCoordinate(marker.lat)}, {formatCoordinate(marker.lon)}
                </strong>
              </div>
              {marker.rssi !== null && marker.rssi !== undefined ? (
                <div className="map-latest-tooltip__row">
                  <span>rssi</span>
                  <strong>{marker.rssi}</strong>
                </div>
              ) : null}
              {marker.snr !== null && marker.snr !== undefined ? (
                <div className="map-latest-tooltip__row">
                  <span>snr</span>
                  <strong>{marker.snr}</strong>
                </div>
              ) : null}
              {marker.gatewayId ? (
                <div className="map-latest-tooltip__row">
                  <span>gatewayId</span>
                  <strong>{marker.gatewayId}</strong>
                </div>
              ) : null}
            </div>
          </Popup>
        </Marker>
      ))}
      {showLatestLocationMarker && latestLocationMarker && latestLocationDivIcon ? (
        Number.isFinite(latestLocationMarker.lat) && Number.isFinite(latestLocationMarker.lon) ? (
          <Marker
            key={latestLocationMarkerRenderKey ?? latestLocationMarker.deviceUid}
            position={[latestLocationMarker.lat, latestLocationMarker.lon]}
            icon={latestLocationDivIcon}
          >
            <Popup className="map-latest-tooltip" autoPan={true}>
              <div>
                <div className="map-latest-tooltip__title">Latest device location</div>
                <div className="map-latest-tooltip__row">
                  <span>Device</span>
                  <strong className="map-latest-tooltip__device">
                    <DeviceIcon
                      device={latestLocationIconInput ?? {}}
                      iconKey={latestLocationIconKey}
                      className="map-latest-tooltip__device-icon"
                      size={13}
                      title={latestLocationIconDefinition.label}
                    />
                    <span>
                      {buildDeviceIdentityLabel(
                        latestLocationIconInput ?? {
                          deviceUid: latestLocationMarker.deviceUid
                        }
                      )}
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
            </Popup>
          </Marker>
        ) : null
      ) : null}
      {hasHomeGeofenceOverlay && homeGeofenceCenter ? (
        <>
          <Circle
            center={homeGeofenceCenter}
            radius={homeGeofenceOverlay?.radiusMeters ?? 0}
            pathOptions={{
              className: 'map-home-geofence-circle',
              color: homeGeofencePalette.stroke,
              fill: true,
              fillColor: homeGeofencePalette.fill,
              fillOpacity: 0.16,
              opacity: 0.72,
              weight: 1.4
            }}
            interactive={false}
          />
          <Marker position={homeGeofenceCenter} icon={homeGeofenceDivIcon} interactive={false} />
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
