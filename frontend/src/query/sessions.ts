import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';
import {
  deleteSession,
  getSessionById,
  getSessionTimeline,
  getSessionWindow,
  listSessions,
  startSession,
  stopSession,
  updateSession
} from '../api/endpoints';
import type {
  ListResponse,
  Session,
  SessionDetail,
  SessionTimeline,
  SessionWindowResponse
} from '../api/types';
import type { SessionWindowParams } from '../api/endpoints';
import type { QueryKey } from '@tanstack/react-query';

type QueryOptions<T> = Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>;

type SessionsQueryOptions = QueryOptions<ListResponse<Session>> & {
  includeArchived?: boolean;
};

export function useSessions(deviceId?: string, options?: SessionsQueryOptions) {
  const includeArchived = options?.includeArchived ?? false;
  const { includeArchived: _includeArchived, ...queryOptions } = options ?? {};
  const enabled = queryOptions.enabled ?? Boolean(deviceId);

  return useQuery<ListResponse<Session>>({
    queryKey: ['sessions', deviceId ?? null, includeArchived],
    queryFn: ({ signal }) => listSessions(deviceId as string, { includeArchived }, { signal }),
    ...queryOptions,
    enabled: enabled && Boolean(deviceId)
  });
}

export function useSessionTimeline(
  sessionId?: string | null,
  options?: QueryOptions<SessionTimeline>
) {
  const enabled = options?.enabled ?? Boolean(sessionId);

  return useQuery<SessionTimeline>({
    queryKey: ['sessionTimeline', sessionId ?? null],
    queryFn: ({ signal }) => getSessionTimeline(sessionId as string, { signal }),
    ...options,
    enabled: enabled && Boolean(sessionId)
  });
}

export function useSessionById(
  sessionId?: string | null,
  options?: QueryOptions<SessionDetail>
) {
  const enabled = options?.enabled ?? Boolean(sessionId);

  return useQuery<SessionDetail>({
    queryKey: ['session', sessionId ?? null],
    queryFn: ({ signal }) => getSessionById(sessionId as string, { signal }),
    ...options,
    enabled: enabled && Boolean(sessionId)
  });
}

type SessionWindowKeyParams = {
  sessionId: string | null;
  cursor: string | null;
  windowMs: number | null;
  limit: number | null;
  sample: number | null;
};

function normalizeSessionWindowParams(params: SessionWindowParams): SessionWindowKeyParams {
  return {
    sessionId: params.sessionId ?? null,
    cursor: params.cursor ? (params.cursor instanceof Date ? params.cursor.toISOString() : params.cursor) : null,
    windowMs: Number.isFinite(params.windowMs) ? params.windowMs : null,
    limit: typeof params.limit === 'number' ? params.limit : null,
    sample: typeof params.sample === 'number' ? params.sample : null
  };
}

export function useSessionWindow(
  params: SessionWindowParams,
  options?: QueryOptions<SessionWindowResponse>
) {
  const enabled = options?.enabled ?? Boolean(params?.sessionId);
  const keyParams = normalizeSessionWindowParams(params);

  return useQuery<SessionWindowResponse>({
    queryKey: ['sessionWindow', keyParams],
    queryFn: ({ signal }) => getSessionWindow(params, { signal }),
    ...options,
    enabled: enabled && Boolean(params?.sessionId)
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
  options?: MutationOptions<
    Session,
    { id: string; deviceId: string; input: { name?: string; notes?: string; isArchived?: boolean } }
  >
) {
  const queryClient = useQueryClient();
  const { onError, onSettled, onSuccess, ...mutationOptions } = options ?? {};

  return useMutation<
    Session,
    Error,
    { id: string; deviceId: string; input: { name?: string; notes?: string; isArchived?: boolean } },
    { previousEntries: Array<[QueryKey, ListResponse<Session> | undefined]> }
  >({
    ...mutationOptions,
    mutationFn: ({ id, input }) => updateSession(id, input),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['sessions', variables.deviceId] });
      const previousEntries = queryClient.getQueriesData<ListResponse<Session>>({
        queryKey: ['sessions', variables.deviceId]
      });

      queryClient.setQueriesData<ListResponse<Session>>(
        { queryKey: ['sessions', variables.deviceId] },
        (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            items: current.items.map((session) =>
              session.id === variables.id
                ? {
                    ...session,
                    ...(variables.input.name !== undefined ? { name: variables.input.name } : {}),
                    ...(variables.input.notes !== undefined ? { notes: variables.input.notes } : {}),
                    ...(variables.input.isArchived !== undefined
                      ? { isArchived: variables.input.isArchived }
                      : {})
                  }
                : session
            )
          };
        }
      );

      return { previousEntries };
    },
    onError: (_error, variables, context) => {
      context?.previousEntries.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      onError?.(_error, variables, context);
    },
    onSuccess: (...args) => {
      const session = args[0];
      if (session?.deviceId) {
        queryClient.invalidateQueries({ queryKey: ['sessions', session.deviceId] });
      }
      onSuccess?.(...args);
    },
    onSettled: (...args) => {
      const [, , variables] = args;
      if (variables?.deviceId) {
        queryClient.invalidateQueries({ queryKey: ['sessions', variables.deviceId] });
      }
      onSettled?.(...args);
    }
  });
}

export function useDeleteSession(
  options?: MutationOptions<
    { mode: 'delete'; deleted: true; detachedMeasurementsCount: number },
    { id: string; deviceId: string }
  >
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...mutationOptions } = options ?? {};

  return useMutation<
    { mode: 'delete'; deleted: true; detachedMeasurementsCount: number },
    Error,
    { id: string; deviceId: string }
  >({
    ...mutationOptions,
    mutationFn: ({ id }) => deleteSession(id),
    onSuccess: (...args) => {
      const [, variables] = args;
      if (variables?.deviceId) {
        queryClient.invalidateQueries({ queryKey: ['sessions', variables.deviceId] });
      }
      onSuccess?.(...args);
    }
  });
}
