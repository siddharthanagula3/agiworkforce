import { modelRegistry } from '@agiworkforce/model-registry';
import {
  evaluateCapabilityAdmission,
  type CapabilityRequirement,
  type EffectiveCapabilityDocument,
} from '@agiworkforce/types';
import { effectiveModelPricing } from './pricing';
import type { TaskFamily } from './task-family';
import {
  resolveTaskFamilyOrdering,
  taskFamilyRoutingStageEnabled,
  type TaskFamilyPolicyEntry,
  type TaskFamilyStageDecision,
} from './task-family-routing';
import type { RoutingTaskType } from './types';

export type RoutingTrustMode = 'local' | 'on_device' | 'byok' | 'managed_cloud';
export type RoutingProfile = 'economy' | 'balanced' | 'premium';
export type IntrinsicCapability =
  | 'textInput'
  | 'imageInput'
  | 'audioInput'
  | 'videoInput'
  | 'textOutput'
  | 'imageOutput'
  | 'audioOutput'
  | 'videoOutput'
  | 'streaming'
  | 'structuredOutput'
  | 'functionCalling'
  | 'reasoning';

interface RegistryModel {
  identity: { key: string; provider: string; providerModelId: string };
  lifecycle: { availability: string; deprecated: boolean };
}

interface RegistryRoute {
  modelKey: string;
  provider: string;
  providerModelId: string;
  harnessId: string;
  trustModes: RoutingTrustMode[];
  availability: string;
  selectable: boolean;
}

interface RegistryHarnessFeature {
  implementation: 'implemented' | 'partial' | 'unwired' | 'unavailable' | 'unknown';
}

interface RegistryHarness {
  features: Record<string, RegistryHarnessFeature>;
}

interface RegistryRuntimeProfile {
  trustMode: RoutingTrustMode;
  status: 'implemented' | 'partial' | 'unwired' | 'unavailable';
  features: Record<string, RegistryHarnessFeature>;
  allowedHarnessIds: string[];
}

type RegistryCapabilities = Record<IntrinsicCapability, boolean>;

interface AutoTaskPolicy {
  requiredCapabilities: IntrinsicCapability[];
  requiredHarnessFeatures: string[];
  minimumContextTokens?: number;
  preferredSlots: Record<RoutingProfile, string[]>;
}

interface AutoPolicy {
  defaultAlias: string;
  fallbackSlot: string;
  profileOrder: RoutingProfile[];
  tierMaximumProfiles: Record<string, RoutingProfile>;
  tierAllowedSlots: Record<string, string[]>;
  providerPolicies: {
    usOnly: { allowedTiers: string[]; excludedProviders: string[] };
  };
  autoProfileByTask?: Partial<Record<RoutingTaskType, RoutingProfile>>;
  aliases: Record<string, { profile: RoutingProfile; computeProfile?: boolean }>;
  continuity: {
    preserveExplicitSelection: boolean;
    preferCurrentModelWhenEligible: boolean;
    preferCurrentRouteForCache: boolean;
    reevaluateOnTaskChange: boolean;
  };
  tasks: Record<RoutingTaskType, AutoTaskPolicy>;
  slots: Record<string, { modelKey: string }>;
  taskFamilies?: Record<string, TaskFamilyPolicyEntry>;
}

interface RoutingRegistry {
  models: Record<string, RegistryModel>;
  routes: Record<string, RegistryRoute>;
  harnesses: Record<string, RegistryHarness>;
  runtimeProfiles: Record<string, RegistryRuntimeProfile>;
  capabilities: Record<string, RegistryCapabilities>;
  limits: Record<string, { contextTokens?: number }>;
  policies: { auto: AutoPolicy };
}

const registry = modelRegistry as unknown as RoutingRegistry;

