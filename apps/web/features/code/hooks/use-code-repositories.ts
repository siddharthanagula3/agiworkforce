'use client';

import { useCallback, useEffect, useState } from 'react';
import { CODE_TIMING } from '../code-surface';
import type {
  CloudCodeApi,
  CloudCodeRepository,
  CloudCodeRepositoryList,
} from '@agiworkforce/cloud-contracts';

export type CodeRepositoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'linking-unavailable' }
  | { status: 'no-installation' }
  | { status: 'authorization-pending' }
  | { status: 'reauthorization-required' }
  | {
      status: 'ready';
      repositories: CloudCodeRepository[];
      truncated: boolean;
      unreachable: string[];
    }
  | { status: 'error' };

const FIRST_TOKEN = 0;
const NEXT_TOKEN = 1;
const NO_INSTALLATIONS = 0;

export function codeRepositoryState(body: CloudCodeRepositoryList): CodeRepositoryState {
  const connection = body.connection?.status;
  if (connection === 'unconfigured') return { status: 'unconfigured' };
  if (connection === 'linking-unavailable') return { status: 'linking-unavailable' };
  if (connection === 'authorization-pending') return { status: 'authorization-pending' };
  if (connection === 'reauthorization-required') return { status: 'reauthorization-required' };
  if (
    connection === 'unauthorized' ||
    (connection === undefined && body.installationCount === NO_INSTALLATIONS)
  ) {
    return { status: 'no-installation' };
  }
  return {
    status: 'ready',
    repositories: body.repositories,
    truncated: body.truncated,
    unreachable: body.unreachable.map((entry) => entry.accountLogin),
  };
}

function useDebouncedValue(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), CODE_TIMING.searchDebounceMs);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

export function useCodeRepositories(
  enabled: boolean,
  search: string,
  api: CloudCodeApi,
): { state: CodeRepositoryState; reload: () => void } {
  const [state, setState] = useState<CodeRepositoryState>({ status: 'idle' });
  const [token, setToken] = useState(FIRST_TOKEN);
  const debouncedSearch = useDebouncedValue(search);

  const reload = useCallback(() => setToken((current) => current + NEXT_TOKEN), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: 'loading' });

    void api
      .listRepositories(debouncedSearch.trim() || undefined, controller.signal)
      .then((body) => {
        if (cancelled) return;
        setState(codeRepositoryState(body));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, debouncedSearch, enabled, token]);

  return { state, reload };
}
