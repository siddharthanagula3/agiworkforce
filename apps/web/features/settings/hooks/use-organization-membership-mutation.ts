'use client';

import { useLayoutEffect, useMemo, useState, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_WORKSPACES_PATH,
  ManagedCloudAccountWorkspacesSchema,
  ManagedCloudWorkspaceLeaveReceiptSchema,
  ManagedCloudWorkspaceOwnershipTransferReceiptSchema,
  type ManagedCloudWorkspaceLeaveReceipt,
  type ManagedCloudWorkspaceOwnershipTransfer,
  type ManagedCloudWorkspaceOwnershipTransferReceipt,
} from '@agiworkforce/cloud-contracts';
import { getCsrfToken } from '@/lib/client/csrf';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
  observeWorkspaceOwner,
  subscribeWorkspaceAdmission,
  workspaceOwnerIsCurrent,
  type WorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
import { finalizeWorkspaceSwitch } from '@/features/workspaces/lib/workspace-cache-scope';
import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { toUserMessage } from '@/lib/user-error-message';
import { useStepUp } from './useStepUp';

export type LeaveOrganizationVariables = { organizationId: string; successorUserId?: string };
export type OrganizationOwnerRoleAfterTransfer = NonNullable<
  ManagedCloudWorkspaceOwnershipTransfer['outgoingOwnerRole']
>;
export type TransferOwnershipVariables = {
  organizationId: string;
  toUserId: string;
  outgoingOwnerRole: OrganizationOwnerRoleAfterTransfer;
};

type MembershipPhase = 'confirming' | 'writing' | 'receipt' | 'finishing' | 'uncertain';

export interface PreparedWorkspaceMembershipAction {
  submit: () => void;
  cancel: () => void;
  isCurrent: () => boolean;
}

export interface WorkspaceMembershipMutation<Input, Receipt> {
  ownerKey: string | null;
  organizationId: string | null;
  workspaceName: string | null;
  currentUserRole: string | null;
  actorUserId: string | null;
  canMutate: boolean;
  prepare: (input: Input) => PreparedWorkspaceMembershipAction | null;
  mutate: (input: Input) => void;
  phase: MembershipPhase | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  isPending: boolean;
  data: Receipt | undefined;
  error: Error | null;
  stepUpDialog: ReactElement | null;
  continueAfterReceipt: () => Promise<void>;
}

export type LeaveOrganizationMutation = WorkspaceMembershipMutation<
  LeaveOrganizationVariables, ManagedCloudWorkspaceLeaveReceipt
>;
export type TransferOwnershipMutation = WorkspaceMembershipMutation<
  TransferOwnershipVariables, ManagedCloudWorkspaceOwnershipTransferReceipt
>;

interface MembershipIntent<Input, Receipt> {
  owner: WorkspaceOwner;
  epoch: number;
  generation: object;
  input: Input;
  accountId: string;
  request: RequestAuthority;
  phase: MembershipPhase;
  transitioned: boolean;
  dispatched: boolean;
  receipt?: Receipt;
  release: () => void;
}

const UNKNOWN_OUTCOME = 'We could not confirm whether this workspace action completed. Reload to check your workspace before trying again. Reloading will not repeat the action.';

async function readRefusal(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null) as {
    error?: string | { message?: unknown };
  } | null;
  const message = typeof body?.error === 'string' ? body.error : body?.error?.message;
  return new Error(toUserMessage(
    Object.assign(new Error(typeof message === 'string' ? message : ''), { status: response.status }),
    'The workspace action was refused. Please try again.',
  ));
}

