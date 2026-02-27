import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

export type CoverageHeatPoint = [number, number, number];

const HEATMAP_RADIUS = 18;
const HEATMAP_BLUR = 14;
const HEATMAP_MIN_OPACITY = 0.25;
const HEATMAP_FALLBACK_MAX_ZOOM = 18;

type CoverageHeatmapLayerProps = {
  points: CoverageHeatPoint[];
};

export default function CoverageHeatmapLayer({ points }: CoverageHeatmapLayerProps) {
  const map = useMap();
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const pointsRef = useRef(points);

  pointsRef.current = points;

  const layerOptions = useMemo<L.HeatMapOptions>(() => {
    const mapMaxZoom = map.getMaxZoom();
    return {
      radius: HEATMAP_RADIUS,
      blur: HEATMAP_BLUR,
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

      const layer = L.heatLayer(pointsRef.current, layerOptions);
      heatLayerRef.current = layer;
      layer.addTo(map);
    };

    void createLayer();

    return () => {
      isDisposed = true;
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, layerOptions]);

  useEffect(() => {
    heatLayerRef.current?.setLatLngs(points);
  }, [points]);

  return null;
}
