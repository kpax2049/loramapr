import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type { CoverageBin } from '../api/types';
import type { CoverageMetric } from '../coverage/coverageBuckets';
import HeatmapOverlay from 'heatmap.js/plugins/leaflet-heatmap/leaflet-heatmap.js';

const HEAT_LAYER_OPACITY = 0.5;
const HEAT_MAX_OPACITY = 0.35;
const HEAT_MIN_OPACITY = 0.02;
const HEAT_BLUR = 0.85;

type CoverageHeatmapLayerProps = {
  bins: CoverageBin[];
  binSizeDeg: number | null;
  metric: CoverageMetric;
  scope?: 'device' | 'session';
};

type HeatPoint = {
  lat: number;
  lng: number;
  value: number;
};

type HeatDataPayload = {
  max: number;
  data: HeatPoint[];
};

function patchHeatmapColorize(overlay: any): void {
  const renderer = overlay?._heatmap?._renderer;
  if (!renderer || renderer.__loramaprColorizePatched || typeof renderer._colorize !== 'function') {
    return;
  }

  // Avoid Chromium readback warning by recreating the shadow context with willReadFrequently.
  const previousShadowCanvas = renderer.shadowCanvas as HTMLCanvasElement | undefined;
  if (previousShadowCanvas) {
    const nextShadowCanvas = document.createElement('canvas');
    nextShadowCanvas.width = previousShadowCanvas.width;
    nextShadowCanvas.height = previousShadowCanvas.height;
    const readbackCtx = nextShadowCanvas.getContext('2d', { willReadFrequently: true });
    if (readbackCtx) {
      readbackCtx.drawImage(previousShadowCanvas, 0, 0);
      renderer.shadowCanvas = nextShadowCanvas;
      renderer.shadowCtx = readbackCtx;
    }
  }

  renderer._colorize = function colorizePatched(this: any) {
    let x = this._renderBoundaries[0];
    let y = this._renderBoundaries[1];
    let width = this._renderBoundaries[2] - x;
    let height = this._renderBoundaries[3] - y;
    const maxWidth = this._width;
    const maxHeight = this._height;
    const opacity = this._opacity;
    const maxOpacity = this._maxOpacity;
    const minOpacity = this._minOpacity;
    const useGradientOpacity = this._useGradientOpacity;

    if (x < 0) {
      x = 0;
    }
    if (y < 0) {
      y = 0;
    }
    if (x + width > maxWidth) {
      width = maxWidth - x;
    }
    if (y + height > maxHeight) {
      height = maxHeight - y;
    }

    if (width <= 0 || height <= 0) {
      this._renderBoundaries = [1000, 1000, 0, 0];
      return;
    }

    const image = this.shadowCtx.getImageData(x, y, width, height);
    const imageData = image.data;
    const palette = this._palette;

    for (let index = 3; index < imageData.length; index += 4) {
      const alpha = imageData[index];
      const paletteOffset = alpha * 4;
      if (!paletteOffset) {
        continue;
      }

      let finalAlpha = alpha;
      if (opacity > 0) {
        finalAlpha = opacity;
      } else if (alpha < maxOpacity) {
        finalAlpha = alpha < minOpacity ? minOpacity : alpha;
      } else {
        finalAlpha = maxOpacity;
      }

      imageData[index - 3] = palette[paletteOffset];
      imageData[index - 2] = palette[paletteOffset + 1];
      imageData[index - 1] = palette[paletteOffset + 2];
      imageData[index] = useGradientOpacity ? palette[paletteOffset + 3] : finalAlpha;
    }

    this.ctx.putImageData(image, x, y);
    this._renderBoundaries = [1000, 1000, 0, 0];
  };

  renderer.__loramaprColorizePatched = true;
}

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

