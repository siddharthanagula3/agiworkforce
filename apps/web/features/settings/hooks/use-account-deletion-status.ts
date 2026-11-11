'use client';

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type QueryState,
} from '@tanstack/react-query';
import {
  AccountDeletionScheduleCancellationRequestSchema,
  MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
  NO_PENDING_ACCOUNT_DELETION,
  parseAccountDeletionStatus,
  type AccountDeletionStatus,
} from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';
import { TimeoutPresets } from '@shared/lib/error-utils';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';

type ReaderOwner = {
  session: SessionAuthority;
  incarnation: number;
  generation: number | null;
  retired: boolean;
  requests: Set<RequestAuthority>;
  readSequence: number;
  cancellationFence: number;
  completedReadSequence: number;
};
type Envelope = {
  instance: string;
  incarnation: number;
  generation: number;
  status: AccountDeletionStatus;
  readSequence: number;
};
declare const ownedSnapshot: unique symbol;
export type OwnedAccountDeletionSnapshot = { readonly [ownedSnapshot]: true };
type Provenance = {
  client: QueryClient;
  key: QueryKey;
  owner: ReaderOwner;
  state: QueryState<Envelope, Error>;
  current: () => boolean;
  owns: (data: Envelope | undefined) => boolean;
};
const snapshots = new WeakMap<OwnedAccountDeletionSnapshot, Provenance>();

function retire(owner: ReaderOwner) {
  owner.retired = true;
  owner.generation = null;
  for (const request of owner.requests) request.retire();
}

function ready(record: Provenance, state = record.state) {
  return (
    record.current() &&
    record.client.getQueryState(record.key) === state &&
    state.status === 'success' &&
    state.fetchStatus === 'idle' &&
    !state.isInvalidated &&
    record.owns(state.data)
  );
}

export function isAccountDeletionSnapshotCurrent(snapshot: OwnedAccountDeletionSnapshot) {
  return snapshots.get(snapshot)?.current() ?? false;
}

export function permitsAccountDeletionAction(
  snapshot: OwnedAccountDeletionSnapshot | null | undefined,
  action: 'schedule' | 'cancel',
) {
  const record = snapshot && snapshots.get(snapshot);
  if (!record || !ready(record) || !record.state.data) return false;
  const status = record.state.data.status;
  return action === 'schedule'
    ? !status.pending
    : status.pending &&
        status.canCancel &&
        status.cancellationPrecondition === 'schedule-pair-v1' &&
        record.state.data.readSequence > record.owner.cancellationFence &&
        record.state.data.readSequence === record.owner.completedReadSequence;
}

export function captureAccountDeletionCancellationBody(
  snapshot: OwnedAccountDeletionSnapshot,
): string | null {
  const record = snapshots.get(snapshot);
  if (!record || !permitsAccountDeletionAction(snapshot, 'cancel') || !record.state.data)
    return null;
  const { scheduledFor, requestedAt } = record.state.data.status;
  const parsed = AccountDeletionScheduleCancellationRequestSchema.safeParse({
    expectedSchedule: { scheduledFor, requestedAt },
  });
  return parsed.success ? JSON.stringify(parsed.data) : null;
}

export function fenceAccountDeletionCancellation(snapshot: OwnedAccountDeletionSnapshot) {
  const record = snapshots.get(snapshot);
  if (record?.current()) record.owner.cancellationFence = record.owner.readSequence;
}

export function createAccountDeletionRequest(
  snapshot: OwnedAccountDeletionSnapshot,
  lifetime: () => boolean,
  onDispatch?: () => void,
  action: 'schedule' | 'cancel' = 'cancel',
): RequestAuthority | null {
  const record = snapshots.get(snapshot);
  if (!record || !permitsAccountDeletionAction(snapshot, action)) return null;
  const authority = createRequestAuthority(
    record.owner.session,
    () => record.current() && lifetime(),
    onDispatch,
  );
  const request: RequestAuthority = {
    ...authority,
    retire: () => {
      authority.retire();
      record.owner.requests.delete(request);
    },
  };
  record.owner.requests.add(request);
  return request;
}

export function settleAccountDeletionCancellation(snapshot: OwnedAccountDeletionSnapshot) {
  const record = snapshots.get(snapshot);
  if (!record || !ready(record) || !record.state.data) return false;
  record.client.setQueryData<Envelope>(record.key, {
    ...record.state.data,
    status: NO_PENDING_ACCOUNT_DELETION,
  });
  return true;
}