export interface AutoRoutingRequest {
  selection?: string | null;
  taskType: RoutingTaskType;
  subscriptionTier?: string | null;
  trustMode: RoutingTrustMode;
  currentModelKey?: string | null;
  previousTaskType?: RoutingTaskType | null;
  requiredCapabilities?: readonly IntrinsicCapability[];
  allowedHarnessIds?: readonly string[];
  runtimeProfileId?: string;
  usOnly?: boolean;
  capabilityDocument?: EffectiveCapabilityDocument | null;
  capabilityRequirements?: readonly CapabilityRequirement[];
  fallbackToAutoForCapabilityMismatch?: boolean;
  budgetRemainingCents?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  taskFamily?: TaskFamily | null;
  enableTaskFamilyStage?: boolean;
}

export interface AutoFallbackRoute {
  modelKey: string;
  provider: string;
  providerModelId: string;
  routeId: string;
  harnessId: string;
}

export interface SelectedAutoRoute {
  status: 'selected';
  requestedSelection: string;
  requestedProfile: RoutingProfile | null;
  effectiveProfile: RoutingProfile | null;
  taskType: RoutingTaskType;
  modelKey: string;
  provider: string;
  providerModelId: string;
  routeId: string;
  harnessId: string;
  fallbacks: AutoFallbackRoute[];
  reason:
    | 'explicit'
    | 'continuity'
    | 'preferred_slot'
    | 'fallback_slot'
    | 'capability_fallback'
    | 'task_family_pareto';
  taskFamilyDecision?: TaskFamilyStageDecision;
}

export interface UnavailableAutoRoute {
  status: 'unavailable';
  code:
    | 'unknown_selection'
    | 'unknown_task'
    | 'unknown_runtime_profile'
    | 'runtime_profile_unavailable'
    | 'runtime_profile_mismatch'
    | 'explicit_model_ineligible'
    | 'mandatory_capability_unavailable'
    | 'no_eligible_route';
  requestedSelection: string;
  requestedProfile: RoutingProfile | null;
  effectiveProfile: RoutingProfile | null;
  taskType: RoutingTaskType;
  reasons: string[];
}

export type AutoRouteDecision = SelectedAutoRoute | UnavailableAutoRoute;

interface EligibilityResult {
  routeId?: string;
  route?: RegistryRoute;
  reasons: string[];
}

function applyRuntimeProfile(
  request: AutoRoutingRequest,
  requestedSelection: string,
): { request: AutoRoutingRequest } | { unavailable: UnavailableAutoRoute } {
  if (!request.runtimeProfileId) return { request };

  const profile = registry.runtimeProfiles[request.runtimeProfileId];
  if (!profile) {
    return {
      unavailable: {
        status: 'unavailable',
        code: 'unknown_runtime_profile',
        requestedSelection,
        requestedProfile: null,
        effectiveProfile: null,
        taskType: request.taskType,
        reasons: [`unknown runtime profile: ${request.runtimeProfileId}`],
      },
    };
  }
  if (profile.status !== 'implemented') {
    return {
      unavailable: {
        status: 'unavailable',
        code: 'runtime_profile_unavailable',
        requestedSelection,
        requestedProfile: null,
        effectiveProfile: null,
        taskType: request.taskType,
        reasons: [`runtime profile ${request.runtimeProfileId} is ${profile.status}`],
      },
    };
  }
  if (profile.trustMode !== request.trustMode) {
    return {
      unavailable: {
        status: 'unavailable',
        code: 'runtime_profile_mismatch',
        requestedSelection,
        requestedProfile: null,
        effectiveProfile: null,
        taskType: request.taskType,
        reasons: [
          `runtime profile ${request.runtimeProfileId} requires ${profile.trustMode}, not ${request.trustMode}`,
        ],
      },
    };
  }

  const allowedHarnessIds = request.allowedHarnessIds
    ? profile.allowedHarnessIds.filter((harnessId) =>
        request.allowedHarnessIds?.includes(harnessId),
      )
    : profile.allowedHarnessIds;
  return { request: { ...request, allowedHarnessIds } };
}

