import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type { CoverageBin } from '../api/types';
import type { CoverageMetric } from '../coverage/coverageBuckets';
import HeatmapOverlay from 'heatmap.js/plugins/leaflet-heatmap/leaflet-heatmap.js';

type CoverageHeatmapLayerProps = {
  bins: CoverageBin[];
  binSizeDeg: number | null;
  metric: CoverageMetric;
};

type HeatPoint = {
  lat: number;
  lng: number;
  value: number;
};

type HeatPointWithRadius = HeatPoint & {
  radius: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function interpolate(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax <= inMin) {
    return outMin;
  }
  const ratio = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return outMin + (outMax - outMin) * ratio;
}

function metricToWeight(metric: CoverageMetric, bin: CoverageBin): number {
  if (metric === 'count') {
    return clamp(bin.count / 20, 0, 1);
  }

  if (metric === 'rssiAvg') {
    const value = bin.rssiAvg;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }
    if (value <= -110) {
      return 0.33;
    }
    if (value < -109) {
      return interpolate(value, -110, -109, 0.33, 0.34);
    }
    if (value <= -90) {
      return interpolate(value, -109, -90, 0.34, 0.66);
    }
    if (value < -89) {
      return interpolate(value, -90, -89, 0.66, 1);
    }
    return 1;
  }

  const value = bin.snrAvg;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  if (value <= -5) {
    return 0.33;
  }
  if (value < -4) {
    return interpolate(value, -5, -4, 0.33, 0.34);
  }
  if (value <= 5) {
    return interpolate(value, -4, 5, 0.34, 0.66);
  }
  if (value < 6) {
    return interpolate(value, 5, 6, 0.66, 1);
  }
  return 1;
}

export default function CoverageHeatmapLayer({ bins, binSizeDeg, metric }: CoverageHeatmapLayerProps) {
  const map = useMap();
  const overlayRef = useRef<any>(null);

  const basePoints = useMemo<HeatPoint[]>(() => {
    if (!binSizeDeg || !Number.isFinite(binSizeDeg) || bins.length === 0) {
      return [];
    }

    const points: HeatPoint[] = [];
    for (const bin of bins) {
      if (!Number.isFinite(bin.latBin) || !Number.isFinite(bin.lonBin)) {
        continue;
      }

      const lat = (bin.latBin + 0.5) * binSizeDeg;
      const lng = (bin.lonBin + 0.5) * binSizeDeg;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }

      const weight = metricToWeight(metric, bin);
      if (weight <= 0) {
        continue;
      }

      points.push({
        lat,
        lng,
        value: clamp(weight, 0, 1)
      });
    }

    if (points.length <= 10_000) {
      return points;
    }

    const stride = Math.ceil(points.length / 10_000);
    return points.filter((_, index) => index % stride === 0);
  }, [bins, binSizeDeg, metric]);

  const updateOverlayData = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !binSizeDeg || !Number.isFinite(binSizeDeg)) {
      overlay?.setData({ max: 1, data: [] });
      return;
    }

    const center = map.getCenter();
    const origin = map.latLngToContainerPoint(center);
    const adjacent = map.latLngToContainerPoint([center.lat, center.lng + binSizeDeg]);
    const stepPx = Math.abs(adjacent.x - origin.x);
    const radiusPx = clamp(stepPx * 1.6, 12, 120);

    const data: HeatPointWithRadius[] = basePoints.map((point) => ({
      ...point,
      radius: radiusPx
    }));

    overlay.setData({
      max: 1,
      data
    });
  }, [map, basePoints, binSizeDeg]);

  useEffect(() => {
    const pane = map.getPane('covHeat') ?? map.createPane('covHeat');
    pane.style.zIndex = '450';
    pane.style.pointerEvents = 'none';

    const overlay = new HeatmapOverlay({
      pane: 'covHeat',
      radius: 20,
      scaleRadius: false,
      useLocalExtrema: false,
      maxOpacity: 0.8,
      minOpacity: 0.08,
      blur: 0.85,
      latField: 'lat',
      lngField: 'lng',
      valueField: 'value'
    });

    overlay.addTo(map);
    overlayRef.current = overlay;

    const handleMoveEnd = () => {
      updateOverlayData();
    };

    const handleZoomEnd = () => {
      updateOverlayData();
    };

    map.on('moveend', handleMoveEnd);
    map.on('zoomend', handleZoomEnd);

    updateOverlayData();

    return () => {
      map.off('moveend', handleMoveEnd);
      map.off('zoomend', handleZoomEnd);
      if (overlayRef.current) {
        map.removeLayer(overlayRef.current);
        overlayRef.current = null;
      }
    };
  }, [map, updateOverlayData]);

  useEffect(() => {
    updateOverlayData();
  }, [updateOverlayData]);

  return null;
}
