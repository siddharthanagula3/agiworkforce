import 'server-only';

import {
  ALL_PLATFORM_CAPABILITIES,
  buildEffectiveCapabilityDocument,
  computeCapabilityDocumentVersion,
  getPlatformCapabilities,
  getTierPolicy,
  isCapabilityDocumentStale,
  modelsCatalog,
  type CapabilityDocumentRef,
  type CapabilityLayerGrant,
  type CapabilityLimit,
  type EffectiveCapabilityDocument,
  type ModelCapabilities,
  type PlatformCapability,
  type SyncedAppSurface,
} from '@agiworkforce/types';
import type { EffectiveCapabilityDocumentWire } from '@agiworkforce/cloud-contracts';
import {
  getPlanSessionUsageBudgetCents,
  getPlanUsageBudgetCents,
  getPlanWeeklyUsageBudgetCents,
  isPlanUsageUncapped,
} from '@/lib/server/managed-usage-policy';

type CatalogModelCapabilityKey = Extract<
  keyof ModelCapabilities,
  'search' | 'research' | 'codeExecution'
>;

function catalogHasModelWithCapability(key: CatalogModelCapabilityKey): boolean {
  return Object.values(modelsCatalog.models).some((model) => model.capabilities[key] === true);
}

function allCapabilities(): Set<PlatformCapability> {
  return new Set<PlatformCapability>(ALL_PLATFORM_CAPABILITIES);
}

function buildModelLayerGrant(cloudExecutionDeploymentEnabled: boolean): CapabilityLayerGrant {
  const granted = allCapabilities();
  if (!(cloudExecutionDeploymentEnabled && catalogHasModelWithCapability('codeExecution'))) {
    granted.delete('canUseCloudExecution');
  }
  if (!catalogHasModelWithCapability('search')) granted.delete('canUseWebSearch');
  if (!catalogHasModelWithCapability('research')) granted.delete('canUseDeepResearch');
  return { layer: 'model', sourceId: `models.json@${modelsCatalog.version}`, granted };
}

function buildTierLayerGrant(tier: string | null | undefined): CapabilityLayerGrant {
  const policy = getTierPolicy(tier);
  const granted = allCapabilities();
  if (!policy.allowSearch) granted.delete('canUseWebSearch');
  if (!policy.allowDeepResearch) granted.delete('canUseDeepResearch');
  if (!policy.allowVoice) granted.delete('canUseVoice');
  if (!policy.allowMCP) granted.delete('canUseConnectors');
  return { layer: 'tier', sourceId: `tier:${policy.tier}`, granted };
}

function buildSurfaceLayerGrant(surface: SyncedAppSurface): CapabilityLayerGrant {
  const row = getPlatformCapabilities(surface);
  const granted = new Set<PlatformCapability>(
    ALL_PLATFORM_CAPABILITIES.filter((capabilityId) => row[capabilityId]),
  );
  return { layer: 'surface', sourceId: `surface:${surface}`, granted };
}

function buildSettingsLayerGrant(): CapabilityLayerGrant {
  return { layer: 'settings', sourceId: 'settings:none-configured', granted: allCapabilities() };
}

export interface CapabilityLimitResets {
  billingPeriodEndsAt: string | null;
  rollingFiveHourResetsAt: string | null;
  rollingWeeklyResetsAt: string | null;
}

export const NO_CAPABILITY_LIMIT_RESETS: CapabilityLimitResets = {
  billingPeriodEndsAt: null,
  rollingFiveHourResetsAt: null,
  rollingWeeklyResetsAt: null,
};

