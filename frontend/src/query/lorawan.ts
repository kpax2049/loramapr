import { useQuery } from '@tanstack/react-query';
import { getLorawanEventById, listLorawanEvents } from '../api/endpoints';
import type { LorawanEvent, LorawanEventDetail } from '../api/types';

export function useLorawanEvents(deviceUid?: string, limit = 50, enabled = true) {
  return useQuery<LorawanEvent[]>({
    queryKey: ['lorawanEvents', deviceUid ?? 'all', limit],
    enabled,
    queryFn: ({ signal }) => listLorawanEvents({ deviceUid, limit }, { signal })
  });
}

export function useLorawanEvent(id?: string | null) {
  return useQuery<LorawanEventDetail>({
    queryKey: ['lorawanEvent', id ?? 'none'],
    enabled: Boolean(id),
    queryFn: ({ signal }) => getLorawanEventById(id as string, { signal })
  });
}
