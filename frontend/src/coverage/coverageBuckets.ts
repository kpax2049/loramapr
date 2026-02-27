export type CoverageMetric = 'count' | 'rssiAvg' | 'snrAvg';
export type CoverageBucket = 'low' | 'med' | 'high' | 'none';
export type CoverageBucketIntensity = 0 | 0.33 | 0.66 | 1;

const COVERAGE_FALLBACK_COLORS: Record<CoverageMetric | 'none', Record<CoverageBucket, string> | string> = {
  none: '#94a3b8',
  count: {
    low: '#fb7185',
    med: '#f59e0b',
    high: '#22c55e',
    none: '#94a3b8'
  },
  rssiAvg: {
    low: '#ef4444',
    med: '#facc15',
    high: '#4ade80',
    none: '#94a3b8'
  },
  snrAvg: {
    low: '#60a5fa',
    med: '#22d3ee',
    high: '#a78bfa',
    none: '#94a3b8'
  }
};

const COVERAGE_BUCKET_INTENSITIES: Record<CoverageBucket, CoverageBucketIntensity> = {
  none: 0,
  low: 0.33,
  med: 0.66,
  high: 1
};

export function getCoverageBucket(
  metric: CoverageMetric,
  value: number | null | undefined
): CoverageBucket {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'none';
  }

  if (metric === 'count') {
    if (value <= 0) {
      return 'none';
    }
    if (value >= 21) {
      return 'high';
    }
    if (value >= 6) {
      return 'med';
    }
    return 'low';
  }

  if (metric === 'snrAvg') {
    if (value >= 6) {
      return 'high';
    }
    if (value >= -4) {
      return 'med';
    }
    return 'low';
  }

  if (value >= -89) {
    return 'high';
  }
  if (value >= -109) {
    return 'med';
  }
  return 'low';
}

export function bucketLabel(metric: CoverageMetric, bucket: CoverageBucket): string {
  if (bucket === 'none') {
    if (metric === 'rssiAvg') {
      return 'No RSSI';
    }
    if (metric === 'snrAvg') {
      return 'No SNR';
    }
    return 'No data';
  }

  if (metric === 'count') {
    if (bucket === 'high') {
      return '21+';
    }
    if (bucket === 'med') {
      return '6-20';
    }
    return '1-5';
  }

  if (metric === 'snrAvg') {
    if (bucket === 'high') {
      return '>= 6 dB';
    }
    if (bucket === 'med') {
      return '-4 to 5 dB';
    }
    return '<= -5 dB';
  }

  if (bucket === 'high') {
    return '>= -89 dBm';
  }
  if (bucket === 'med') {
    return '-109 to -90 dBm';
  }
  return '<= -110 dBm';
}

export function bucketClass(metric: CoverageMetric, bucket: CoverageBucket): string {
  const metricPrefix =
    metric === 'count' ? 'cov-count' : metric === 'rssiAvg' ? 'cov-rssi' : 'cov-snr';
  return `${metricPrefix}-${bucket}`;
}

export function bucketIntensity(bucket: CoverageBucket): CoverageBucketIntensity {
  return COVERAGE_BUCKET_INTENSITIES[bucket];
}

export function bucketColor(metric: CoverageMetric, bucket: CoverageBucket): string {
  if (bucket === 'none') {
    return 'var(--cov-none)';
  }
  if (metric === 'count') {
    return `var(--cov-count-${bucket})`;
  }
  if (metric === 'rssiAvg') {
    return `var(--cov-rssi-${bucket})`;
  }
  return `var(--cov-snr-${bucket})`;
}

export function resolveBucketColor(metric: CoverageMetric, bucket: CoverageBucket): string {
  const token = bucketColor(metric, bucket);
  if (typeof window === 'undefined') {
    return bucket === 'none'
      ? (COVERAGE_FALLBACK_COLORS.none as string)
      : (COVERAGE_FALLBACK_COLORS[metric] as Record<CoverageBucket, string>)[bucket];
  }

  const match = token.match(/^var\(\s*(--[^,\s)]+)\s*(?:,\s*([^)]+)\s*)?\)$/);
  if (!match) {
    return token;
  }

  const resolved = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
  if (resolved.length > 0) {
    return resolved;
  }

  const fallbackFromToken = match[2]?.trim();
  if (fallbackFromToken) {
    return fallbackFromToken;
  }

  return bucket === 'none'
    ? (COVERAGE_FALLBACK_COLORS.none as string)
    : (COVERAGE_FALLBACK_COLORS[metric] as Record<CoverageBucket, string>)[bucket];
}
