import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  getUnifiedEventById,
  listUnifiedEvents,
  type UnifiedEventsQueryParams
} from '../api/endpoints';
import type { UnifiedEventDetail, UnifiedEventsResponse } from '../api/types';

type UseUnifiedEventsOptions = {
  enabled?: boolean;
  limit?: number;
  refetchInterval?: number | false;
};

type UnifiedEventsFilters = Omit<UnifiedEventsQueryParams, 'cursor' | 'limit'>;

function normalizeFilters(filters: UnifiedEventsFilters): Record<string, string | null> {
  return {
    source: filters.source ?? null,
    deviceUid: filters.deviceUid ?? null,
    portnum: filters.portnum ?? null,
    since:
      typeof filters.since === 'string'
        ? filters.since
        : filters.since instanceof Date
          ? filters.since.toISOString()
          : null,
    until:
      typeof filters.until === 'string'
        ? filters.until
        : filters.until instanceof Date
          ? filters.until.toISOString()
          : null,
    q: filters.q ?? null
  };
}

export function useUnifiedEvents(
  filters: UnifiedEventsFilters,
  options?: UseUnifiedEventsOptions
) {
  const limit = options?.limit ?? 100;
  const enabled = options?.enabled ?? true;

  return useInfiniteQuery<UnifiedEventsResponse>({
    queryKey: ['events', normalizeFilters(filters), limit],
    enabled,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: options?.refetchInterval ?? false,
    queryFn: ({ pageParam, signal }) =>
      listUnifiedEvents(
        {
          ...filters,
          limit,
          cursor: typeof pageParam === 'string' ? pageParam : undefined
        },
        { signal }
      )
  });
}

export function useUnifiedEvent(id?: string | null, enabled = true) {
  return useQuery<UnifiedEventDetail>({
    queryKey: ['events-detail', id ?? 'none'],
    enabled: Boolean(id) && enabled,
    queryFn: ({ signal }) => getUnifiedEventById(id as string, { signal })
  });
}
