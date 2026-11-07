'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { createRequestAuthority, type RequestAuthority, type SessionAuthority } from '@/lib/identity/request-authority';
import { parseTwoFactorStatus } from '../services/two-factor-client';
import { queryClient } from '@shared/stores/query-client';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';

export const WORKSPACE_MFA_REQUIREMENT_QUERY_KEY = ['settings', 'two-factor', 'workspace-requirement'] as const;
const STATUS_QUERY_KEY = ['settings', 'two-factor-status'] as const;
const requirementSchema = z.object({ required: z.boolean() });

type ReaderOwner = {
  session: SessionAuthority;
  incarnation: number;
  generation: number | null;
  retired: boolean;
  requests: Set<RequestAuthority>;
};

function retire(owner: ReaderOwner) {
  owner.retired = true;
  owner.generation = null;
  for (const request of owner.requests) request.retire();
}

function useMfaReader<T>(prefix: readonly string[], path: string, parse: (body: unknown) => T,
  staleTime: number, refetchOnWindowFocus: boolean, active = true) {
  const capture = useSessionSnapshot();
  const instance = useId();
  const slot = useRef<ReaderOwner | null>(null);
  const admission = useRef(active);
  admission.current = active;
  const sequence = useRef(0);
  const setups = useRef(0);
  const [, redraw] = useState(0);
  if (slot.current && (!active || slot.current.retired || !slot.current.session.isCurrent())) {
    retire(slot.current);
    slot.current = null;
  }
  if (active && !slot.current) {
    const session = capture();
    if (session) slot.current = {
      session, incarnation: ++sequence.current, generation: null, retired: false, requests: new Set(),
    };
  }
  const owner = slot.current;
  const generation = owner?.generation;
  const current = () => admission.current && !!owner && slot.current === owner && !owner.retired &&
    generation != null && owner.generation === generation && owner.session.isCurrent();

  useLayoutEffect(() => {
    if (!owner) return;
    owner.generation = ++setups.current;
    const stop = owner.session.subscribe?.(() => {
      if (!owner.session.isCurrent()) {
        retire(owner);
        redraw((value) => value + 1);
      }
    });
    if (!owner.session.isCurrent()) retire(owner);
    redraw((value) => value + 1);
    return () => {
      owner.generation = null;
      for (const request of owner.requests) request.retire();
      stop?.();
    };
  }, [owner]);

  const query = useQuery({
    // Private observers must never cancel another mounted reader's request.
    queryKey: [...prefix, owner?.session.userId, owner?.session.sessionId, instance,
      owner?.incarnation, generation],
    enabled: current(),
    staleTime,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus,
    meta: { silent: true },
    queryFn: async ({ signal }) => {
      if (!owner || !current() || signal.aborted) {
        if (owner && owner.generation !== null && !owner.session.isCurrent() && slot.current === owner) {
          retire(owner);
          redraw((value) => value + 1);
        }
        throw new DOMException('MFA reader retired', 'AbortError');
      }
      const request = createRequestAuthority(owner.session, () => current() && !signal.aborted);
      owner.requests.add(request);
      signal.addEventListener('abort', request.retire, { once: true });
      try {
        const response = await request.fetch(path, { cache: 'no-store' });
        request.assertCurrent();
        if (!response.ok) throw new Error('Your two-factor information could not be loaded.');
        const body: unknown = await response.json();
        request.assertCurrent();
        const data = parse(body);
        request.assertCurrent();
        return data;
      } finally {
        signal.removeEventListener('abort', request.retire);
        owner.requests.delete(request);
        request.retire();
        if (owner.generation !== null && !owner.session.isCurrent() && slot.current === owner) {
          retire(owner);
          redraw((value) => value + 1);
        }
      }
    },
  });
  return {
    data: current() && !query.isError ? query.data : undefined,
    error: current() ? query.error : null,
    isLoading: current() && query.isPending,
  };
}

export function useMfaRequirement() {
  return useMfaReader(WORKSPACE_MFA_REQUIREMENT_QUERY_KEY, '/api/settings/2fa/requirement',
    (body) => requirementSchema.parse(body).required, 60_000, true);
}

export function useMfaStatus(active = true) {
  return useMfaReader(STATUS_QUERY_KEY, '/api/settings/2fa',
    parseTwoFactorStatus, 5 * 60_000, false, active);
}

export function invalidateMfaReaders(session: SessionAuthority) {
  if (!session.isCurrent()) return;
  void queryClient.invalidateQueries({ predicate: (query) => {
    if (!session.isCurrent()) return false;
    return [STATUS_QUERY_KEY, WORKSPACE_MFA_REQUIREMENT_QUERY_KEY].some((prefix) =>
      prefix.every((part, index) => query.queryKey[index] === part) &&
      query.queryKey[prefix.length] === session.userId &&
      query.queryKey[prefix.length + 1] === session.sessionId);
  } });
}
