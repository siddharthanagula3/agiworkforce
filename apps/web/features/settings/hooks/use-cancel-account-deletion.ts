'use client';

import { useLayoutEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient, type QueryState } from '@tanstack/react-query';
import {
  MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_PATH,
  NO_PENDING_ACCOUNT_DELETION,
  parseAccountDeletionCancellationReceipt,
  type AccountDeletionStatus,
  type AccountDeletionCancellationReceipt,
} from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { toUserMessage } from '@/lib/user-error-message';

export type CancelAccountDeletionResult = AccountDeletionCancellationReceipt;
type Snapshot = QueryState<AccountDeletionStatus, Error>;

export interface AccountDeletionCancellationIntent {
  isCurrent: () => boolean;
  canConfirm: () => boolean;
  confirm: () => void;
  dismiss: () => void;
  checkCurrentStatus: () => Promise<void>;
}

interface Intent {
  generation: object;
  snapshot: Snapshot;
  request: RequestAuthority;
  consumed: boolean;
  dispatched: boolean;
  settled: boolean;
  checking: boolean;
  retired: boolean;
  release: () => void;
}

const UNCONFIRMED = 'We could not confirm the cancellation outcome. Reload the page, then check Settings > Account before trying again.';
const NOT_SENT = 'Cancellation was not sent. Close this dialog, check the current status, and reopen the confirmation.';

