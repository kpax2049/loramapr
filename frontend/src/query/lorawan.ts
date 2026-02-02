import { useQuery } from '@tanstack/react-query';
import { listLorawanEvents } from '../api/endpoints';
import type { LorawanEvent } from '../api/types';

export function useLorawanEvents(deviceUid?: string, limit = 50) {
  return useQuery<LorawanEvent[]>({
    queryKey: ['lorawanEvents', deviceUid ?? 'all', limit],
    queryFn: ({ signal }) => listLorawanEvents({ deviceUid, limit }, { signal })
  });
}
