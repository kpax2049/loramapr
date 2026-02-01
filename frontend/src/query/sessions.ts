import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';
import { listSessions, startSession, stopSession, updateSession } from '../api/endpoints';
import type { Session } from '../api/types';

type QueryOptions<T> = Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>;

export function useSessions(deviceId?: string, options?: QueryOptions<Session[]>) {
  const enabled = options?.enabled ?? Boolean(deviceId);

  return useQuery<Session[]>({
    queryKey: ['sessions', deviceId ?? null],
    queryFn: ({ signal }) => listSessions(deviceId as string, { signal }),
    ...options,
    enabled: enabled && Boolean(deviceId)
  });
}

type MutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationFn'
>;

export function useStartSession(options?: MutationOptions<Session, { deviceId: string; name?: string }>) {
  const queryClient = useQueryClient();

  return useMutation<Session, Error, { deviceId: string; name?: string }>({
    mutationFn: startSession,
    onSuccess: (...args) => {
      const session = args[0];
      if (session.deviceId) {
        queryClient.invalidateQueries({ queryKey: ['sessions', session.deviceId] });
      }
      options?.onSuccess?.(...args);
    },
    ...options
  });
}

export function useStopSession(options?: MutationOptions<Session, { sessionId: string }>) {
  const queryClient = useQueryClient();

  return useMutation<Session, Error, { sessionId: string }>({
    mutationFn: stopSession,
    onSuccess: (...args) => {
      const session = args[0];
      if (session?.deviceId) {
        queryClient.invalidateQueries({ queryKey: ['sessions', session.deviceId] });
      }
      options?.onSuccess?.(...args);
    },
    ...options
  });
}

export function useUpdateSession(
  options?: MutationOptions<Session, { id: string; input: { name?: string; notes?: string } }>
) {
  const queryClient = useQueryClient();

  return useMutation<Session, Error, { id: string; input: { name?: string; notes?: string } }>({
    mutationFn: ({ id, input }) => updateSession(id, input),
    onSuccess: (...args) => {
      const session = args[0];
      if (session?.deviceId) {
        queryClient.invalidateQueries({ queryKey: ['sessions', session.deviceId] });
      }
      options?.onSuccess?.(...args);
    },
    ...options
  });
}