export function useCancelAccountDeletion(active = true) {
  const client = useQueryClient();
  const capture = useSessionSnapshot();
  const lane = useMemo(() => ({ enabled: active, mounted: false, generation: {}, intent: null as Intent | null }), []);
  lane.enabled = active;
  const [view, setView] = useState<{
    intent: Intent | null;
    status: 'idle' | 'pending' | 'success' | 'error';
    data?: CancelAccountDeletionResult;
    error: Error | null;
    needsStatusCheck: boolean;
  }>({ intent: null, status: 'idle', error: null, needsStatusCheck: false });
  const current = (intent: Intent) => !intent.retired && lane.enabled && lane.mounted &&
    lane.generation === intent.generation && lane.intent === intent && intent.request.session.isCurrent();
  const retire = (intent: Intent) => {
    intent.retired = true;
    intent.request.retire();
    intent.release();
    if (lane.intent === intent) lane.intent = null;
  };
  const ready = (snapshot: Snapshot) => client.getQueryState(queryKeys.settings.accountDeletionStatus()) === snapshot &&
    snapshot.status === 'success' && snapshot.fetchStatus === 'idle' && !snapshot.isInvalidated &&
    snapshot.data?.pending === true && snapshot.data.canCancel;
  useLayoutEffect(() => {
    lane.mounted = true;
    lane.generation = {};
    setView({ intent: null, status: 'idle', error: null, needsStatusCheck: false });
    return () => {
      lane.mounted = false;
      if (lane.intent) retire(lane.intent);
    };
  }, [lane, active]);
  useLayoutEffect(() => {
    if (lane.intent && !current(lane.intent)) {
      retire(lane.intent);
      setView({ intent: null, status: 'idle', error: null, needsStatusCheck: false });
    }
  });

  const mutation = useMutation<CancelAccountDeletionResult, Error, Intent>({
    retry: false,
    onError: () => undefined,
    mutationFn: async (intent) => {
      try {
        intent.request.assertCurrent();
        let response: Response;
        try {
          const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
          intent.request.assertCurrent();
          response = await intent.request.fetch(MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_PATH, {
            method: 'POST', headers,
          });
        } catch {
          throw new Error(intent.dispatched ? UNCONFIRMED : NOT_SENT);
        }
        const body: unknown = await response.json().catch(() => null);
        intent.request.assertCurrent();
        if (!response.ok) {
          const raw = body !== null && typeof body === 'object' && 'error' in body &&
            typeof body.error === 'string' && body.error.trim() ? body.error : `HTTP ${response.status}`;
          throw new Error(toUserMessage(Object.assign(new Error(raw), { status: response.status }),
            'Could not cancel account deletion.'));
        }
        let receipt: CancelAccountDeletionResult;
        try {
          receipt = parseAccountDeletionCancellationReceipt(body);
        } catch {
          throw new Error(UNCONFIRMED);
        }
        intent.request.assertCurrent();
        const unchanged = client.getQueryState(queryKeys.settings.accountDeletionStatus()) === intent.snapshot;
        if (unchanged) {
          client.setQueryData<AccountDeletionStatus>(queryKeys.settings.accountDeletionStatus(), NO_PENDING_ACCOUNT_DELETION);
        }
        intent.settled = true;
        if (current(intent)) setView({ intent, status: 'success', data: receipt, error: null, needsStatusCheck: !unchanged });
        return receipt;
      } catch (error) {
        intent.settled = true;
        if (current(intent)) setView({ intent, status: 'error', error: error instanceof Error ? error : new Error(UNCONFIRMED), needsStatusCheck: false });
        throw error;
      }
    },
  });

  const begin = (snapshot: Snapshot | null | undefined): AccountDeletionCancellationIntent | null => {
    if (!lane.enabled || !lane.mounted || !snapshot || !ready(snapshot)) return null;
    const session = capture();
    if (!session) return null;
    if (lane.intent) {
      if (lane.intent.consumed && !lane.intent.settled) return null;
      retire(lane.intent);
    }
    let intent: Intent;
    const request = createRequestAuthority(session, () => current(intent), () => {
      if (!intent.consumed || intent.dispatched || !ready(intent.snapshot)) throw new Error(NOT_SENT);
      intent.dispatched = true;
    });
    intent = { generation: lane.generation, snapshot, request, consumed: false, dispatched: false, settled: false, checking: false, retired: false, release: () => undefined };
    lane.intent = intent;
    const release = session.subscribe?.(() => {
      if (lane.intent !== intent || current(intent)) return;
      retire(intent);
      if (lane.mounted) setView({ intent: null, status: 'idle', error: null, needsStatusCheck: false });
    }) ?? (() => undefined);
    intent.release = release;
    if (!current(intent)) {
      retire(intent);
      return null;
    }
    setView({ intent, status: 'idle', error: null, needsStatusCheck: false });
    return {
      isCurrent: () => current(intent),
      canConfirm: () => current(intent) && !intent.consumed && ready(intent.snapshot),
      confirm: () => {
        if (!current(intent) || intent.consumed || !ready(intent.snapshot)) return;
        intent.consumed = true;
        setView({ intent, status: 'pending', error: null, needsStatusCheck: false });
        mutation.mutate(intent);
      },
      dismiss: () => {
        if (!current(intent)) return;
        retire(intent);
        setView({ intent: null, status: 'idle', error: null, needsStatusCheck: false });
      },
      checkCurrentStatus: async () => {
        if (!current(intent) || !intent.settled || intent.checking) return;
        intent.checking = true;
        setView((previous) => previous.intent === intent ? { ...previous, error: null } : previous);
        try {
          const before = client.getQueryState(queryKeys.settings.accountDeletionStatus());
          await client.refetchQueries({ queryKey: queryKeys.settings.accountDeletionStatus(), exact: true }, { throwOnError: true });
          if (!current(intent)) return;
          const status = client.getQueryState(queryKeys.settings.accountDeletionStatus());
          if (!status || status === before || status.status !== 'success' || status.fetchStatus !== 'idle' || status.isInvalidated) {
            throw new Error('Deletion status is not ready. Check the current status again.');
          }
          setView((previous) => current(intent) && previous.intent === intent
            ? { ...previous, needsStatusCheck: false } : previous);
        } catch {
          if (current(intent)) setView((previous) => current(intent) && previous.intent === intent
            ? { ...previous, error: new Error('Could not check the current deletion status. Try checking again without repeating cancellation.') } : previous);
        } finally {
          intent.checking = false;
          if (current(intent)) setView((previous) => previous.intent === intent ? { ...previous } : previous);
        }
      },
    };
  };
  const displayed = view.intent && current(view.intent) ? view : null;
  return {
    begin,
    isPending: displayed?.status === 'pending',
    isSuccess: displayed?.status === 'success',
    isError: displayed?.status === 'error',
    data: displayed?.data,
    error: displayed?.error ?? null,
    needsStatusCheck: displayed?.needsStatusCheck ?? false,
    isCheckingStatus: displayed?.intent?.checking ?? false,
  };
}
