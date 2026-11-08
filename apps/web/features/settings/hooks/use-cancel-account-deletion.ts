'use client';

import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH,
  parseAccountDeletionCancellationReceipt,
  type AccountDeletionCancellationReceipt,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import {
  captureAccountDeletionCancellationBody,
  createAccountDeletionRequest,
  fenceAccountDeletionCancellation,
  isAccountDeletionSnapshotCurrent,
  permitsAccountDeletionAction,
  refetchAccountDeletionSnapshot,
  settleAccountDeletionCancellation,
  type OwnedAccountDeletionSnapshot,
} from './use-account-deletion-status';
import { toUserMessage } from '@/lib/user-error-message';

export type CancelAccountDeletionResult = AccountDeletionCancellationReceipt;
type Snapshot = OwnedAccountDeletionSnapshot;

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
  readonly body: string;
  request: RequestAuthority;
  consumed: boolean;
  dispatched: boolean;
  settled: boolean;
  checking: boolean;
  retired: boolean;
  release: () => void;
}

const UNCONFIRMED =
  'We could not confirm the cancellation outcome. Check the current status, then open a new confirmation before trying again.';
const NOT_SENT =
  'Cancellation was not sent. Close this dialog, check the current status, and reopen the confirmation.';

export function useCancelAccountDeletion(active = true) {
  const lane = useMemo(
    () => ({ enabled: false, mounted: false, generation: {}, intent: null as Intent | null }),
    [],
  );
  lane.enabled = active;
  const [view, setView] = useState<{
    intent: Intent | null;
    status: 'idle' | 'pending' | 'success' | 'error';
    data?: CancelAccountDeletionResult;
    error: Error | null;
    needsStatusCheck: boolean;
  }>({ intent: null, status: 'idle', error: null, needsStatusCheck: false });
  const current = useCallback(
    (intent: Intent) =>
      !intent.retired &&
      lane.enabled &&
      lane.mounted &&
      lane.generation === intent.generation &&
      lane.intent === intent &&
      isAccountDeletionSnapshotCurrent(intent.snapshot) &&
      intent.request.session.isCurrent(),
    [lane],
  );
  const retire = useCallback(
    (intent: Intent) => {
      intent.retired = true;
      intent.request.retire();
      intent.release();
      if (lane.intent === intent) lane.intent = null;
    },
    [lane],
  );
  const ready = (snapshot: Snapshot) => permitsAccountDeletionAction(snapshot, 'cancel');
  useLayoutEffect(() => {
    lane.mounted = true;
    lane.generation = {};
    setView({ intent: null, status: 'idle', error: null, needsStatusCheck: false });
    return () => {
      lane.mounted = false;
      if (lane.intent) retire(lane.intent);
    };
  }, [lane, active, retire]);
  const renderedIntent = lane.intent;
  const renderedIntentCurrent = renderedIntent === null || current(renderedIntent);
  useLayoutEffect(() => {
    if (renderedIntent && lane.intent === renderedIntent && !renderedIntentCurrent) {
      retire(renderedIntent);
      setView({ intent: null, status: 'idle', error: null, needsStatusCheck: false });
    }
  }, [lane, renderedIntent, renderedIntentCurrent, retire]);

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
          if (!ready(intent.snapshot)) throw new Error(NOT_SENT);
          response = await intent.request.fetch(
            MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH,
            {
              method: 'PUT',
              headers,
              body: intent.body,
              redirect: 'error',
            },
          );
        } catch {
          throw new Error(intent.dispatched ? UNCONFIRMED : NOT_SENT);
        }
        const body: unknown = await response.json().catch(() => null);
        intent.request.assertCurrent();
        if (!response.ok) {
          if (response.status >= 500) throw new Error(UNCONFIRMED);
          if (
            response.status === 409 &&
            body !== null &&
            typeof body === 'object' &&
            'reason' in body &&
            body.reason === 'schedule_changed'
          ) {
            throw new Error(
              'The deletion schedule changed. Check the current status and open a new confirmation.',
            );
          }
          const raw =
            body !== null &&
            typeof body === 'object' &&
            'error' in body &&
            typeof body.error === 'string' &&
            body.error.trim()
              ? body.error
              : `HTTP ${response.status}`;
          throw new Error(
            toUserMessage(
              Object.assign(new Error(raw), { status: response.status }),
              'Could not cancel account deletion.',
            ),
          );
        }
        let receipt: CancelAccountDeletionResult;
        try {
          receipt = parseAccountDeletionCancellationReceipt(body);
        } catch {
          throw new Error(UNCONFIRMED);
        }
        intent.request.assertCurrent();
        const unchanged = settleAccountDeletionCancellation(intent.snapshot);
        if (!unchanged) fenceAccountDeletionCancellation(intent.snapshot);
        intent.settled = true;
        if (current(intent))
          setView({
            intent,
            status: 'success',
            data: receipt,
            error: null,
            needsStatusCheck: !unchanged,
          });
        return receipt;
      } catch (error) {
        if (intent.dispatched) fenceAccountDeletionCancellation(intent.snapshot);
        intent.settled = true;
        if (current(intent))
          setView({
            intent,
            status: 'error',
            error: error instanceof Error ? error : new Error(UNCONFIRMED),
            needsStatusCheck: intent.dispatched,
          });
        throw error;
      }
    },
  });

  const begin = (
    snapshot: Snapshot | null | undefined,
  ): AccountDeletionCancellationIntent | null => {
    if (!lane.enabled || !lane.mounted || !snapshot || !ready(snapshot)) return null;
    const body = captureAccountDeletionCancellationBody(snapshot);
    if (body === null) return null;
    if (lane.intent) {
      if (lane.intent.consumed && !lane.intent.settled) return null;
      retire(lane.intent);
    }

    const request = createAccountDeletionRequest(
      snapshot,
      () => current(intent),
      () => {
        if (!intent.consumed || intent.dispatched || !ready(intent.snapshot))
          throw new Error(NOT_SENT);
        fenceAccountDeletionCancellation(intent.snapshot);
        intent.dispatched = true;
      },
    );
    if (!request) return null;
    const intent: Intent = {
      generation: lane.generation,
      snapshot,
      body,
      request,
      consumed: false,
      dispatched: false,
      settled: false,
      checking: false,
      retired: false,
      release: () => undefined,
    };
    lane.intent = intent;
    const release =
      request.session.subscribe?.(() => {
        if (lane.intent !== intent || current(intent)) return;
        retire(intent);
        if (lane.mounted)
          setView({ intent: null, status: 'idle', error: null, needsStatusCheck: false });
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
        setView((previous) => (previous.intent === intent ? { ...previous } : previous));
        try {
          await refetchAccountDeletionSnapshot(intent.snapshot);
          if (!current(intent)) return;
          setView((previous) =>
            current(intent) && previous.intent === intent
              ? { ...previous, needsStatusCheck: false }
              : previous,
          );
        } catch {
          if (current(intent))
            setView((previous) =>
              current(intent) && previous.intent === intent
                ? {
                    ...previous,
                    error: new Error(
                      'Could not check the current deletion status. Try checking again without repeating cancellation.',
                    ),
                  }
                : previous,
            );
        } finally {
          intent.checking = false;
          if (current(intent))
            setView((previous) => (previous.intent === intent ? { ...previous } : previous));
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
