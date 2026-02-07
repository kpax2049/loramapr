import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLorawanEventById,
  getLorawanSummary,
  listLorawanEvents,
  reprocessLorawanBatch,
  reprocessLorawanEvent
} from '../api/endpoints';
import type { ListResponse, LorawanEvent, LorawanEventDetail, LorawanSummary } from '../api/types';

export function useLorawanEvents(deviceUid?: string, limit = 50, enabled = true) {
  return useQuery<ListResponse<LorawanEvent>>({
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

export function useLorawanSummary() {
  return useQuery<LorawanSummary>({
    queryKey: ['lorawanSummary'],
    queryFn: ({ signal }) => getLorawanSummary({ signal })
  });
}

export function useReprocessLorawanEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reprocessLorawanEvent(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['lorawanEvents'] });
      queryClient.invalidateQueries({ queryKey: ['lorawanEvent', id] });
      queryClient.invalidateQueries({ queryKey: ['lorawanSummary'] });
    }
  });
}

export function useReprocessLorawanBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (filters: { deviceUid?: string; since?: string | Date; processingError?: string }) =>
      reprocessLorawanBatch(filters),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lorawanEvents'] });
      queryClient.invalidateQueries({ queryKey: ['lorawanSummary'] });
    }
  });
}
