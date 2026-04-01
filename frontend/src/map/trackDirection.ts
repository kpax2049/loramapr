export type TrackCoordinate = {
  lat: number;
  lon: number;
};

export type ProjectedPoint = {
  x: number;
  y: number;
};

export type ProjectedTrackSegment = {
  start: ProjectedPoint;
  end: ProjectedPoint;
  lengthPx: number;
  cumulativeStartPx: number;
  cumulativeEndPx: number;
  bearingDeg: number;
};

export type ArrowPlacement = {
  point: ProjectedPoint;
  bearingDeg: number;
};

export type ArrowHeadGeometry = {
  minSizePx: number;
  depthFactor: number;
  wingFactor: number;
  normalOffsetPx?: number;
};

export type ArrowSamplingOptions = {
  startOffsetPx?: number;
  maxArrowCount?: number;
  minTotalLengthPx?: number;
  endpointBufferPx?: number;
  turnSuppressionAngleDeg?: number;
  turnSuppressionBufferPx?: number;
  minDistanceBetweenArrowsPx?: number;
  minSegmentLengthPx?: number;
};

export const TRACK_DIRECTION_ARROW_CONFIG = {
  minZoom: 12,
  spacingPx: 168,
  arrowSizePx: 4.5,
  maxArrowCountPerTrack: 48,
  minTrackLengthPx: 120,
  endpointBufferPx: 20,
  markerSuppressionBufferPx: 7,
  maxSuppressionMarkers: 120,
  turnSuppressionAngleDeg: 42,
  turnSuppressionBufferPx: 22,
  minArrowSeparationPx: 128,
  minSegmentLengthPx: 18
} as const;

const EPSILON = 0.0001;

export const TRACK_DIRECTION_ARROW_PREVIOUS_GEOMETRY: ArrowHeadGeometry = {
  minSizePx: 2,
  depthFactor: 0.92,
  wingFactor: 0.38
};

export const TRACK_DIRECTION_ARROW_GEOMETRY: ArrowHeadGeometry = {
  minSizePx: 2.4,
  // +25% depth vs previous (0.92 -> 1.15)
  depthFactor: 1.15,
  // +18.4% wing spread vs previous (0.38 -> 0.45)
  wingFactor: 0.45
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function isValidTrackCoordinate(point: TrackCoordinate): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}

export function filterValidTrackCoordinates<T extends TrackCoordinate>(points: readonly T[]): T[] {
  const valid: T[] = [];
  for (const point of points) {
    if (isValidTrackCoordinate(point)) {
      valid.push(point);
    }
  }
  return valid;
}

export function computeSegmentBearingDegrees(
  start: ProjectedPoint,
  end: ProjectedPoint
): number | null {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    return null;
  }

  const length = Math.hypot(deltaX, deltaY);
  if (!Number.isFinite(length) || length <= EPSILON) {
    return null;
  }

  const degrees = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
  return degrees >= 0 ? degrees : degrees + 360;
}

function bearingDeltaDegrees(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

export function buildProjectedTrackSegments(
  points: readonly ProjectedPoint[]
): { segments: ProjectedTrackSegment[]; totalLengthPx: number } {
  if (points.length < 2) {
    return { segments: [], totalLengthPx: 0 };
  }

  const segments: ProjectedTrackSegment[] = [];
  let cumulative = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const bearingDeg = computeSegmentBearingDegrees(start, end);
    if (bearingDeg === null) {
      continue;
    }

    const lengthPx = Math.hypot(end.x - start.x, end.y - start.y);
    if (!Number.isFinite(lengthPx) || lengthPx <= EPSILON) {
      continue;
    }

    const cumulativeStartPx = cumulative;
    cumulative += lengthPx;
    segments.push({
      start,
      end,
      lengthPx,
      cumulativeStartPx,
      cumulativeEndPx: cumulative,
      bearingDeg
    });
  }

  return {
    segments,
    totalLengthPx: cumulative
  };
}

