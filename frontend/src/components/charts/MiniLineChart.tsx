import { type ReactNode, useId, useMemo, useState } from 'react';

type NormalizedPoint<T> = {
  datum: T;
  sourceIndex: number;
  value: number;
  normalized: number;
  x: number;
  y: number;
};

type MiniLineChartProps<T> = {
  data: readonly T[];
  getValue: (item: T, index: number) => number | null | undefined;
  ariaLabel: string;
  className?: string;
  tooltipFormatter?: (item: T, index: number) => ReactNode;
};

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 56;
const PADDING_X = 1.2;
const PADDING_TOP = 1.2;
const PADDING_BOTTOM = 2.4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return '';
  }
  return points
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`
    )
    .join(' ');
}

function stableNoise(seed: number): number {
  const raw = Math.sin(seed * 12.9898) * 43758.5453;
  return raw - Math.floor(raw);
}

export default function MiniLineChart<T>({
  data,
  getValue,
  ariaLabel,
  className,
  tooltipFormatter
}: MiniLineChartProps<T>) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const chartId = useId().replace(/:/g, '');
  const areaGradientId = `${chartId}-area`;
  const noiseGradientId = `${chartId}-noise`;

  const points = useMemo<NormalizedPoint<T>[]>(() => {
    const values = data
      .map((datum, index) => {
        const raw = getValue(datum, index);
        const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
        if (value === null) {
          return null;
        }
        return { datum, sourceIndex: index, value };
      })
      .filter(
        (item): item is { datum: T; sourceIndex: number; value: number } => item !== null
      );

    if (values.length === 0) {
      return [];
    }

    let min = values[0].value;
    let max = values[0].value;
    for (const point of values) {
      if (point.value < min) {
        min = point.value;
      }
      if (point.value > max) {
        max = point.value;
      }
    }
    const valueRange = max === min ? 1 : max - min;
    const innerWidth = VIEWBOX_WIDTH - PADDING_X * 2;
    const innerHeight = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const denominator = Math.max(1, values.length - 1);

    return values.map((point, index) => {
      const normalized = (point.value - min) / valueRange;
      const x = PADDING_X + (index / denominator) * innerWidth;
      const y = PADDING_TOP + (1 - normalized) * innerHeight;
      return {
        ...point,
        normalized,
        x,
        y
      };
    });
  }, [data, getValue]);

  const linePathData = useMemo(() => {
    return toPath(points);
  }, [points]);

  const areaPathData = useMemo(() => {
    if (points.length === 0) {
      return '';
    }
    const bottom = VIEWBOX_HEIGHT - PADDING_BOTTOM;
    const first = points[0];
    const last = points[points.length - 1];
    return `M ${first.x.toFixed(3)} ${bottom.toFixed(3)} ${toPath(points).slice(1)} L ${last.x.toFixed(
      3
    )} ${bottom.toFixed(3)} Z`;
  }, [points]);

  const noisePathData = useMemo(() => {
    if (points.length === 0) {
      return '';
    }

    const plotLeft = PADDING_X;
    const plotRight = VIEWBOX_WIDTH - PADDING_X;
    const plotTop = PADDING_TOP;
    const plotBottom = VIEWBOX_HEIGHT - PADDING_BOTTOM;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;
    const noiseTop = plotBottom - plotHeight * 0.29;
    const noiseBottom = plotBottom;

    const sampleCount = Math.max(28, points.length * 4);
    const rawPoints: Array<{ x: number; y: number }> = [];

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const ratio = sampleCount > 1 ? sampleIndex / (sampleCount - 1) : 0;
      const scaled = ratio * (points.length - 1);
      const leftIndex = Math.floor(scaled);
      const rightIndex = Math.min(points.length - 1, leftIndex + 1);
      const localRatio = scaled - leftIndex;

      const left = points[leftIndex];
      const right = points[rightIndex];
      const trend = left.normalized + (right.normalized - left.normalized) * localRatio;
      const x = plotLeft + ratio * plotWidth;

      const bandHeight = noiseBottom - noiseTop;
      const baseY = noiseBottom - (0.2 + trend * 0.62) * bandHeight;
      const jitter = (stableNoise(sampleIndex + 1) - 0.5) * bandHeight * 0.42;
      const y = clamp(baseY + jitter, noiseTop, noiseBottom - 0.25);

      rawPoints.push({ x, y });
    }

    if (rawPoints.length === 0) {
      return '';
    }

    return `M ${plotLeft.toFixed(3)} ${noiseBottom.toFixed(3)} ${toPath(rawPoints).slice(
      1
    )} L ${plotRight.toFixed(3)} ${noiseBottom.toFixed(3)} Z`;
  }, [points]);

  const interactive = Boolean(tooltipFormatter && points.length > 0);
  const hoveredPoint =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < points.length
      ? points[hoveredIndex]
      : null;

  return (
    <div
      className={`mini-line-chart${interactive ? ' mini-line-chart--interactive' : ''}${
        className ? ` ${className}` : ''
      }`}
      role="img"
      aria-label={ariaLabel}
      onMouseMove={
        interactive
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width === 0 || points.length === 0) {
                setHoveredIndex(null);
                return;
              }

              const paddingPx = (PADDING_X / VIEWBOX_WIDTH) * rect.width;
              const contentWidth = rect.width - paddingPx * 2;
              if (contentWidth <= 0) {
                setHoveredIndex(null);
                return;
              }

              const x = Math.min(
                Math.max(event.clientX - rect.left - paddingPx, 0),
                contentWidth
              );
              const ratio = contentWidth > 0 ? x / contentWidth : 0;
              const index =
                points.length > 1 ? Math.round(ratio * (points.length - 1)) : 0;
              const clamped = Math.min(Math.max(index, 0), points.length - 1);
              setHoveredIndex((previous) => (previous === clamped ? previous : clamped));
            }
          : undefined
      }
      onMouseLeave={interactive ? () => setHoveredIndex(null) : undefined}
    >
      <svg
        className="mini-line-chart__svg"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={areaGradientId}
            x1="0"
            y1={PADDING_TOP}
            x2="0"
            y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="var(--chart-area-top)" />
            <stop offset="58%" stopColor="var(--chart-area-mid)" />
            <stop offset="100%" stopColor="var(--chart-area-bottom)" />
          </linearGradient>
          <linearGradient
            id={noiseGradientId}
            x1="0"
            y1={VIEWBOX_HEIGHT - PADDING_BOTTOM - 8}
            x2="0"
            y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="var(--chart-noise-fill)" />
            <stop offset="100%" stopColor="var(--chart-noise-fill-fade)" />
          </linearGradient>
        </defs>
        {Array.from({ length: 4 }).map((_, index) => {
          const y =
            PADDING_TOP +
            ((VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM) / 3) * index;
          return (
            <line
              key={`h-${index}`}
              className="mini-line-chart__grid-line"
              x1={PADDING_X}
              y1={y}
              x2={VIEWBOX_WIDTH - PADDING_X}
              y2={y}
            />
          );
        })}
        {Array.from({ length: 5 }).map((_, index) => {
          const x =
            PADDING_X + ((VIEWBOX_WIDTH - PADDING_X * 2) / 4) * index;
          return (
            <line
              key={`v-${index}`}
              className="mini-line-chart__grid-line mini-line-chart__grid-line--vertical"
              x1={x}
              y1={PADDING_TOP}
              x2={x}
              y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
            />
          );
        })}
        {areaPathData ? (
          <path className="mini-line-chart__area" d={areaPathData} fill={`url(#${areaGradientId})`} />
        ) : null}
        {noisePathData ? (
          <path className="mini-line-chart__noise" d={noisePathData} fill={`url(#${noiseGradientId})`} />
        ) : null}
        <line
          className="mini-line-chart__baseline"
          x1={PADDING_X}
          y1={VIEWBOX_HEIGHT - PADDING_BOTTOM}
          x2={VIEWBOX_WIDTH - PADDING_X}
          y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
        />
        {linePathData ? <path className="mini-line-chart__line" d={linePathData} /> : null}
      </svg>
      {interactive && hoveredPoint && tooltipFormatter ? (
        <div
          className="mini-line-chart__tooltip"
          style={{
            left: `${(hoveredPoint.x / VIEWBOX_WIDTH) * 100}%`,
            top: `${(hoveredPoint.y / VIEWBOX_HEIGHT) * 100}%`
          }}
        >
          {tooltipFormatter(hoveredPoint.datum, hoveredPoint.sourceIndex)}
        </div>
      ) : null}
    </div>
  );
}
