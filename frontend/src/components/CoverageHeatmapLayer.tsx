import { useCallback, useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

export type CoverageHeatPoint = [number, number, number];

const HEATMAP_BASE_RADIUS = 42;
const HEATMAP_BASE_BLUR = 36;
const HEATMAP_MIN_OPACITY = 0.32;
const HEATMAP_FALLBACK_MAX_ZOOM = 20;
const HEATMAP_ZOOM_PIVOT = 14;
const HEATMAP_ZOOM_RADIUS_STEP = 8;
const HEATMAP_ZOOM_BLUR_STEP = 6;
const HEATMAP_MAX_RADIUS = 110;
const HEATMAP_MAX_BLUR = 84;

type CoverageHeatmapLayerProps = {
  points: CoverageHeatPoint[];
};

export default function CoverageHeatmapLayer({ points }: CoverageHeatmapLayerProps) {
  const map = useMap();
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const zoomHandlerRef = useRef<(() => void) | null>(null);
  const pointsRef = useRef(points);

  pointsRef.current = points;

  const buildLayerOptions = useCallback((zoom: number): L.HeatMapOptions => {
    const mapMaxZoom = map.getMaxZoom();
    const normalizedZoom = Number.isFinite(zoom) ? zoom : HEATMAP_ZOOM_PIVOT;
    const zoomDelta = Math.max(0, normalizedZoom - HEATMAP_ZOOM_PIVOT);
    return {
      radius: Math.min(HEATMAP_MAX_RADIUS, HEATMAP_BASE_RADIUS + zoomDelta * HEATMAP_ZOOM_RADIUS_STEP),
      blur: Math.min(HEATMAP_MAX_BLUR, HEATMAP_BASE_BLUR + zoomDelta * HEATMAP_ZOOM_BLUR_STEP),
      minOpacity: HEATMAP_MIN_OPACITY,
      maxZoom: Number.isFinite(mapMaxZoom) ? mapMaxZoom : HEATMAP_FALLBACK_MAX_ZOOM
    };
  }, [map]);

  useEffect(() => {
    let isDisposed = false;

    const createLayer = async () => {
      if (typeof window !== 'undefined') {
        (window as Window & { L?: typeof L }).L = L;
      }

      await import('leaflet.heat');
      if (isDisposed) {
        return;
      }

      const layer = L.heatLayer(pointsRef.current, buildLayerOptions(map.getZoom()));
      heatLayerRef.current = layer;
      layer.addTo(map);

      const handleZoomEnd = () => {
        heatLayerRef.current?.setOptions(buildLayerOptions(map.getZoom()));
      };
      zoomHandlerRef.current = handleZoomEnd;
      map.on('zoomend', handleZoomEnd);
    };

    void createLayer();

    return () => {
      isDisposed = true;
      if (zoomHandlerRef.current) {
        map.off('zoomend', zoomHandlerRef.current);
        zoomHandlerRef.current = null;
      }
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, buildLayerOptions]);

  useEffect(() => {
    heatLayerRef.current?.setLatLngs(points);
  }, [points]);

  return null;
}
