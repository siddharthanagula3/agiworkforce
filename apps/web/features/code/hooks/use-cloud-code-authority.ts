'use client';

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { CloudCodeApi } from '@agiworkforce/cloud-contracts';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { createOwnedCloudCodeApi } from '../services/cloud-code-api';

export function useCloudCodeAuthority(originalInjectedApi?: CloudCodeApi) {
  const snapshot = useSessionSnapshot();
  const generation = useRef<AbortController | null>(null);
  const pending = useRef(new Set<RequestAuthority>());

  useLayoutEffect(() => {
    const lifetime = new AbortController();
    generation.current = lifetime;
    const requests = pending.current;
    return () => {
      lifetime.abort();
      for (const authority of requests) authority.retire();
      requests.clear();
    };
  }, []);

  const capture = useCallback(() => {
    const lifetime = generation.current;
    const session = snapshot();
    return () =>
      Boolean(
        lifetime &&
        !lifetime.signal.aborted &&
        generation.current === lifetime &&
        session?.isCurrent(),
      );
  }, [snapshot]);

  const captureAuthority = useCallback(() => {
    const lifetime = generation.current;
    const session = snapshot();
    if (!lifetime || lifetime.signal.aborted || !session) {
      throw new DOMException('Request owner changed', 'AbortError');
    }
    const authority = createRequestAuthority(
      session,
      () => generation.current === lifetime && !lifetime.signal.aborted,
    );
    const retire = authority.retire;
    authority.retire = () => {
      retire();
      pending.current.delete(authority);
    };
    pending.current.add(authority);
    return authority;
  }, [snapshot]);

  const api = useMemo(
    () => createOwnedCloudCodeApi(captureAuthority, originalInjectedApi),
    [captureAuthority, originalInjectedApi],
  );
  return { api, capture };
}
