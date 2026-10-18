import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/user-error-message';
import { logger } from '@shared/lib/logger';

const ENABLE_REACT_QUERY_DEVTOOLS =
  process.env['NEXT_PUBLIC_ENABLE_REACT_QUERY_DEVTOOLS'] === 'true';

function getErrorMessage(error: unknown): string {
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
  billing: {
    all: () => ['billing'] as const,
    plan: (userId: string) => ['billing', 'plan', userId] as const,
    upgradeWaitlist: (userId: string) => ['billing', 'upgrade-waitlist', userId] as const,
  },

  settings: {
    preferences: (userId?: string) => ['settings', 'preferences', userId] as const,
    apiKeys: (userId?: string) => ['settings', 'apiKeys', userId] as const,
    accountDeletionStatus: () => ['settings', 'accountDeletionStatus'] as const,
  },

  connectors: {
    permissions: () => ['connectors', 'permissions'] as const,
  },

  media: {
    availability: () => ['media', 'availability'] as const,
  },

  skills: {
    catalog: () => ['skills', 'catalog'] as const,
  },
} as const;