function evaluateSessionCapabilityAdmission(
  request: AutoRoutingRequest,
  requestedSelection: string,
): UnavailableAutoRoute | null {
  const requirements = request.capabilityRequirements ?? [];
  if (requirements.length === 0) return null;

  const mandatory = requirements.filter((requirement) => requirement.strength === 'mandatory');
  const document = request.capabilityDocument;
  if (!document) {
    if (mandatory.length === 0) return null;
    return {
      status: 'unavailable',
      code: 'mandatory_capability_unavailable',
      requestedSelection,
      requestedProfile: null,
      effectiveProfile: null,
      taskType: request.taskType,
      reasons: mandatory.map(
        (requirement) =>
          `mandatory capability ${requirement.capabilityId} cannot be verified: no session capability document was provided`,
      ),
    };
  }

  const admission = evaluateCapabilityAdmission(document, requirements);
  if (admission.admitted) return null;

  return {
    status: 'unavailable',
    code: 'mandatory_capability_unavailable',
    requestedSelection,
    requestedProfile: null,
    effectiveProfile: null,
    taskType: request.taskType,
    reasons: admission.rejected.map(
      (rejection) =>
        `mandatory capability ${rejection.capabilityId} is unavailable (denied by ${rejection.deniedByLayers.join(
          ', ',
        )})${rejection.reason ? `: ${rejection.reason}` : ''}`,
    ),
  };
}

function normalizeTier(
  tier: string | null | undefined,
): 'free' | 'pro' | 'max' | 'enterprise' | 'byok' {
  switch ((tier ?? '').toLowerCase()) {
    case 'pro':
    case 'team':
      return 'pro';
    case 'basic':
    case 'hobby':
      return 'free';
    case 'max':
    case 'max_15x':
    case 'max-15x':
    case 'max15x':
    case 'max+':
    case 'max_plus':
    case 'max-plus':
      return 'max';
    case 'enterprise':
      return 'enterprise';
    case 'byok':
      return 'byok';
    default:
      return 'free';
  }
}

const tierGatedSlotsByModelKey = ((): Map<string, string[]> => {
  const policy = registry.policies.auto;
  const tierGatedSlots = new Set(Object.values(policy.tierAllowedSlots).flat());
  const slotsByModelKey = new Map<string, string[]>();
  for (const [slotId, slot] of Object.entries(policy.slots)) {
    if (!tierGatedSlots.has(slotId)) continue;
    slotsByModelKey.set(slot.modelKey, [...(slotsByModelKey.get(slot.modelKey) ?? []), slotId]);
  }
  return slotsByModelKey;
})();

function tierAdmissionRejection(modelKey: string, tier: string): string | null {
  const gatedSlots = tierGatedSlotsByModelKey.get(modelKey);
  if (!gatedSlots) return null;
  const policy = registry.policies.auto;
  const allowedSlots = policy.tierAllowedSlots[tier] ?? [policy.fallbackSlot];
  if (gatedSlots.some((slotId) => allowedSlots.includes(slotId))) return null;
  return `routing slot ${gatedSlots.join(', ')} for model ${modelKey} is not allowed for tier ${tier}`;
}

function clampProfile(
  requested: RoutingProfile,
  maximum: RoutingProfile,
  order: readonly RoutingProfile[],
): RoutingProfile {
  const requestedIndex = order.indexOf(requested);
  const maximumIndex = order.indexOf(maximum);
  return order[Math.min(requestedIndex, maximumIndex)] ?? maximum;
}