export default function CoverageHeatmapLayer({
  bins,
  binSizeDeg,
  metric,
  scope = 'device'
}: CoverageHeatmapLayerProps) {
  const map = useMap();
  const overlayRef = useRef<any>(null);
  const pendingDataRef = useRef<HeatDataPayload | null>(null);
  const rafRef = useRef<number | null>(null);
  const zoomingRef = useRef(false);

  const heatPoints = useMemo<HeatPoint[]>(() => {
    if (!binSizeDeg || !Number.isFinite(binSizeDeg) || binSizeDeg <= 0 || bins.length === 0) {
      return [];
    }

    const points: HeatPoint[] = [];
    for (const bin of bins) {
      if (!Number.isFinite(bin.latBin) || !Number.isFinite(bin.lonBin)) {
        continue;
      }

      const centerLat = (bin.latBin + 0.5) * binSizeDeg;
      const centerLng = (bin.lonBin + 0.5) * binSizeDeg;
      if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
        continue;
      }

      const value01 = clamp(metricToWeight(metric, bin), 0, 1);
      if (value01 <= 0) {
        continue;
      }

      points.push({
        lat: centerLat,
        lng: centerLng,
        value: value01
      });
    }

    const MAX_POINTS = 6000;
    if (points.length <= MAX_POINTS) {
      return points;
    }

    const stride = Math.ceil(points.length / MAX_POINTS);
    return points.filter((_, index) => index % stride === 0);
  }, [bins, binSizeDeg, metric]);

  const enqueueData = useCallback((payload: HeatDataPayload) => {
    pendingDataRef.current = payload;
    if (zoomingRef.current) {
      return;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const nextPayload = pendingDataRef.current;
      const overlay = overlayRef.current;
      if (!nextPayload || !overlay) {
        return;
      }
      overlay.setData(nextPayload);
      pendingDataRef.current = null;
    });
  }, []);

  const flushPending = useCallback(() => {
    const nextPayload = pendingDataRef.current;
    if (!nextPayload) {
      return;
    }
    enqueueData(nextPayload);
  }, [enqueueData]);

  useEffect(() => {
    const pane = map.getPane('covHeat') ?? map.createPane('covHeat');
    pane.style.zIndex = '450';
    pane.style.pointerEvents = 'none';

    const overlay = new HeatmapOverlay({
      pane: 'covHeat',
      latField: 'lat',
      lngField: 'lng',
      valueField: 'value',
      scaleRadius: true,
      useLocalExtrema: false,
      radius: 10,
      maxOpacity: HEAT_MAX_OPACITY,
      minOpacity: HEAT_MIN_OPACITY,
      blur: HEAT_BLUR
    });

    overlay.addTo(map);
    patchHeatmapColorize(overlay);
    overlayRef.current = overlay;

    const overlayElement = overlayRef.current?._el as HTMLDivElement | undefined;
    if (overlayElement) {
      overlayElement.style.opacity = String(HEAT_LAYER_OPACITY);
      overlayElement.style.pointerEvents = 'none';
    }

    const heatmapRendererCanvas = overlayRef.current?._heatmap?._renderer?.canvas as
      | HTMLCanvasElement
      | undefined;
    if (heatmapRendererCanvas) {
      heatmapRendererCanvas.style.opacity = '1';
    }

    overlayRef.current?._heatmap?.configure?.({
      maxOpacity: HEAT_MAX_OPACITY,
      minOpacity: HEAT_MIN_OPACITY,
      blur: HEAT_BLUR
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingDataRef.current = null;
      if (overlayRef.current) {
        map.removeLayer(overlayRef.current);
        overlayRef.current = null;
      }
    };
  }, [map]);

  useEffect(() => {
    const handleZoomStart = () => {
      zoomingRef.current = true;
    };
    const handleZoomEnd = () => {
      zoomingRef.current = false;
      flushPending();
    };

    map.on('zoomstart', handleZoomStart);
    map.on('zoomend', handleZoomEnd);

    return () => {
      map.off('zoomstart', handleZoomStart);
      map.off('zoomend', handleZoomEnd);
    };
  }, [map, flushPending]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || typeof binSizeDeg !== 'number' || !Number.isFinite(binSizeDeg) || binSizeDeg <= 0) {
      return;
    }

    const overlapBins = 2.2;
    const step0 = (256 * binSizeDeg) / 360;
    const radius = overlapBins * step0;
    overlay.cfg = {
      ...overlay.cfg,
      radius
    };

    if (import.meta.env.DEV) {
      console.debug('[heat] radius', { radius });
    }
  }, [binSizeDeg]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      return;
    }

    if (heatPoints.length === 0) {
      const emptyPayload: HeatDataPayload = { max: 1, data: [] };
      enqueueData(emptyPayload);
      if (import.meta.env.DEV) {
        console.debug('[heat] setData', { points: 0, max: 1, scope });
      }
      return;
    }

    let datasetMax = 0;
    for (const point of heatPoints) {
      if (point.value > datasetMax) {
        datasetMax = point.value;
      }
    }

    if (!Number.isFinite(datasetMax) || datasetMax <= 0) {
      const emptyPayload: HeatDataPayload = { max: 1, data: [] };
      enqueueData(emptyPayload);
      if (import.meta.env.DEV) {
        console.debug('[heat] setData', { points: 0, max: 1, scope });
      }
      return;
    }

    const dataMax = scope === 'session' ? datasetMax : 1;
    const payload: HeatDataPayload = {
      max: dataMax,
      data: heatPoints
    };

    enqueueData(payload);

    if (import.meta.env.DEV) {
      console.debug('[heat] setData', { points: heatPoints.length, max: dataMax, scope });
    }
  }, [heatPoints, enqueueData, scope]);

  return null;
}