export async function refetchAccountDeletionSnapshot(snapshot: OwnedAccountDeletionSnapshot) {
  const record = snapshots.get(snapshot);
  if (!record?.current()) throw new DOMException('Deletion status reader retired', 'AbortError');
  const readSequence = record.owner.readSequence;
  await record.client.cancelQueries({ queryKey: record.key, exact: true });
  if (!record.current()) throw new DOMException('Deletion status reader retired', 'AbortError');
  await record.client.refetchQueries({ queryKey: record.key, exact: true }, { throwOnError: true });
  const state = record.client.getQueryState<Envelope, Error>(record.key);
  if (!state || !ready(record, state) || !state.data || state.data.readSequence <= readSequence) {
    throw new Error('Deletion status is not ready. Check the current status again.');
  }
}

export function useAccountDeletionStatus(active = true) {
  const client = useQueryClient();
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
    if (session)
      slot.current = {
        session,
        incarnation: ++sequence.current,
        generation: null,
        retired: false,
        requests: new Set(),
        readSequence: 0,
        cancellationFence: 0,
        completedReadSequence: 0,
      };
  }
  const owner = slot.current;
  const generation = owner?.generation;
  const current = useCallback(
    () =>
      admission.current &&
      !!owner &&
      slot.current === owner &&
      !owner.retired &&
      generation != null &&
      owner.generation === generation &&
      owner.session.isCurrent(),
    [owner, generation],
  );
  const key = useMemo(
    () => [
      ...queryKeys.settings.accountDeletionStatus(),
      owner?.session.userId,
      owner?.session.sessionId,
      instance,
      owner?.incarnation,
      generation,
    ],
    [owner, generation, instance],
  );
  const owns = useCallback(
    (data: Envelope | undefined) =>
      !!data &&
      data.instance === instance &&
      data.incarnation === owner?.incarnation &&
      data.generation === generation,
    [instance, owner, generation],
  );

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
    queryKey: key,
    enabled: current(),
    staleTime: 30_000,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    meta: { silent: true },
    queryFn: async ({ signal }): Promise<Envelope> => {
      if (!owner || generation == null || !current() || signal.aborted) {
        throw new DOMException('Deletion status reader retired', 'AbortError');
      }
      const readSequence = ++owner.readSequence;
      const timeout = AbortSignal.timeout(TimeoutPresets.FAST);
      const abort = AbortSignal.any([signal, timeout]);
      const request = createRequestAuthority(owner.session, () => current() && !abort.aborted);
      owner.requests.add(request);
      abort.addEventListener('abort', request.retire, { once: true });
      try {
        const response = await request.fetch(MANAGED_CLOUD_ACCOUNT_DELETION_PATH, {
          method: 'GET',
          cache: 'no-store',
          signal: abort,
        });
        request.assertCurrent();
        const body: unknown = await response.json();
        request.assertCurrent();
        if (!response.ok) throw new Error('Unable to check account deletion status.');
        const status = parseAccountDeletionStatus(body);
        request.assertCurrent();
        owner.completedReadSequence = readSequence;
        return { instance, incarnation: owner.incarnation, generation, status, readSequence };
      } finally {
        abort.removeEventListener('abort', request.retire);
        owner.requests.delete(request);
        request.retire();
        if (owner.generation !== null && !owner.session.isCurrent() && slot.current === owner) {
          retire(owner);
          redraw((value) => value + 1);
        }
      }
    },
  });
  const state = useSyncExternalStore(
    useCallback((notify: () => void) => client.getQueryCache().subscribe(notify), [client]),
    useCallback(() => client.getQueryState<Envelope, Error>(key), [client, key]),
    useCallback(() => client.getQueryState<Envelope, Error>(key), [client, key]),
  );
  const snapshot = useMemo(() => {
    if (!owner || !state || !current() || !owns(state.data)) return null;
    const value = Object.freeze({}) as OwnedAccountDeletionSnapshot;
    snapshots.set(value, { client, key, owner, state, current, owns });
    return value;
  }, [client, key, owner, state, current, owns]);
  return {
    snapshot: current() ? snapshot : null,
    data: current() && owns(state?.data) ? state?.data?.status : undefined,
    isInvalidated: current() && !!state?.isInvalidated,
    isLoading: current() && query.isPending,
    isFetching: current() && query.isFetching,
    isError: current() && query.isError,
    error: current() ? query.error : null,
    refetch: async () => {
      if (!current()) return;
      await query.refetch();
    },
  };
}