function evaluateEligibility(
  modelKey: string,
  task: AutoTaskPolicy,
  request: AutoRoutingRequest,
): EligibilityResult {
  const reasons: string[] = [];
  const model = registry.models[modelKey];
  if (!model) return { reasons: [`unknown model: ${modelKey}`] };

  if (model.lifecycle.availability !== 'live') {
    reasons.push(`model ${modelKey} availability is ${model.lifecycle.availability}`);
  }
  if (model.lifecycle.deprecated) reasons.push(`model ${modelKey} is deprecated`);
  const tier = normalizeTier(request.subscriptionTier);
  const tierRejection = tierAdmissionRejection(modelKey, tier);
  if (tierRejection) reasons.push(tierRejection);
  const usOnlyPolicy = registry.policies.auto.providerPolicies.usOnly;
  if (
    request.usOnly &&
    usOnlyPolicy.allowedTiers.includes(tier) &&
    usOnlyPolicy.excludedProviders.includes(model.identity.provider)
  ) {
    reasons.push(`provider ${model.identity.provider} is excluded by the US-only policy`);
  }

  const routeEntry = Object.entries(registry.routes).find(
    ([, route]) => route.modelKey === modelKey && route.trustModes.includes(request.trustMode),
  );
  if (!routeEntry) {
    reasons.push(`model ${modelKey} has no ${request.trustMode} route`);
    return { reasons };
  }
  const [routeId, route] = routeEntry;
  if (!route.selectable || route.availability !== 'live') {
    reasons.push(`route ${routeId} is not selectable`);
  }
  if (request.allowedHarnessIds && !request.allowedHarnessIds.includes(route.harnessId)) {
    reasons.push(`harness ${route.harnessId} is not executable on the calling runtime`);
  }

  const capabilities = registry.capabilities[modelKey];
  const requiredCapabilities = [
    ...task.requiredCapabilities,
    ...(request.requiredCapabilities ?? []),
  ];
  for (const capability of new Set(requiredCapabilities)) {
    if (capabilities?.[capability] !== true) {
      reasons.push(`model ${modelKey} lacks intrinsic capability ${capability}`);
    }
  }

  if (
    task.minimumContextTokens !== undefined &&
    (registry.limits[modelKey]?.contextTokens ?? 0) < task.minimumContextTokens
  ) {
    reasons.push(`model ${modelKey} does not meet ${task.minimumContextTokens} context tokens`);
  }

  const harness = registry.harnesses[route.harnessId];
  for (const feature of task.requiredHarnessFeatures) {
    const runtimeProfile = request.runtimeProfileId
      ? registry.runtimeProfiles[request.runtimeProfileId]
      : undefined;
    const implementation = runtimeProfile
      ? runtimeProfile.features[feature]?.implementation
      : harness?.features[feature]?.implementation;
    if (implementation !== 'implemented') {
      reasons.push(
        `${runtimeProfile ? `runtime ${request.runtimeProfileId}` : `harness ${route.harnessId}`} feature ${feature} is ${implementation ?? 'undeclared'}`,
      );
    }
  }

  return reasons.length === 0 ? { routeId, route, reasons } : { reasons };
}

function selectedDecision(
  request: AutoRoutingRequest,
  requestedSelection: string,
  requestedProfile: RoutingProfile | null,
  effectiveProfile: RoutingProfile | null,
  modelKey: string,
  eligibility: EligibilityResult,
  reason: SelectedAutoRoute['reason'],
  fallbacks: AutoFallbackRoute[] = [],
  taskFamilyDecision?: TaskFamilyStageDecision,
): SelectedAutoRoute {
  const route = eligibility.route;
  if (!route || !eligibility.routeId) {
    throw new Error('selectedDecision requires an eligible route');
  }
  return {
    status: 'selected',
    requestedSelection,
    requestedProfile,
    effectiveProfile,
    taskType: request.taskType,
    modelKey,
    provider: route.provider,
    providerModelId: route.providerModelId,
    routeId: eligibility.routeId,
    harnessId: route.harnessId,
    fallbacks,
    reason,
    ...(taskFamilyDecision ? { taskFamilyDecision } : {}),
  };
}

function buildProviderFallbacks(
  request: AutoRoutingRequest,
  task: AutoTaskPolicy,
  policy: AutoPolicy,
  allowedSlots: ReadonlySet<string>,
  preferredSlots: readonly string[],
  selectedModelKey: string,
  selectedProvider: string,
): AutoFallbackRoute[] {
  const candidateSlots = preferredSlots.includes(policy.fallbackSlot)
    ? preferredSlots
    : [...preferredSlots, policy.fallbackSlot];
  const seenModels = new Set([selectedModelKey]);
  const seenProviders = new Set([selectedProvider]);
  const fallbacks: AutoFallbackRoute[] = [];

  for (const slotId of candidateSlots) {
    if (!allowedSlots.has(slotId)) continue;
    const modelKey = policy.slots[slotId]?.modelKey;
    if (!modelKey || seenModels.has(modelKey)) continue;
    seenModels.add(modelKey);

    const eligibility = evaluateEligibility(modelKey, task, request);
    const route = eligibility.route;
    if (!route || !eligibility.routeId || seenProviders.has(route.provider)) continue;

    seenProviders.add(route.provider);
    fallbacks.push({
      modelKey,
      provider: route.provider,
      providerModelId: route.providerModelId,
      routeId: eligibility.routeId,
      harnessId: route.harnessId,
    });
  }

  return fallbacks;
}

