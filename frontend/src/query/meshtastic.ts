import { useQuery } from '@tanstack/react-query';
import { getMeshtasticEventById, listMeshtasticEvents } from '../api/endpoints';
import type { ListResponse, MeshtasticEvent, MeshtasticEventDetail } from '../api/types';

export function useMeshtasticEvents(deviceUid?: string, limit = 50, enabled = true) {
  return useQuery<ListResponse<MeshtasticEvent>>({
    queryKey: ['meshtasticEvents', deviceUid ?? 'all', limit],
    enabled,
    queryFn: ({ signal }) => listMeshtasticEvents({ deviceUid, limit }, { signal })
  });
}

export function useMeshtasticEvent(id?: string | null) {
  return useQuery<MeshtasticEventDetail>({
    queryKey: ['meshtasticEvent', id ?? 'none'],
    enabled: Boolean(id),
    queryFn: ({ signal }) => getMeshtasticEventById(id as string, { signal })
  });
}
