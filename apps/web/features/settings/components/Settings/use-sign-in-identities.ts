'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { AUTH_PROVIDER_IDS } from '@agiworkforce/client-runtime';
import { createRequestAuthority, type RequestAuthority, type SessionAuthority } from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';

const UNREADABLE = 'Your sign-in methods could not be loaded.';
const serializedDate = z.string().datetime({ offset: true });
const identitySchema = z.object({
  id: z.string().uuid(),
  provider: z.string().min(1),
  creationSource: z.string().min(1),
  createdAt: serializedDate,
  lastAuthenticatedAt: serializedDate.nullable(),
  removable: z.boolean(),
});
export const signInIdentitiesSchema = z.object({
  identities: z.array(identitySchema),
  providers: z.array(z.object({ id: z.enum(AUTH_PROVIDER_IDS), label: z.string().trim().min(1) })),
  consequence: z.string().trim().min(1),
}).refine((value) => new Set(value.identities.map((identity) => identity.id)).size === value.identities.length)
  .refine((value) => new Set(value.providers.map((provider) => provider.id)).size === value.providers.length);

type Identities = z.infer<typeof signInIdentitiesSchema>;
type Owner = {
  session: SessionAuthority;
  active: boolean;
  retired: boolean;
  request: RequestAuthority | null;
};
type State =
  | { owner: Owner; request: RequestAuthority; kind: 'loading' }
  | { owner: Owner; request: RequestAuthority; kind: 'ready'; data: Identities }
  | { owner: Owner; request: RequestAuthority; kind: 'failed' };

export function useSignInIdentities() {
  const capture = useSessionSnapshot();
  const slot = useRef<Owner | null>(null);
  const [, refresh] = useState(0);
  const [state, setState] = useState<State | null>(null);
  if (slot.current && (slot.current.retired || !slot.current.session.isCurrent())) {
    slot.current.retired = true;
    slot.current = null;
  }
  if (!slot.current) {
    const session = capture();
    if (session) slot.current = { session, active: false, retired: false, request: null };
  }
  const owner = slot.current;
  const current = useCallback(() => !!owner && slot.current === owner && owner.active && !owner.retired && owner.session.isCurrent(), [owner]);
  const reload = useCallback(() => {
    if (!owner || !current()) return;
    owner.request?.retire();
    const request = createRequestAuthority(owner.session, () => current() && owner.request === request);
    owner.request = request;
    setState({ owner, request, kind: 'loading' });
    void (async () => {
      try {
        const response = await request.fetch('/api/settings/identities', { method: 'GET', cache: 'no-store' });
        request.assertCurrent();
        if (!response.ok) throw new Error(UNREADABLE);
        const body: unknown = await response.json();
        request.assertCurrent();
        const data = signInIdentitiesSchema.parse(body);
        request.assertCurrent();
        setState({ owner, request, kind: 'ready', data });
      } catch {
        if (request.isCurrent()) setState({ owner, request, kind: 'failed' });
      }
    })();
  }, [current, owner]);
  useLayoutEffect(() => {
    if (!owner) return;
    owner.active = true;
    const stop = owner.session.subscribe?.(() => {
      if (!owner.session.isCurrent()) {
        owner.retired = true;
        owner.request?.retire();
        refresh((value) => value + 1);
      }
    });
    reload();
    return () => {
      owner.active = false;
      owner.request?.retire();
      stop?.();
    };
  }, [owner, reload]);
  const visible = current() && state?.owner === owner && state.request === owner?.request && state.request.isCurrent()
    ? state : null;
  return {
    ownerId: current() ? owner!.session.userId : null,
    data: visible?.kind === 'ready' ? visible.data : null,
    error: visible?.kind === 'failed' ? UNREADABLE : null,
    isLoading: current() && (!visible || visible.kind === 'loading'),
    reload,
  };
}
