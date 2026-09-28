'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CloudCodeApi, CloudCodeBranch } from '@agiworkforce/cloud-contracts';

export type CodeBranchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; branches: CloudCodeBranch[]; truncated: boolean }
  | { status: 'error' };

const FIRST_TOKEN = 0;
const NEXT_TOKEN = 1;

export function useCodeBranches(
  repository: { installationId: number; fullName: string } | null,
  enabled: boolean,
  api: CloudCodeApi,
): { state: CodeBranchState; reload: () => void } {
  const [state, setState] = useState<CodeBranchState>({ status: 'idle' });
  const [token, setToken] = useState(FIRST_TOKEN);
  const installationId = repository?.installationId ?? null;
  const fullName = repository?.fullName ?? null;

  const reload = useCallback(() => setToken((current) => current + NEXT_TOKEN), []);

  useEffect(() => {
    if (!enabled || installationId === null || fullName === null) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: 'loading' });

    void api
      .listBranches({ installationId, fullName }, controller.signal)
      .then((body) => {
        if (cancelled) return;
        setState({ status: 'ready', branches: body.branches, truncated: body.truncated });
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
  }, [api, enabled, fullName, installationId, token]);

  return { state, reload };
}