function useWorkspaceMembershipMutation<Input extends { organizationId: string }, Receipt>(config: {
  path: string;
  method: 'DELETE' | 'POST';
  body: (input: Input) => unknown;
  receipt: (body: unknown, input: Input, accountId: string) => Receipt;
}, active: boolean): WorkspaceMembershipMutation<Input, Receipt> {
  const queryClient = useQueryClient();
  const workspaces = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const epoch = owner?.epoch;
  const scopeKey = owner?.scopeKey;
  const organizationId = workspaces.data?.activeOrganizationId ?? null;
  const accountId = workspaces.data?.accountId ?? null;
  const workspace = workspaces.data?.workspaces.find((candidate) =>
    candidate.kind === 'organization' && candidate.organizationId === organizationId);
  const { withStepUp, dialog } = useStepUp();
  type Intent = MembershipIntent<Input, Receipt>;
  const lane = useMemo(() => ({ active: false, enabled: active, incarnation: 0, accountId: null as string | null, generation: {} as object, intent: null as Intent | null }), []);
  lane.enabled = active;
  if (workspaces.data && lane.accountId !== accountId) {
    lane.accountId = accountId;
    lane.incarnation += 1;
    lane.generation = {};
  }
  const renderedIncarnation = lane.incarnation;
  const [view, setView] = useState<{
    intent: Intent | null;
    error: Error | null;
    status: 'idle' | 'pending' | 'success' | 'error';
  }>({ intent: null, error: null, status: 'idle' });
  const current = (intent: Intent) => lane.active && lane.enabled && lane.generation === intent.generation &&
    lane.intent === intent && lane.accountId === intent.accountId && workspaceOwnerIsCurrent(intent.owner, intent.epoch);
  const releaseTransition = (intent: Intent, uncertain: boolean) => {
    if (!intent.transitioned) return;
    intent.transitioned = false;
    finishWorkspaceSwitch(intent.owner, intent.epoch, uncertain);
  };
  const retire = (intent: Intent) => {
    if (lane.intent === intent) lane.intent = null;
    intent.release();
    intent.request.retire();
    releaseTransition(intent, intent.dispatched);
  };
  useLayoutEffect(() => {
    lane.active = active;
    lane.incarnation += 1;
    lane.generation = {};
    setView({ intent: null, error: null, status: 'idle' });
    const stop = subscribeWorkspaceAdmission(() => {
      const intent = lane.intent;
      if (intent && !current(intent)) {
        retire(intent);
        setView({ intent: null, error: null, status: 'idle' });
      }
    });
    return () => {
      stop();
      lane.active = false;
      if (lane.intent) retire(lane.intent);
    };
  }, [lane, active]);
  useLayoutEffect(() => {
    const intent = lane.intent;
    if (intent && !current(intent)) {
      retire(intent);
      setView({ intent: null, error: null, status: 'idle' });
    }
  }, [lane, accountId, owner]);

  const mutation = useMutation<Receipt, Error, Intent>({
    retry: false,
    onError: () => undefined,
    mutationFn: async (intent) => {
      const { request, input } = intent;
      try {
        request.assertCurrent();
        const response = await withStepUp(async (headers) => {
          request.assertCurrent();
          const csrfToken = await getCsrfToken();
          request.assertCurrent();
          return request.fetch(config.path, {
            method: config.method,
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
              [MANAGED_CLOUD_ORGANIZATION_HEADER]: input.organizationId,
            },
            body: JSON.stringify(config.body(input)),
          });
        }, input.organizationId, {
          authority: request,
          onStepUpRequired: () => { intent.dispatched = false; },
        });
        request.assertCurrent();
        if (!response.ok) throw await readRefusal(response);
        const body: unknown = await response.json();
        request.assertCurrent();
        const receipt = config.receipt(body, input, intent.accountId);
        request.assertCurrent();
        intent.receipt = receipt;
        intent.phase = 'receipt';
        setView({ intent, error: null, status: 'success' });
        return receipt;
      } catch (error) {
        if (current(intent)) {
          if (intent.dispatched) {
            intent.phase = 'uncertain';
            releaseTransition(intent, true);
            setView({ intent, error: new Error(UNKNOWN_OUTCOME), status: 'error' });
          } else {
            intent.dispatched = false;
            retire(intent);
            setView({ intent, error: isStepUpCancelled(error) ? null :
              new Error(toUserMessage(error, 'The workspace action could not be started. Try again.')),
              status: 'error' });
          }
        }
        throw error;
      }
    },
  });

  const admitted = () => lane.active && lane.enabled && lane.incarnation === renderedIncarnation && !!owner && epoch !== undefined &&
    !!organizationId && !!accountId && lane.accountId === accountId && owner.phase === 'admitted' && owner.scopeKey === scopeKey &&
    workspaceOwnerIsCurrent(owner, epoch);
  const prepare = (input: Input): PreparedWorkspaceMembershipAction | null => {
    if (!admitted() || !owner || !accountId || epoch === undefined || input.organizationId !== organizationId) return null;
    if (lane.intent) {
      if (lane.intent.phase !== 'confirming') return null;
      retire(lane.intent);
    }
    let intent: Intent;
    const request = createRequestAuthority(owner.session, () => current(intent), () => {
      if (intent.phase === 'writing') intent.dispatched = true;
    });
    intent = { owner, epoch, generation: lane.generation, input: { ...input }, accountId, request,
      phase: 'confirming', transitioned: false, dispatched: false, release: () => undefined };
    lane.intent = intent;
    const release = owner.session.subscribe?.(() => {
      if (lane.intent !== intent || current(intent)) return;
      retire(intent);
      if (lane.active) setView({ intent: null, error: null, status: 'idle' });
    }) ?? (() => undefined);
    if (!current(intent)) {
      release();
      retire(intent);
      return null;
    }
    intent.release = release;
    setView({ intent, error: null, status: 'idle' });
    return {
      isCurrent: () => current(intent) && intent.phase === 'confirming',
      cancel: () => {
        if (!current(intent) || intent.phase !== 'confirming') return;
        retire(intent);
        setView({ intent: null, error: null, status: 'idle' });
      },
      submit: () => {
        if (!current(intent) || intent.phase !== 'confirming') return;
        const expectedEpoch = intent.epoch;
        intent.phase = 'writing';
        // Admission publishes synchronously; the operation must already own its next epoch.
        intent.epoch = expectedEpoch + 1;
        try {
          intent.epoch = beginWorkspaceSwitch(owner, expectedEpoch);
          intent.transitioned = true;
          request.assertCurrent();
          setView({ intent, error: null, status: 'pending' });
          mutation.mutate(intent);
        } catch (error) {
          if (!intent.transitioned) intent.epoch = expectedEpoch;
          const showError = current(intent);
          retire(intent);
          if (showError) setView({ intent,
            error: new Error(toUserMessage(error, 'Workspaces are still resolving. Try again.')),
            status: 'error' });
        }
      },
    };
  };
  const displayed = view.intent;
  const ownsView = !!displayed && lane.active && lane.enabled && displayed.generation === lane.generation && lane.accountId === displayed.accountId &&
    workspaceOwnerIsCurrent(displayed.owner, displayed.epoch);
  const activeIntent = ownsView && lane.intent === displayed ? displayed : null;
  const continueAfterReceipt = async () => {
    const intent = activeIntent;
    if (!intent || !current(intent)) return;
    if (intent.phase === 'uncertain') {
      intent.request.assertCurrent();
      window.location.reload();
      return;
    }
    if (intent.phase !== 'receipt') return;
    intent.phase = 'finishing';
    setView({ intent, error: null, status: 'pending' });
    try {
      const response = await intent.request.fetch(MANAGED_CLOUD_WORKSPACES_PATH, { cache: 'no-store' });
      if (!response.ok) throw await readRefusal(response);
      const data = ManagedCloudAccountWorkspacesSchema.parse(await response.json());
      intent.request.assertCurrent();
      if (data.accountId && data.accountId !== intent.accountId) {
        lane.accountId = data.accountId;
        lane.incarnation += 1;
        lane.generation = {};
        retire(intent);
        setView({ intent: null, error: null, status: 'idle' });
        return;
      }
      if (data.accountId !== intent.accountId) {
        throw new Error('The workspace response did not match the confirmed account.');
      }
      await finalizeWorkspaceSwitch(queryClient, data.activeOrganizationId, intent.request,
        undefined, intent.accountId);
    } catch {
      if (!current(intent)) return;
      intent.phase = 'receipt';
      setView({ intent, error: new Error('The action completed, but the workspace could not be refreshed. Continue again to refresh without repeating the action.'), status: 'success' });
    }
  };
  return {
    ownerKey: owner && epoch !== undefined ? `${owner.incarnation}:${epoch}:${lane.incarnation}` : null,
    organizationId,
    workspaceName: workspace?.name ?? null,
    currentUserRole: workspace?.role ?? null,
    actorUserId: accountId,
    canMutate: admitted() && !lane.intent,
    prepare,
    mutate: (input) => prepare(input)?.submit(),
    phase: activeIntent?.phase ?? null,
    status: ownsView ? view.status : 'idle',
    isPending: ownsView && view.status === 'pending',
    data: activeIntent?.receipt,
    error: ownsView ? view.error : null,
    stepUpDialog: activeIntent ? dialog : null,
    continueAfterReceipt,
  };
}