const DEFAULT_AFFORDABILITY_OUTPUT_TOKENS = 1000;

function estimatedRequestCents(modelKey: string, request: AutoRoutingRequest): number {
  const inputTokens = request.estimatedInputTokens ?? 0;
  const outputTokens = request.estimatedOutputTokens ?? DEFAULT_AFFORDABILITY_OUTPUT_TOKENS;
  const pricing = effectiveModelPricing(modelKey, inputTokens);
  const usd = pricing
    ? (inputTokens * pricing.inputCost + outputTokens * pricing.outputCost) / 1_000_000
    : 0;
  return usd * 100;
}

function isAffordable(modelKey: string, request: AutoRoutingRequest): boolean {
  if (request.budgetRemainingCents === undefined) return true;
  return estimatedRequestCents(modelKey, request) <= request.budgetRemainingCents;
}

export function resolveAutoRoute(request: AutoRoutingRequest): AutoRouteDecision {
  const policy = registry.policies.auto;
  const requestedSelection = (request.selection ?? policy.defaultAlias).toLowerCase();
  const capabilityAdmission = evaluateSessionCapabilityAdmission(request, requestedSelection);
  if (capabilityAdmission) return capabilityAdmission;
  const runtimeAdmission = applyRuntimeProfile(request, requestedSelection);
  if ('unavailable' in runtimeAdmission) return runtimeAdmission.unavailable;
  request = runtimeAdmission.request;
  const task = policy.tasks[request.taskType];
  if (!task) {
    return {
      status: 'unavailable',
      code: 'unknown_task',
      requestedSelection,
      requestedProfile: null,
      effectiveProfile: null,
      taskType: request.taskType,
      reasons: [`unknown routing task: ${request.taskType}`],
    };
  }

  const alias = policy.aliases[requestedSelection];
  if (!alias) {
    if (!registry.models[requestedSelection]) {
      return {
        status: 'unavailable',
        code: 'unknown_selection',
        requestedSelection,
        requestedProfile: null,
        effectiveProfile: null,
        taskType: request.taskType,
        reasons: [`unknown model selection: ${requestedSelection}`],
      };
    }
    const eligibility = evaluateEligibility(requestedSelection, task, request);
    if (eligibility.route) {
      return selectedDecision(
        request,
        requestedSelection,
        null,
        null,
        requestedSelection,
        eligibility,
        'explicit',
      );
    }

    const capabilityMismatch = eligibility.reasons.some((reason) =>
      reason.includes('lacks intrinsic capability'),
    );
    if (request.fallbackToAutoForCapabilityMismatch && capabilityMismatch) {
      const fallback = resolveAutoRoute({
        ...request,
        selection: policy.defaultAlias,
        currentModelKey: null,
        fallbackToAutoForCapabilityMismatch: false,
      });
      if (fallback.status === 'selected') {
        return {
          ...fallback,
          requestedSelection,
          requestedProfile: null,
          reason: 'capability_fallback',
        };
      }
    }

    return {
      status: 'unavailable',
      code: 'explicit_model_ineligible',
      requestedSelection,
      requestedProfile: null,
      effectiveProfile: null,
      taskType: request.taskType,
      reasons: eligibility.reasons,
    };
  }

  const tier = normalizeTier(request.subscriptionTier);
  const maximumProfile = policy.tierMaximumProfiles[tier] ?? 'economy';
  const requestedProfile: RoutingProfile = alias.computeProfile
    ? (policy.autoProfileByTask?.[request.taskType] ?? alias.profile)
    : alias.profile;
  const effectiveProfile = clampProfile(requestedProfile, maximumProfile, policy.profileOrder);
  const allowedSlots = new Set(policy.tierAllowedSlots[tier] ?? [policy.fallbackSlot]);
  const preferredSlots = task.preferredSlots[effectiveProfile] ?? [];

  const taskFamilyDecision = resolveTaskFamilyOrdering({
    enabled: request.enableTaskFamilyStage ?? taskFamilyRoutingStageEnabled(),
    family: request.taskFamily ?? null,
    taskType: request.taskType,
    preferredSlots,
    preferredSlotsByProfile: task.preferredSlots,
    profileOrder: policy.profileOrder,
    slots: policy.slots,
    estimateCents: (modelKey) => estimatedRequestCents(modelKey, request),
  });
  const orderedSlots = taskFamilyDecision.ordering?.slots ?? preferredSlots;
  const paretoHead = new Set(taskFamilyDecision.ordering?.aboveFloor ?? []);

  if (
    request.currentModelKey &&
    policy.continuity.preferCurrentModelWhenEligible &&
    (!policy.continuity.reevaluateOnTaskChange ||
      request.previousTaskType === request.taskType ||
      (policy.continuity.preferCurrentRouteForCache &&
        preferredSlots.some(
          (slotId) =>
            allowedSlots.has(slotId) && policy.slots[slotId]?.modelKey === request.currentModelKey,
        )))
  ) {
    const eligibility = evaluateEligibility(request.currentModelKey, task, request);
    if (eligibility.route && isAffordable(request.currentModelKey, request)) {
      const fallbacks = buildProviderFallbacks(
        request,
        task,
        policy,
        allowedSlots,
        orderedSlots,
        request.currentModelKey,
        eligibility.route.provider,
      );
      return selectedDecision(
        request,
        requestedSelection,
        requestedProfile,
        effectiveProfile,
        request.currentModelKey,
        eligibility,
        'continuity',
        fallbacks,
        taskFamilyDecision,
      );
    }
  }

  const reasons: string[] = [];
  for (const slotId of orderedSlots) {
    if (!allowedSlots.has(slotId)) {
      reasons.push(`routing slot ${slotId} is not allowed for tier ${tier}`);
      continue;
    }
    const modelKey = policy.slots[slotId]?.modelKey;
    if (!modelKey) {
      reasons.push(`routing slot ${slotId} is missing`);
      continue;
    }
    const eligibility = evaluateEligibility(modelKey, task, request);
    if (eligibility.route) {
      if (slotId !== policy.fallbackSlot && !isAffordable(modelKey, request)) {
        reasons.push(`model ${modelKey} exceeds the remaining usage budget`);
        continue;
      }
      const fallbacks = buildProviderFallbacks(
        request,
        task,
        policy,
        allowedSlots,
        orderedSlots,
        modelKey,
        eligibility.route.provider,
      );
      return selectedDecision(
        request,
        requestedSelection,
        requestedProfile,
        effectiveProfile,
        modelKey,
        eligibility,
        paretoHead.has(slotId) ? 'task_family_pareto' : 'preferred_slot',
        fallbacks,
        taskFamilyDecision,
      );
    }
    reasons.push(...eligibility.reasons);
  }

  if (!preferredSlots.includes(policy.fallbackSlot) && allowedSlots.has(policy.fallbackSlot)) {
    const fallbackModelKey = policy.slots[policy.fallbackSlot]?.modelKey;
    if (fallbackModelKey) {
      const eligibility = evaluateEligibility(fallbackModelKey, task, request);
      if (eligibility.route) {
        const fallbacks = buildProviderFallbacks(
          request,
          task,
          policy,
          allowedSlots,
          orderedSlots,
          fallbackModelKey,
          eligibility.route.provider,
        );
        return selectedDecision(
          request,
          requestedSelection,
          requestedProfile,
          effectiveProfile,
          fallbackModelKey,
          eligibility,
          'fallback_slot',
          fallbacks,
          taskFamilyDecision,
        );
      }
      reasons.push(...eligibility.reasons);
    }
  }

  return {
    status: 'unavailable',
    code: 'no_eligible_route',
    requestedSelection,
    requestedProfile,
    effectiveProfile,
    taskType: request.taskType,
    reasons: [...new Set(reasons)],
  };
}