export function sampleArrowPlacementsAtDistance(
  segments: readonly ProjectedTrackSegment[],
  intervalPx: number,
  options?: ArrowSamplingOptions
): ArrowPlacement[] {
  if (!Number.isFinite(intervalPx) || intervalPx <= EPSILON || segments.length === 0) {
    return [];
  }

  const totalLengthPx = segments[segments.length - 1]?.cumulativeEndPx ?? 0;
  const minTotalLengthPx = Math.max(0, options?.minTotalLengthPx ?? 0);
  if (!Number.isFinite(totalLengthPx) || totalLengthPx <= minTotalLengthPx) {
    return [];
  }

  const maxArrowCount = options?.maxArrowCount ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(maxArrowCount) || maxArrowCount <= 0) {
    return [];
  }

  const startOffsetPx = Math.max(0, options?.startOffsetPx ?? intervalPx * 0.7);
  if (startOffsetPx >= totalLengthPx) {
    return [];
  }

  const endpointBufferPx = Math.max(0, options?.endpointBufferPx ?? 0);
  if (totalLengthPx <= endpointBufferPx * 2) {
    return [];
  }

  const turnSuppressionAngleDeg = Math.max(0, options?.turnSuppressionAngleDeg ?? 0);
  const turnSuppressionBufferPx = Math.max(0, options?.turnSuppressionBufferPx ?? 0);
  const sharpTurnDistances: number[] = [];
  if (turnSuppressionAngleDeg > 0 && turnSuppressionBufferPx > 0 && segments.length > 1) {
    for (let index = 1; index < segments.length; index += 1) {
      const previous = segments[index - 1];
      const next = segments[index];
      const deltaDeg = bearingDeltaDegrees(previous.bearingDeg, next.bearingDeg);
      if (deltaDeg >= turnSuppressionAngleDeg) {
        sharpTurnDistances.push(next.cumulativeStartPx);
      }
    }
  }

  const minDistanceBetweenArrowsPx = Math.max(0, options?.minDistanceBetweenArrowsPx ?? 0);
  const minSegmentLengthPx = Math.max(0, options?.minSegmentLengthPx ?? 0);
  const placements: ArrowPlacement[] = [];
  let lastAcceptedDistancePx = Number.NEGATIVE_INFINITY;
  let segmentIndex = 0;
  let targetDistancePx = startOffsetPx;

  while (targetDistancePx < totalLengthPx && placements.length < maxArrowCount) {
    while (
      segmentIndex < segments.length &&
      targetDistancePx > segments[segmentIndex].cumulativeEndPx
    ) {
      segmentIndex += 1;
    }

    if (segmentIndex >= segments.length) {
      break;
    }

    const segment = segments[segmentIndex];
    if (segment.lengthPx < minSegmentLengthPx) {
      targetDistancePx += intervalPx;
      continue;
    }

    if (
      targetDistancePx < endpointBufferPx ||
      targetDistancePx > totalLengthPx - endpointBufferPx
    ) {
      targetDistancePx += intervalPx;
      continue;
    }

    if (targetDistancePx - lastAcceptedDistancePx < minDistanceBetweenArrowsPx) {
      targetDistancePx += intervalPx;
      continue;
    }

    if (sharpTurnDistances.length > 0 && turnSuppressionBufferPx > 0) {
      let nearSharpTurn = false;
      for (const turnDistance of sharpTurnDistances) {
        if (Math.abs(targetDistancePx - turnDistance) <= turnSuppressionBufferPx) {
          nearSharpTurn = true;
          break;
        }
      }
      if (nearSharpTurn) {
        targetDistancePx += intervalPx;
        continue;
      }
    }

    const distanceWithinSegment = targetDistancePx - segment.cumulativeStartPx;
    const ratio = clamp(distanceWithinSegment / segment.lengthPx, 0, 1);
    const point: ProjectedPoint = {
      x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
      y: segment.start.y + (segment.end.y - segment.start.y) * ratio
    };
    placements.push({
      point,
      bearingDeg: segment.bearingDeg
    });
    lastAcceptedDistancePx = targetDistancePx;

    targetDistancePx += intervalPx;
  }

  return placements;
}

export function buildArrowHeadPolyline(
  anchor: ProjectedPoint,
  bearingDeg: number,
  sizePx: number,
  geometry: ArrowHeadGeometry = TRACK_DIRECTION_ARROW_GEOMETRY
): [ProjectedPoint, ProjectedPoint, ProjectedPoint] {
  const safeSize = Math.max(geometry.minSizePx, sizePx);
  const radians = (bearingDeg * Math.PI) / 180;
  const directionX = Math.cos(radians);
  const directionY = Math.sin(radians);
  const normalX = -directionY;
  const normalY = directionX;
  const normalOffsetPx = geometry.normalOffsetPx ?? 0;
  const backDistance = safeSize * geometry.depthFactor;
  const wingWidth = safeSize * geometry.wingFactor;
  const anchorWithOffset: ProjectedPoint = {
    x: anchor.x + normalX * normalOffsetPx,
    y: anchor.y + normalY * normalOffsetPx
  };
  const base: ProjectedPoint = {
    x: anchorWithOffset.x - directionX * backDistance,
    y: anchorWithOffset.y - directionY * backDistance
  };

  return [
    {
      x: base.x + normalX * wingWidth,
      y: base.y + normalY * wingWidth
    },
    anchorWithOffset,
    {
      x: base.x - normalX * wingWidth,
      y: base.y - normalY * wingWidth
    }
  ];
}

export function resolveArrowSpacingPx(zoom: number): number {
  const baseSpacing = TRACK_DIRECTION_ARROW_CONFIG.spacingPx;

  if (zoom <= TRACK_DIRECTION_ARROW_CONFIG.minZoom + 1) {
    return baseSpacing * 1.25;
  }
  if (zoom <= TRACK_DIRECTION_ARROW_CONFIG.minZoom + 3) {
    return baseSpacing * 1.12;
  }
  if (zoom >= 17) {
    return baseSpacing * 0.9;
  }
  if (zoom >= 15) {
    return baseSpacing;
  }
  return baseSpacing;
}

export function resolveArrowSizePx(zoom: number): number {
  const baseSize = TRACK_DIRECTION_ARROW_CONFIG.arrowSizePx;
  if (zoom <= TRACK_DIRECTION_ARROW_CONFIG.minZoom + 1) {
    return clamp(baseSize * 0.85, 2.2, 5.4);
  }
  if (zoom >= 17) {
    return clamp(baseSize * 1.15, 2.2, 5.4);
  }
  if (zoom >= 15) {
    return clamp(baseSize * 1.05, 2.2, 5.4);
  }
  return baseSize;
}