function buildLimits(
  tier: string | null | undefined,
  resets: CapabilityLimitResets,
): CapabilityLimit[] {
  const policy = getTierPolicy(tier);
  const tierSource = `tier:${policy.tier}`;
  const usageSource = `managed-usage-caps:${policy.tier}`;
  const uncapped = isPlanUsageUncapped(policy.tier);
  const limits: CapabilityLimit[] = [
    {
      id: 'managed_usage_billing_period_cents',
      capabilityId: 'canUseCloudModels',
      limit: uncapped ? null : getPlanUsageBudgetCents(policy.tier),
      unit: 'usage_cents',
      window: 'billing_period',
      resetsAt: resets.billingPeriodEndsAt,
      policySource: usageSource,
    },
    {
      id: 'managed_usage_rolling_five_hour_cents',
      capabilityId: 'canUseCloudModels',
      limit: uncapped ? null : getPlanSessionUsageBudgetCents(policy.tier),
      unit: 'usage_cents',
      window: 'rolling_five_hour',
      resetsAt: resets.rollingFiveHourResetsAt,
      policySource: usageSource,
    },
    {
      id: 'managed_usage_rolling_weekly_cents',
      capabilityId: 'canUseCloudModels',
      limit: uncapped ? null : getPlanWeeklyUsageBudgetCents(policy.tier),
      unit: 'usage_cents',
      window: 'rolling_weekly',
      resetsAt: resets.rollingWeeklyResetsAt,
      policySource: usageSource,
    },
  ];

  if (policy.messagesPerDayCap != null) {
    limits.push({
      id: 'messages_per_day',
      capabilityId: 'canChat',
      limit: policy.messagesPerDayCap,
      unit: 'messages',
      window: 'day',
      resetsAt: null,
      policySource: tierSource,
    });
  }
  if (policy.tokenCapPerMonth != null) {
    limits.push({
      id: 'tokens_per_month',
      capabilityId: 'canUseCloudModels',
      limit: policy.tokenCapPerMonth,
      unit: 'tokens',
      window: 'month',
      resetsAt: resets.billingPeriodEndsAt,
      policySource: tierSource,
    });
  }
  if (policy.flagshipDailyTokenCap != null) {
    limits.push({
      id: 'flagship_tokens_per_day',
      capabilityId: 'canUseCloudModels',
      limit: policy.flagshipDailyTokenCap,
      unit: 'tokens',
      window: 'day',
      resetsAt: null,
      policySource: tierSource,
    });
  }
  if (policy.imageQuotaPerMonth != null) {
    limits.push({
      id: 'images_per_month',
      capabilityId: 'canUseImages',
      limit: policy.imageQuotaPerMonth,
      unit: 'images',
      window: 'month',
      resetsAt: resets.billingPeriodEndsAt,
      policySource: tierSource,
    });
  }
  if (policy.videoSecondsPerMonth != null) {
    limits.push({
      id: 'video_seconds_per_month',
      capabilityId: null,
      limit: policy.videoSecondsPerMonth,
      unit: 'video_seconds',
      window: 'month',
      resetsAt: resets.billingPeriodEndsAt,
      policySource: tierSource,
    });
  }
  if (policy.voiceMinutesPerMonth != null) {
    limits.push({
      id: 'voice_minutes_per_month',
      capabilityId: 'canUseVoice',
      limit: policy.voiceMinutesPerMonth,
      unit: 'voice_minutes',
      window: 'month',
      resetsAt: resets.billingPeriodEndsAt,
      policySource: tierSource,
    });
  }

  return limits;
}

export interface BuildMeCapabilityHandshakeInput {
  userId: string;
  tier: string | null | undefined;
  surface: SyncedAppSurface;
  cloudExecutionDeploymentEnabled: boolean;
  resets?: CapabilityLimitResets;
  computedAt?: string;
}

export const ME_CAPABILITY_HANDSHAKE_VERSION = 'me-handshake-v1';

export function buildMeCapabilityHandshake(
  input: BuildMeCapabilityHandshakeInput,
): EffectiveCapabilityDocument {
  const layers = {
    model: buildModelLayerGrant(input.cloudExecutionDeploymentEnabled),
    tier: buildTierLayerGrant(input.tier),
    surface: buildSurfaceLayerGrant(input.surface),
    settings: buildSettingsLayerGrant(),
  };
  const limits = buildLimits(input.tier, input.resets ?? NO_CAPABILITY_LIMIT_RESETS);
  return buildEffectiveCapabilityDocument({
    sessionId: input.userId,
    version: computeCapabilityDocumentVersion({
      schemaVersion: ME_CAPABILITY_HANDSHAKE_VERSION,
      layers,
      limits,
    }),
    computedAt: input.computedAt,
    layers,
    limits,
  });
}

export function isMeCapabilityHandshakeStale(
  ref: Pick<CapabilityDocumentRef, 'version'>,
  current: Pick<EffectiveCapabilityDocument, 'version'>,
): boolean {
  return isCapabilityDocumentStale(ref, current.version);
}

export function toWireCapabilityHandshake(
  document: EffectiveCapabilityDocument,
): EffectiveCapabilityDocumentWire {
  return {
    ...document,
    limits: document.limits.map((limit) => ({ ...limit })),
    granted: [...document.granted],
    deniedBy: Object.fromEntries(
      Object.entries(document.deniedBy).map(([capabilityId, layers]) => [
        capabilityId,
        [...(layers ?? [])],
      ]),
    ),
  };
}
