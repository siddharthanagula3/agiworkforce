'use client';

import { useLayoutEffect, useRef } from 'react';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { createNotebookApi } from '../services/notebook-api';
import { createNotebookWorkspace, type NotebookWorkspace } from '../services/notebook-workspace';

export function useNotebookWorkspace(): NotebookWorkspace {
  const snapshot = useSessionSnapshot();
  const lifetime = useRef<{ current: () => boolean } | null>(null);
  const pending = useRef(new Set<RequestAuthority>());
  const workspace = useRef<NotebookWorkspace | null>(null);
  if (!workspace.current) {
    workspace.current = createNotebookWorkspace(
      () => {
        const owner = lifetime.current;
        const session = snapshot();
        if (!owner?.current() || !session)
          throw new DOMException('Notebook owner changed', 'AbortError');
        const authority = createRequestAuthority(
          session,
          () => lifetime.current === owner && owner.current(),
        );
        pending.current.add(authority);
        return {
          api: createNotebookApi({
            fetchImpl: authority.fetch,
            bearerAuthenticated: true,
            assertCurrent: authority.assertCurrent,
          }),
          isCurrent: authority.isCurrent,
          retire: () => {
            authority.retire();
            pending.current.delete(authority);
          },
        };
      },
      () => lifetime.current?.current() === true,
    );
  }
  useLayoutEffect(() => {
    const session = snapshot();
    const owner: { current: () => boolean } = {
      current: () => lifetime.current === owner && session?.isCurrent() === true,
    };
    lifetime.current = owner;
    const requests = pending.current;
    return () => {
      lifetime.current = null;
      for (const request of requests) request.retire();
      requests.clear();
    };
  }, [snapshot]);
  return workspace.current;
}
