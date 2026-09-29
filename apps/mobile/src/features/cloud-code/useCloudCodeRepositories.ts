import { useCallback, useEffect, useState } from 'react';
import type { CloudCodeBranch, CloudCodeRepository } from '@agiworkforce/cloud-contracts';
import { cloudCodeApi } from './service';

const SEARCH_DEBOUNCE_MS = 300;
const NO_INSTALLATIONS = 0;

export type CloudCodeRepositoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no-installation' }
  | {
      status: 'ready';
      repositories: CloudCodeRepository[];
      truncated: boolean;
      unreachable: string[];
    }
  | { status: 'error' };

export type CloudCodeBranchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; branches: CloudCodeBranch[]; truncated: boolean }
  | { status: 'error' };

export function useCloudCodeRepositories(
  enabled: boolean,
  search: string,
): { state: CloudCodeRepositoryState; reload: () => void } {
  const [state, setState] = useState<CloudCodeRepositoryState>({ status: 'idle' });
  const [token, setToken] = useState(0);
  const reload = useCallback(() => setToken((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => {
      setState({ status: 'loading' });
      cloudCodeApi
        .listRepositories(search.trim() || undefined, controller.signal)
        .then((list) => {
          if (cancelled) return;
          if (list.installationCount === NO_INSTALLATIONS) {
            setState({ status: 'no-installation' });
            return;
          }
          setState({
            status: 'ready',
            repositories: list.repositories,
            truncated: list.truncated,
            unreachable: list.unreachable.map((entry) => entry.accountLogin),
          });
        })
        .catch(() => {
          if (cancelled || controller.signal.aborted) return;
          setState({ status: 'error' });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, search, token]);

  return { state, reload };
}

export function useCloudCodeBranches(repository: CloudCodeRepository | null): {
  state: CloudCodeBranchState;
  reload: () => void;
} {
  const [state, setState] = useState<CloudCodeBranchState>({ status: 'idle' });
  const [token, setToken] = useState(0);
  const reload = useCallback(() => setToken((current) => current + 1), []);
  const installationId = repository?.installationId ?? null;
  const fullName = repository?.fullName ?? null;

  useEffect(() => {
    if (installationId === null || fullName === null) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: 'loading' });
    cloudCodeApi
      .listBranches({ installationId, fullName }, controller.signal)
      .then((list) => {
        if (cancelled) return;
        setState({ status: 'ready', branches: list.branches, truncated: list.truncated });
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fullName, installationId, token]);

  return { state, reload };
}
