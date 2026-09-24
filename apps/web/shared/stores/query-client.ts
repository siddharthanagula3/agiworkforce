import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/user-error-message';
import { logger } from '@shared/lib/logger';

const ENABLE_REACT_QUERY_DEVTOOLS =
  process.env['NEXT_PUBLIC_ENABLE_REACT_QUERY_DEVTOOLS'] === 'true';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && 'code' in error && error.code === 'PGRST116') {
    return 'Resource not found';
  }
  return toUserMessage(error, 'Something went wrong. Try again.');
}

const queryCache = new QueryCache({
  onError: (error, query) => {
    logger.error(`[QueryError] ${query.queryKey.join('/')}:`, error);

    const errorMessage = (query.meta?.['errorMessage'] as string) || getErrorMessage(error);

    if (query.state.data !== undefined) {
      logger.warn(
        `[QueryError] Background refetch failed for ${query.queryKey.join('/')}, using cached data`,
      );
      return;
    }

    if (query.meta?.['silent']) return;

    toast.error(errorMessage);
  },
});

const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    logger.error(`[MutationError] ${mutation.options.mutationKey?.join('/') || 'unknown'}:`, error);

    const errorMessage = (mutation.meta?.['errorMessage'] as string) || getErrorMessage(error);

    if (!mutation.options.onError) {
      toast.error(errorMessage);
    }
  },
  onSuccess: (_data, _variables, _context, mutation) => {
    logger.debug(`[MutationSuccess] ${mutation.options.mutationKey?.join('/') || 'unknown'}`);
  },
});

export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes

      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)

      retry: (failureCount, error: unknown) => {
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as { status: number }).status;
          if (status >= 400 && status < 500) {
            return false;
          }
        }
        return failureCount < 3;
      },

      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      refetchOnWindowFocus: false,

      refetchOnReconnect: true,

      refetchInterval: false,

      throwOnError: false,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,

      throwOnError: false,
    },
  },
});

interface QueryProviderProps {
  children: React.ReactNode;
}

function QueryDevtools() {
  const [Devtools, setDevtools] = useState<React.ComponentType<Record<string, unknown>> | null>(
    null,
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !ENABLE_REACT_QUERY_DEVTOOLS) return;

    let mounted = true;
    void import('@tanstack/react-query-devtools').then((mod) => {
      if (mounted) setDevtools(() => mod.ReactQueryDevtools);
    });

    return () => {
      mounted = false;
    };
  }, []);

  return Devtools
    ? React.createElement(Devtools, {
        initialIsOpen: false,
        buttonPosition: 'bottom-right',
      })
    : null;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
  return React.createElement(
    QueryClientProvider,
    { client: queryClient },
    children,
    React.createElement(QueryDevtools),
  );
};

export const queryKeys = {
  auth: {
    user: () => ['auth', 'user'] as const,
    session: () => ['auth', 'session'] as const,
    permissions: () => ['auth', 'permissions'] as const,
  },

  chat: {
    all: () => ['chat'] as const,
    conversations: () => ['chat', 'conversations'] as const,
    conversation: (id: string) => ['chat', 'conversation', id] as const,
    sessions: (userId: string) => ['chat', 'sessions', userId] as const,
    sessionsInfinite: (userId: string) => ['chat', 'sessions', 'infinite', userId] as const,
    session: (sessionId: string) => ['chat', 'session', sessionId] as const,
    messages: (conversationId: string) => ['chat', 'messages', conversationId] as const,
    messagesInfinite: (sessionId: string) => ['chat', 'messages', 'infinite', sessionId] as const,
    messageCount: (sessionId: string) => ['chat', 'messageCount', sessionId] as const,
    models: () => ['chat', 'models'] as const,
    search: (userId: string, query: string) => ['chat', 'search', userId, query] as const,
  },

  reactions: {
    all: () => ['reactions'] as const,
    message: (messageId: string) => ['reactions', 'message', messageId] as const,
    messages: (messageIds: string[]) =>
      ['reactions', 'messages', messageIds.sort().join(',')] as const,
  },

  branches: {
    all: () => ['branches'] as const,
    session: (sessionId: string) => ['branches', 'session', sessionId] as const,
    history: (sessionId: string) => ['branches', 'history', sessionId] as const,
    root: (sessionId: string) => ['branches', 'root', sessionId] as const,
    isBranch: (sessionId: string) => ['branches', 'isBranch', sessionId] as const,
    atMessage: (messageId: string) => ['branches', 'atMessage', messageId] as const,
    info: (sessionId: string) => ['branches', 'info', sessionId] as const,
    tree: (sessionId: string) => ['branches', 'tree', sessionId] as const,
    count: (sessionId: string) => ['branches', 'count', sessionId] as const,
  },

  search: {
    all: () => ['search'] as const,
    history: (userId: string) => ['search', 'history', userId] as const,
    recent: (userId: string) => ['search', 'recent', userId] as const,
    popular: () => ['search', 'popular'] as const,
    suggestions: (userId: string, query: string) =>
      ['search', 'suggestions', userId, query] as const,
  },

  billing: {
    all: () => ['billing'] as const,
    subscription: () => ['billing', 'subscription'] as const,
    plan: (userId: string) => ['billing', 'plan', userId] as const,
    invoices: () => ['billing', 'invoices'] as const,
    paymentMethods: () => ['billing', 'payment-methods'] as const,
  },

  settings: {
    all: () => ['settings'] as const,
    profile: (userId?: string) => ['settings', 'profile', userId] as const,
    preferences: (userId?: string) => ['settings', 'preferences', userId] as const,
    apiKeys: (userId?: string) => ['settings', 'apiKeys', userId] as const,
    notifications: () => ['settings', 'notifications'] as const,
    accountDeletionStatus: () => ['settings', 'accountDeletionStatus'] as const,
  },

  system: {
    health: () => ['system', 'health'] as const,
    config: () => ['system', 'config'] as const,
    features: () => ['system', 'features'] as const,
  },

  connectors: {
    all: () => ['connectors'] as const,
    permissions: () => ['connectors', 'permissions'] as const,
  },

  media: {
    all: () => ['media'] as const,
    availability: () => ['media', 'availability'] as const,
  },

  skills: {
    all: () => ['skills'] as const,
    catalog: () => ['skills', 'catalog'] as const,
  },
} as const;

export const invalidateQueries = (patterns: (keyof typeof queryKeys)[]) => {
  patterns.forEach((pattern) => {
    queryClient.invalidateQueries({
      queryKey: [pattern],
      exact: false,
    });
  });
};

export const prefetchQuery = <T = unknown>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  options?: { staleTime?: number },
) => {
  return queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: options?.staleTime || 5 * 60 * 1000, // 5 minutes
  });
};

export const setQueryData = <T = unknown>(
  queryKey: readonly unknown[],
  data: T | ((old: T | undefined) => T),
) => {
  queryClient.setQueryData(queryKey, data);
};

export const optimisticUpdate = <T = unknown>(
  queryKey: readonly unknown[],
  updater: (old: T | undefined) => T,
  rollbackFn?: () => void,
) => {
  const previousData = queryClient.getQueryData<T>(queryKey);

  queryClient.setQueryData(queryKey, updater);

  return () => {
    if (rollbackFn) rollbackFn();
    queryClient.setQueryData(queryKey, previousData);
  };
};

export const backgroundSync = (queryKey: readonly unknown[]) => {
  return queryClient.refetchQueries({
    queryKey,
    type: 'active',
  });
};

export { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
