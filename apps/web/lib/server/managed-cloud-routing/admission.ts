import 'server-only';

import { modelRegistry, providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import {
  resolveAutoRoute,
  type AutoRoutingRequest,
  type IntrinsicCapability,
  type RoutingTaskType,
  type SelectedAutoRoute,
  type UnavailableAutoRoute,
} from '@agiworkforce/routing';
import { logger } from '@/lib/logger';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';
import { dispatchProviderForSelectedRoute } from '@/lib/services/aggregator-routing';
import { evaluateModelAccess, type ModelAccessPolicy } from '@/lib/services/model-policy-evaluator';
import {
  productionPolicySource,
  type ManagedCloudAccount,
  type ManagedCloudPolicySource,
} from './policy-source';
import { buildManagedCloudRoutingRequest, resolveResidencyRegion } from './routing-request';

export type { ManagedCloudAccount, ManagedCloudPolicySource } from './policy-source';

const UTILITY_SELECTION = 'auto';
const UTILITY_TIER = 'free';
const UTILITY_TASK_TYPE: RoutingTaskType = 'simple_chat';

/**
 * The resolver honours `usOnly` only on the plans that offer it, judged by the
 * request's tier. A utility call routes on the economy tier rather than the
 * user's plan, so a saved US-only preference is applied to it directly.
 */
const US_ONLY_EXCLUDED_PROVIDERS: ReadonlySet<string> = new Set(
  modelRegistry.policies.auto.providerPolicies.usOnly.excludedProviders,
);

/**
 * Every per-account rule a call is admitted under, as read once for it. A turn
 * that has already read these hands them in rather than reading them twice.
 */
export interface ManagedCloudPolicySnapshot {
  noTrainingOnly: boolean;
  zeroDataRetentionOnly: boolean;
  organizationPolicy: ModelAccessPolicy | null;
  residencyRegion: string | null;
  usOnly: boolean;
}

export interface ManagedCloudNeed {
  selection?: string;
  taskType: RoutingTaskType;
  requiredCapabilities?: readonly IntrinsicCapability[];
  /** The selection is a pinned model: refuse rather than fall back to Auto. */
  exactSelection?: boolean;
  /** The content itself must stay off providers that may train (Google user data, health). */
  keepOutOfTraining?: boolean;
  requestId?: string;
  /** The model and task the conversation last served, for Auto's continuity. */
  continuity?: { currentModelKey?: string | null; previousTaskType?: RoutingTaskType | null };
  /** The rules the enclosing turn already read, so this call reads none of its own. */
  turnPolicy?: ManagedCloudPolicySnapshot;
}

/**
 * - `utility`: a short helper call on the user's content (title, follow-ups,
 *   memory). Always the economy slot, never the user's paid model access; it
 *   may still require a capability such as tool calling.
 * - `background`: work on the user's content on their own plan.
 * - `unattended`: an agent run nobody is watching (scheduled, Slack, mobile).
 * - `preview`: what a chat turn on this account would route to, without a call.
 * - `platform`: an answer the platform pays for, possibly to a visitor with
 *   no account; the per-account rules apply only when one is signed in.
 */
export type ManagedCloudCall =
  | {
      kind: 'utility';
      account: ManagedCloudAccount;
      need?: Pick<ManagedCloudNeed, 'keepOutOfTraining' | 'turnPolicy' | 'requiredCapabilities'>;
    }
  | {
      kind: 'background' | 'unattended' | 'preview';
      account: ManagedCloudAccount;
      planTier: string;
      need: ManagedCloudNeed;
    }
  | {
      kind: 'platform';
      account: ManagedCloudAccount | null;
      planTier: string;
      need: ManagedCloudNeed;
    };

export type ManagedCloudCallKind = ManagedCloudCall['kind'];

export type ManagedCloudRefusalReason =
  /** A workspace policy, retention requirement or region could not be read. */
  | 'policy_unreadable'
  /** The content must stay out of training and no route that keeps it there can serve. */
  | 'no_training_route'
  /** No route the account's rules admit can serve this call. */
  | 'no_route';

export interface ManagedCloudAdmitted {
  status: 'admitted';
  route: SelectedAutoRoute;
  dispatchProvider: string;
  policy: ManagedCloudPolicySnapshot;
  request: AutoRoutingRequest;
}

export interface ManagedCloudRefused {
  status: 'refused';
  reason: ManagedCloudRefusalReason;
  code: UnavailableAutoRoute['code'] | null;
}

export type ManagedCloudAdmission = ManagedCloudAdmitted | ManagedCloudRefused;

const OPEN_POLICY: ManagedCloudPolicySnapshot = {
  noTrainingOnly: false,
  zeroDataRetentionOnly: false,
  organizationPolicy: null,
  residencyRegion: null,
  usOnly: false,
};

async function readPolicy(
  account: ManagedCloudAccount,
  source: ManagedCloudPolicySource,
): Promise<ManagedCloudPolicySnapshot | null> {
  try {
    const [
      trainingOptOut,
      conversationKeepsOutOfTraining,
      zeroDataRetentionOnly,
      organizationPolicy,
      workspaceRegion,
      usOnly,
    ] = await Promise.all([
      source.trainingOptOut(account),
      source.conversationKeepsOutOfTraining(account),
      source.zeroDataRetentionRequired(account),
      source.workspaceModelPolicy(account),
      source.workspaceRegion(account),
      source.usOnly(account),
    ]);
    return {
      noTrainingOnly: trainingOptOut || conversationKeepsOutOfTraining,
      zeroDataRetentionOnly,
      organizationPolicy,
      residencyRegion: resolveResidencyRegion(workspaceRegion, source.deploymentRegion()),
      usOnly,
    };
  } catch (error) {
    logger.error(
      { error, userId: account.userId, organizationId: account.organizationId },
      '[managed-cloud-routing] an account rule could not be read; the call is refused',
    );
    return null;
  }
}

function callShape(call: ManagedCloudCall): {
  account: ManagedCloudAccount | null;
  selection: string;
  tier: string;
  need: Partial<ManagedCloudNeed> & { taskType: RoutingTaskType };
} {
  if (call.kind === 'utility') {
    return {
      account: call.account,
      selection: UTILITY_SELECTION,
      tier: UTILITY_TIER,
      need: { ...call.need, taskType: UTILITY_TASK_TYPE },
    };
  }
  return {
    account: call.account,
    selection: call.need.selection ?? UTILITY_SELECTION,
    tier: call.planTier,
    need: call.need,
  };
}

function keepsOutOfTraining(route: SelectedAutoRoute, dispatchProvider: string): boolean {
  return (
    providerKeepsInputsOutOfTraining(route.provider) &&
    providerKeepsInputsOutOfTraining(dispatchProvider) &&
    modelKeepsInputsOutOfTraining(route.modelKey)
  );
}

function refused(
  call: ManagedCloudCall,
  reason: ManagedCloudRefusalReason,
  code: UnavailableAutoRoute['code'] | null = null,
): ManagedCloudRefused {
  logger.warn(
    { kind: call.kind, reason, code, userId: call.account?.userId ?? null },
    '[managed-cloud-routing] call refused',
  );
  return { status: 'refused', reason, code };
}

export interface ManagedCloudRoutingRequest {
  status: 'ready';
  request: AutoRoutingRequest;
  policy: ManagedCloudPolicySnapshot;
  /** The same request with the training rule lifted, to tell that rule apart in a refusal. */
  withoutTrainingRule: () => AutoRoutingRequest;
}

export async function managedCloudRoutingRequest(
  call: ManagedCloudCall,
  source: ManagedCloudPolicySource = productionPolicySource,
): Promise<ManagedCloudRoutingRequest | ManagedCloudRefused> {
  const { account, selection, tier, need } = callShape(call);
  const read = need.turnPolicy ?? (account ? await readPolicy(account, source) : OPEN_POLICY);
  if (!read) return refused(call, 'policy_unreadable');
  const policy: ManagedCloudPolicySnapshot = {
    ...read,
    noTrainingOnly: read.noTrainingOnly || need.keepOutOfTraining === true,
  };

  const managedProviders = source.availableProviderIds();
  const noTrainingProviders = new Set(
    [...managedProviders].filter(providerKeepsInputsOutOfTraining),
  );
  if (policy.noTrainingOnly && noTrainingProviders.size === 0) {
    return refused(call, 'no_training_route');
  }

  const requestFor = (noTrainingOnly: boolean): AutoRoutingRequest => ({
    ...buildManagedCloudRoutingRequest({
      selection,
      subscriptionTier: tier,
      taskType: need.taskType,
      routeHealth: need.continuity,
      availableProviderIds: noTrainingOnly ? noTrainingProviders : managedProviders,
      zeroDataRetentionOnly: policy.zeroDataRetentionOnly,
      zeroDataRetentionProviders: source.zeroDataRetentionProviders(),
      organizationPolicy: policy.organizationPolicy,
      usOnly: policy.usOnly,
      homeRegion: source.deploymentRegion(),
      residencyRegion: policy.residencyRegion,
      noTrainingOnly,
    }),
    ...(call.kind === 'utility' && policy.usOnly
      ? { excludedProviders: US_ONLY_EXCLUDED_PROVIDERS }
      : {}),
    ...(need.requiredCapabilities ? { requiredCapabilities: need.requiredCapabilities } : {}),
    ...(need.exactSelection ? { fallbackToAutoForCapabilityMismatch: false } : {}),
    ...(need.requestId ? { requestId: need.requestId } : {}),
  });

  return {
    status: 'ready',
    request: requestFor(policy.noTrainingOnly),
    policy,
    withoutTrainingRule: () => requestFor(false),
  };
}

export async function admitManagedCloudRoute(
  call: ManagedCloudCall,
  source: ManagedCloudPolicySource = productionPolicySource,
): Promise<ManagedCloudAdmission> {
  const built = await managedCloudRoutingRequest(call, source);
  if (built.status === 'refused') return built;
  const { request, policy } = built;

  const decision = resolveAutoRoute(request);
  if (decision.status === 'unavailable') {
    const trainingIsTheBlocker =
      policy.noTrainingOnly && resolveAutoRoute(built.withoutTrainingRule()).status === 'selected';
    return refused(call, trainingIsTheBlocker ? 'no_training_route' : 'no_route', decision.code);
  }

  const dispatchProvider = dispatchProviderForSelectedRoute(decision);
  if (policy.noTrainingOnly && !keepsOutOfTraining(decision, dispatchProvider)) {
    return refused(call, 'no_training_route');
  }
  if (
    policy.organizationPolicy &&
    !evaluateModelAccess(policy.organizationPolicy, {
      provider: decision.provider,
      modelId: decision.modelKey,
    }).allowed
  ) {
    return refused(call, 'no_route');
  }
  return { status: 'admitted', route: decision, dispatchProvider, policy, request };
}