export function useLeaveOrganization(active = true): LeaveOrganizationMutation {
  return useWorkspaceMembershipMutation({
    path: '/api/settings/organization/leave',
    method: 'DELETE',
    body: (input: LeaveOrganizationVariables) => input.successorUserId
      ? { successorUserId: input.successorUserId } : {},
    receipt: (body, input, accountId) => {
      const receipt = ManagedCloudWorkspaceLeaveReceiptSchema.parse(body);
      if (receipt.organizationId !== input.organizationId || receipt.userId !== accountId ||
          receipt.successorUserId !== (input.successorUserId ?? null)) {
        throw new Error('The leave receipt did not match the confirmed workspace action.');
      }
      return receipt;
    },
  }, active);
}

export function useTransferOrganizationOwnership(active = true): TransferOwnershipMutation {
  return useWorkspaceMembershipMutation({
    path: '/api/settings/organization/transfer-ownership',
    method: 'POST',
    body: (input: TransferOwnershipVariables) => input,
    receipt: (body, input) => {
      const receipt = ManagedCloudWorkspaceOwnershipTransferReceiptSchema.parse(body);
      if (receipt.organizationId !== input.organizationId || receipt.ownerUserId !== input.toUserId ||
          receipt.previousOwnerRole !== input.outgoingOwnerRole) {
        throw new Error('The transfer receipt did not match the confirmed workspace action.');
      }
      return receipt;
    },
  }, active);
}
