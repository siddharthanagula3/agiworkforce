import { MAX_ATTACHMENT_BYTES } from './chat';
import { MICROUSD_PER_USD } from './credits';
import { FEATURE_RATE_CARD } from './rate-card';

export type BillingPlanTier =
  | 'local-only'
  | 'byok'
  | 'free'
  | 'basic'
  | 'pro'
  | 'max'
  | 'max_15x'
  | 'team'
  | 'team_premium'
  | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';

export const BILLING_INTERVALS = [
  'monthly',
  'yearly',
] as const satisfies readonly BillingInterval[];

export const SELF_SERVE_PAID_PLAN_TIERS = [
  'basic',
  'pro',
  'max',
  'max_15x',
  'team',
] as const satisfies readonly BillingPlanTier[];
export type SelfServePaidPlanTier = (typeof SELF_SERVE_PAID_PLAN_TIERS)[number];

export const SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER = [
  'basic',
  'pro',
  'max',
  'max_15x',
] as const satisfies readonly SelfServePaidPlanTier[];
export type SelfServeIndividualPlanTier = (typeof SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER)[number];

export function isSelfServePaidPlanTier(
  value: string | null | undefined,
): value is SelfServePaidPlanTier {
  return (
    typeof value === 'string' && (SELF_SERVE_PAID_PLAN_TIERS as readonly string[]).includes(value)
  );
}

export function isSelfServeIndividualPlanTier(
  value: string | null | undefined,
): value is SelfServeIndividualPlanTier {
  return (
    typeof value === 'string' &&
    (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly string[]).includes(value)
  );
}

export const TEAM_SEAT_TYPES = ['standard', 'premium'] as const;
export type TeamSeatType = (typeof TEAM_SEAT_TYPES)[number];

export const DEFAULT_TEAM_SEAT_TYPE: TeamSeatType = 'standard';

export const TEAM_SEAT_PLAN_TIERS = {
  standard: 'team',
  premium: 'team_premium',
} as const satisfies Record<TeamSeatType, BillingPlanTier>;
export type TeamSeatPlanTier = (typeof TEAM_SEAT_PLAN_TIERS)[TeamSeatType];
export type TeamSeatUpgradeTier = Exclude<TeamSeatPlanTier, 'team'>;

export const TEAM_SEAT_UPGRADE_TIERS = [
  'team_premium',
] as const satisfies readonly TeamSeatUpgradeTier[];

export const TEAM_SEAT_TYPE_LABELS: Readonly<Record<TeamSeatType, string>> = Object.freeze({
  standard: 'Standard',
  premium: 'Premium',
});

export function isTeamSeatType(value: unknown): value is TeamSeatType {
  return typeof value === 'string' && (TEAM_SEAT_TYPES as readonly string[]).includes(value);
}

export function normalizeTeamSeatType(value: unknown): TeamSeatType {
  return isTeamSeatType(value) ? value : DEFAULT_TEAM_SEAT_TYPE;
}

export function teamSeatPlanTier(seatType: TeamSeatType): TeamSeatPlanTier {
  return TEAM_SEAT_PLAN_TIERS[seatType];
}

export function teamSeatTypeOfPlan(plan: string | null | undefined): TeamSeatType | null {
  return TEAM_SEAT_TYPES.find((seatType) => TEAM_SEAT_PLAN_TIERS[seatType] === plan) ?? null;
}

export function isTeamSeatUpgradeTier(
  value: string | null | undefined,
): value is TeamSeatUpgradeTier {
  return (
    typeof value === 'string' && (TEAM_SEAT_UPGRADE_TIERS as readonly string[]).includes(value)
  );
}

export function subscriptionPlanTierOf(plan: BillingPlanTier): BillingPlanTier {
  return isTeamSeatUpgradeTier(plan) ? TEAM_SEAT_PLAN_TIERS[DEFAULT_TEAM_SEAT_TYPE] : plan;
}

export interface TeamSeatQuantities {
  standard: number;
  premium: number;
}

export function totalTeamSeats(quantities: TeamSeatQuantities): number {
  return quantities.standard + quantities.premium;
}

export interface TeamSeatBilling {
  interval: BillingInterval;
  currency: string;
  premiumSeatsSold: boolean;
}

export interface TeamSeatTypeSummary {
  licensedPremiumSeats: number;
  premiumSeatsAssigned: number;
  billing: TeamSeatBilling;
}

export type TeamSeatBillingEffect =
  'none' | 'uses_paid_seat' | 'charged_now' | 'restored_paid_seat' | 'reduced_at_renewal';

export interface TeamSeatTypeChange {
  seatType: TeamSeatType;
  billing: TeamSeatBillingEffect;
  premiumPaidThrough: string | null;
  seats: TeamSeatQuantities;
}

export function hasSelfServeUpgradePath(value: string | null | undefined): boolean {
  return getNextUpgradeTier(value) !== null;
}

export interface BillingPlanPricing {
  id: BillingPlanTier;
  label: string;
  monthlyPriceUsd?: number;
  yearlyPriceUsd?: number;
  monthlyPriceInr?: number;
  yearlyPriceInr?: number;
  perSeat?: boolean;
  contractPriced?: true;
  trialDays?: number;
}

export function isPerSeatBillingPlan(plan: string | null | undefined): boolean {
  return getBillingPlanPricing(plan).perSeat === true;
}

export const MIN_PURCHASABLE_SEATS = 2;
export const MAX_PURCHASABLE_SEATS = 999_999;

export function normalizePurchasableSeats(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < MIN_PURCHASABLE_SEATS || value > MAX_PURCHASABLE_SEATS) return null;
  return value;
}

export const BILLING_PLAN_PRICING = {
  'local-only': {
    id: 'local-only',
    label: 'Local Mode',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  byok: {
    id: 'byok',
    label: 'Local Mode + BYOK',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  free: {
    id: 'free',
    label: 'Free',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  basic: {
    id: 'basic',
    label: 'Basic',
    monthlyPriceUsd: 7,
    monthlyPriceInr: 399,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    monthlyPriceUsd: 20,
    monthlyPriceInr: 1999,
  },
  max: {
    id: 'max',
    label: 'Max 5x',
    monthlyPriceUsd: 100,
    monthlyPriceInr: 9999,
  },
  max_15x: {
    id: 'max_15x',
    label: 'Max 20x',
    monthlyPriceUsd: 200,
    monthlyPriceInr: 19999,
  },
  team: {
    id: 'team',
    label: 'Team',
    monthlyPriceUsd: 25,
    yearlyPriceUsd: 240,
    monthlyPriceInr: 2499,
    yearlyPriceInr: 23988,
    perSeat: true,
  },
  team_premium: {
    id: 'team_premium',
    label: 'Team Premium',
    monthlyPriceUsd: 125,
    yearlyPriceUsd: 1200,
    perSeat: true,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    contractPriced: true,
  },
} satisfies Record<BillingPlanTier, BillingPlanPricing> &
  Record<SelfServeIndividualPlanTier, { yearlyPriceUsd?: never }>;

export type BillingSurface = 'web' | 'desktop' | 'mobile';

export const PLAN_SURFACE_VISIBILITY: Record<BillingPlanTier, readonly BillingSurface[]> = {
  'local-only': ['web', 'desktop', 'mobile'],
  byok: ['web', 'desktop', 'mobile'],
  free: ['web', 'desktop', 'mobile'],
  basic: ['web', 'desktop', 'mobile'],
  pro: ['web', 'desktop', 'mobile'],
  max: ['web', 'desktop', 'mobile'],
  max_15x: ['web', 'desktop', 'mobile'],
  team: ['web', 'desktop', 'mobile'],
  team_premium: ['web', 'desktop', 'mobile'],
  enterprise: ['web', 'desktop', 'mobile'],
};

export function isPlanSelectableOnSurface(
  plan: string | null | undefined,
  surface: BillingSurface,
): boolean {
  return PLAN_SURFACE_VISIBILITY[normalizeBillingPlanTier(plan)].includes(surface);
}

export function isBillingPlanTier(value: string | null | undefined): value is BillingPlanTier {
  if (!value) return false;
  return value in BILLING_PLAN_PRICING;
}

export function isFreeBillingPlanTier(value: string | null | undefined): value is 'free' {
  return value === 'free';
}

export function isBasicPlanTier(value: string | null | undefined): value is 'basic' {
  return value === 'basic';
}

export function isTeamPlanTier(value: string | null | undefined): value is TeamSeatPlanTier {
  return teamSeatTypeOfPlan(value) !== null;
}

export function isProPlanTier(value: string | null | undefined): value is 'pro' {
  return value === 'pro';
}

export function isMaxPlanTier(value: string | null | undefined): value is 'max' {
  return value === 'max';
}

export function isMax15xPlanTier(value: string | null | undefined): value is 'max_15x' {
  return value === 'max_15x';
}

export function isEnterprisePlanTier(value: string | null | undefined): value is 'enterprise' {
  return value === 'enterprise';
}

export function isLocalOnlyPlanTier(value: string | null | undefined): value is 'local-only' {
  return value === 'local-only';
}

export function isByokPlanTier(value: string | null | undefined): value is 'byok' {
  return value === 'byok';
}

export function isFreeOfChargePlanTier(
  value: string | null | undefined,
): value is 'local-only' | 'byok' | 'free' {
  return isLocalOnlyPlanTier(value) || isByokPlanTier(value) || isFreeBillingPlanTier(value);
}

export type BillingPlanCapability =
  | 'managed_chat'
  | 'chat_tools'
  | 'projects'
  | 'memory_personalization'
  | 'skills'
  | 'connectors'
  | 'remote_control'
  | 'cloud_sync'
  | 'agi_work'
  | 'deep_research'
  | 'image_generation'
  | 'video_generation'
  | 'managed_api'
  | 'developer_surfaces'
  | 'slack_app'
  | 'artifact_connectors'
  | 'team_admin'
  | 'enterprise_controls';

const CLOUD_CHAT_TIERS = [
  'free',
  'basic',
  'pro',
  'max',
  'max_15x',
  'team',
  'team_premium',
  'enterprise',
] as const;
const PAID_TIERS = [
  'basic',
  'pro',
  'max',
  'max_15x',
  'team',
  'team_premium',
  'enterprise',
] as const;
const PRO_TIERS = ['pro', 'max', 'max_15x', 'team', 'team_premium', 'enterprise'] as const;

export const BILLING_PLAN_CAPABILITY_TIERS: Readonly<
  Record<BillingPlanCapability, readonly BillingPlanTier[]>
> = Object.freeze({
  managed_chat: CLOUD_CHAT_TIERS,
  chat_tools: CLOUD_CHAT_TIERS,
  projects: CLOUD_CHAT_TIERS,
  memory_personalization: CLOUD_CHAT_TIERS,
  skills: CLOUD_CHAT_TIERS,
  connectors: PAID_TIERS,
  remote_control: PAID_TIERS,
  cloud_sync: CLOUD_CHAT_TIERS,
  agi_work: PRO_TIERS,
  deep_research: PRO_TIERS,
  image_generation: PRO_TIERS,
  video_generation: ['max_15x', 'enterprise'],
  managed_api: PRO_TIERS,
  developer_surfaces: PRO_TIERS,
  slack_app: PRO_TIERS,
  artifact_connectors: PRO_TIERS,
  team_admin: ['team', 'team_premium', 'enterprise'],
  enterprise_controls: ['enterprise'],
});

export function canUseBillingPlanCapability(
  plan: string | null | undefined,
  capability: BillingPlanCapability,
): boolean {
  if (!isBillingPlanTier(plan)) return false;
  return BILLING_PLAN_CAPABILITY_TIERS[capability].includes(plan);
}

export function billingPlanCapabilityWireTiers(
  capability: BillingPlanCapability,
): BillingPlanTier[] {
  return BILLING_PLAN_CAPABILITY_TIERS[capability].filter((plan) => !isTeamSeatUpgradeTier(plan));
}

export interface WirePlan {
  tier: BillingPlanTier;
  seatType: TeamSeatType | null;
}

export function wirePlanOf(plan: string | null | undefined): WirePlan {
  const tier = normalizeBillingPlanTier(plan);
  return { tier: subscriptionPlanTierOf(tier), seatType: teamSeatTypeOfPlan(tier) };
}

export function seatTypeField(seatType: TeamSeatType | null): { seat_type?: TeamSeatType } {
  return seatType === null ? {} : { seat_type: seatType };
}

export function billingPlanCapabilityPlanLabels(capability: BillingPlanCapability): string {
  const labels = billingPlanCapabilityWireTiers(capability).map(
    (plan) => getBillingPlanPricing(plan).label,
  );
  if (labels.length <= 2) return labels.join(' and ');
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export const BILLING_PLAN_CAPABILITY_LABELS: Readonly<Record<BillingPlanCapability, string>> =
  Object.freeze({
    managed_chat: 'Managed Cloud chat on web, desktop, mobile and Chrome',
    chat_tools: 'Chat tools',
    projects: 'Projects',
    memory_personalization: 'Memory and personalization',
    skills: 'Skills',
    connectors: 'Connectors',
    remote_control: 'Remote Control',
    cloud_sync: 'Sync across devices',
    agi_work: 'AGI Work',
    deep_research: 'Deep Research',
    image_generation: 'Image generation',
    video_generation: 'Video generation',
    managed_api: 'Managed API access',
    developer_surfaces: 'Managed Cloud in the CLI and VS Code',
    slack_app: 'AGI in Slack',
    artifact_connectors: 'Connected apps in published apps',
    team_admin: 'Team administration',
    enterprise_controls: 'SSO, SCIM and admin controls',
  });

export function billingPlanCapabilityUpgradeMessage(capability: BillingPlanCapability): string {
  const labels = billingPlanCapabilityWireTiers(capability).map(
    (plan) => getBillingPlanPricing(plan).label,
  );
  const plans =
    labels.length <= 2
      ? labels.join(' or ')
      : `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
  return `Your plan does not include ${BILLING_PLAN_CAPABILITY_LABELS[capability]}. Upgrade to ${plans} to use it.`;
}

export function billingPlanCapabilities(plan: string | null | undefined): BillingPlanCapability[] {
  return (Object.keys(BILLING_PLAN_CAPABILITY_TIERS) as BillingPlanCapability[]).filter(
    (capability) => canUseBillingPlanCapability(plan, capability),
  );
}

export function billingPlanCapabilitiesAddedOver(
  plan: string | null | undefined,
  baseline: string | null | undefined,
): BillingPlanCapability[] {
  const included = new Set(billingPlanCapabilities(baseline));
  return billingPlanCapabilities(plan).filter((capability) => !included.has(capability));
}

export const USAGE_WORKLOAD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  chat: 'Chat',
  work: 'AGI Work',
  research: 'Deep Research',
  code: 'AGI Code',
  browser: 'Browser',
  unknown: 'Not attributed',
});

export function usageWorkloadLabel(key: string): string {
  return USAGE_WORKLOAD_LABELS[key] ?? key;
}

export type BillingPlanLimit = number | 'unlimited' | 'custom';

const MINUTE_MS = 60_000;

/**
 * Absolute per-user safety ceiling for live managed sandboxes.
 *
 * Plan tiers can grant fewer slots, but no plan may exceed five. Managed turns
 * can still run in parallel without a sandbox, so this bounds stateful compute
 * cost without turning the chat-concurrency dimension into the same setting.
 */
export const MAX_MANAGED_SANDBOXES_PER_USER = 5;

export const PLATFORM_SCHEDULE_RUNS_PER_SWEEP = 50;

export const PLATFORM_EVENT_TRIGGER_RUNS_PER_HOUR = 30;

export const PLATFORM_EVENT_TRIGGER_RUNS_PER_DAY = 720;

export const FREE_DAILY_CAPS = Object.freeze({
  messageWrites: 1_000,
  conversationCreates: 100,
  egressBytes: 25 * 1024 * 1024,
  emailSends: 10,
  vectorQueries: 200,
});

const DAYS_IN_LONGEST_MONTH = 31;

export const STORAGE_COST_SHARE_OF_PRICE = 0.01;

export const DOWNLOAD_COST_SHARE_OF_PRICE = 0.03;

const BYTES_PER_GIB = 1024 ** 3;

function usdPerGib(feature: 'object_storage_gib_month' | 'network_egress_gib'): number | null {
  const microusd = FEATURE_RATE_CARD[feature].providerCogsMicrousd;
  return microusd === null || microusd <= 0 ? null : microusd / MICROUSD_PER_USD;
}

/**
 * Whole GiB of file storage a plan's price funds at its storage share. A
 * storage rate the rate card cannot price funds nothing.
 */
function storageCapBytes(monthlyPriceUsd: number): number {
  const rate = usdPerGib('object_storage_gib_month');
  if (rate === null) return 0;
  return Math.floor((monthlyPriceUsd * STORAGE_COST_SHARE_OF_PRICE) / rate) * BYTES_PER_GIB;
}

/** Bytes of downloads a month a plan's price funds at its download share. */
function downloadCapBytes(monthlyPriceUsd: number): number {
  const rate = usdPerGib('network_egress_gib');
  if (rate === null) return 0;
  return Math.floor(((monthlyPriceUsd * DOWNLOAD_COST_SHARE_OF_PRICE) / rate) * BYTES_PER_GIB);
}

export interface BillingPlanProductLimits {
  projects: BillingPlanLimit;
  customMcpServers: BillingPlanLimit;
  knowledgeStorageBytes: BillingPlanLimit;
  monthlyDownloadBytes: BillingPlanLimit;
  maxConcurrentTurns: BillingPlanLimit;
  maxSandboxes: BillingPlanLimit;
  sandboxTtlMs: number;
  maxConnectorTools: BillingPlanLimit;
  maxScheduledTasks: BillingPlanLimit;
  codeHarnessDailyCeilingCents: BillingPlanLimit;
  maxAttachmentBytes: number;
  maxAttachmentsPerMessage: number;
  dailyAttachmentUploads: BillingPlanLimit;
}

const FREE_ATTACHMENTS_PER_MESSAGE = 10;

const PAID_ATTACHMENTS_PER_MESSAGE = 20;

const MAX_PLAN_PRODUCT_LIMITS: BillingPlanProductLimits = {
  projects: 'unlimited',
  knowledgeStorageBytes: storageCapBytes(BILLING_PLAN_PRICING.max.monthlyPriceUsd),
  monthlyDownloadBytes: downloadCapBytes(BILLING_PLAN_PRICING.max.monthlyPriceUsd),
  customMcpServers: 'unlimited',
  maxConcurrentTurns: 8,
  maxSandboxes: MAX_MANAGED_SANDBOXES_PER_USER,
  sandboxTtlMs: 30 * MINUTE_MS,
  maxConnectorTools: 300,
  maxScheduledTasks: 10,
  codeHarnessDailyCeilingCents: 2500,
  maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
  maxAttachmentsPerMessage: PAID_ATTACHMENTS_PER_MESSAGE,
  dailyAttachmentUploads: 'unlimited',
};

export const BILLING_PLAN_PRODUCT_LIMITS: Readonly<
  Record<BillingPlanTier, BillingPlanProductLimits>
> = Object.freeze({
  'local-only': {
    projects: 'unlimited',
    knowledgeStorageBytes: 'unlimited',
    monthlyDownloadBytes: 'unlimited',
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 'unlimited',
    maxSandboxes: 0,
    sandboxTtlMs: 0,
    maxConnectorTools: 'unlimited',
    maxScheduledTasks: 0,
    codeHarnessDailyCeilingCents: 0,
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    maxAttachmentsPerMessage: FREE_ATTACHMENTS_PER_MESSAGE,
    dailyAttachmentUploads: 'unlimited',
  },
  byok: {
    projects: 'unlimited',
    knowledgeStorageBytes: 'unlimited',
    monthlyDownloadBytes: 'unlimited',
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 'unlimited',
    maxSandboxes: 0,
    sandboxTtlMs: 0,
    maxConnectorTools: 'unlimited',
    maxScheduledTasks: 0,
    codeHarnessDailyCeilingCents: 0,
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    maxAttachmentsPerMessage: FREE_ATTACHMENTS_PER_MESSAGE,
    dailyAttachmentUploads: 'unlimited',
  },
  free: {
    projects: 1,
    knowledgeStorageBytes: 104857600,
    monthlyDownloadBytes: FREE_DAILY_CAPS.egressBytes * DAYS_IN_LONGEST_MONTH,
    customMcpServers: 0,
    maxConcurrentTurns: 1,
    maxSandboxes: 1,
    sandboxTtlMs: 10 * MINUTE_MS,
    maxConnectorTools: 0,
    maxScheduledTasks: 0,
    codeHarnessDailyCeilingCents: 0,
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    maxAttachmentsPerMessage: FREE_ATTACHMENTS_PER_MESSAGE,
    dailyAttachmentUploads: 5,
  },
  basic: {
    projects: 5,
    knowledgeStorageBytes: 1073741824,
    monthlyDownloadBytes: downloadCapBytes(BILLING_PLAN_PRICING.basic.monthlyPriceUsd),
    customMcpServers: 5,
    maxConcurrentTurns: 2,
    maxSandboxes: 2,
    sandboxTtlMs: 10 * MINUTE_MS,
    maxConnectorTools: 50,
    maxScheduledTasks: 2,
    codeHarnessDailyCeilingCents: 100,
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    maxAttachmentsPerMessage: PAID_ATTACHMENTS_PER_MESSAGE,
    dailyAttachmentUploads: 'unlimited',
  },
  pro: {
    projects: 25,
    knowledgeStorageBytes: 10737418240,
    monthlyDownloadBytes: downloadCapBytes(BILLING_PLAN_PRICING.pro.monthlyPriceUsd),
    customMcpServers: 25,
    maxConcurrentTurns: 4,
    maxSandboxes: 5,
    sandboxTtlMs: 20 * MINUTE_MS,
    maxConnectorTools: 150,
    maxScheduledTasks: 5,
    codeHarnessDailyCeilingCents: 500,
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    maxAttachmentsPerMessage: PAID_ATTACHMENTS_PER_MESSAGE,
    dailyAttachmentUploads: 'unlimited',
  },
  max: MAX_PLAN_PRODUCT_LIMITS,
  max_15x: {
    projects: 'unlimited',
    knowledgeStorageBytes: storageCapBytes(BILLING_PLAN_PRICING.max_15x.monthlyPriceUsd),
    monthlyDownloadBytes: downloadCapBytes(BILLING_PLAN_PRICING.max_15x.monthlyPriceUsd),
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 12,
    maxSandboxes: MAX_MANAGED_SANDBOXES_PER_USER,
    sandboxTtlMs: 60 * MINUTE_MS,
    maxConnectorTools: 500,
    maxScheduledTasks: 25,
    codeHarnessDailyCeilingCents: 7500,
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    maxAttachmentsPerMessage: PAID_ATTACHMENTS_PER_MESSAGE,
    dailyAttachmentUploads: 'unlimited',
  },
  team: {
    projects: 25,
    knowledgeStorageBytes: 26843545600,
    monthlyDownloadBytes: downloadCapBytes(BILLING_PLAN_PRICING.team.monthlyPriceUsd),
    customMcpServers: 25,
    maxConcurrentTurns: 4,
    maxSandboxes: 5,
    sandboxTtlMs: 20 * MINUTE_MS,
    maxConnectorTools: 150,
    maxScheduledTasks: 5,
    codeHarnessDailyCeilingCents: 500,
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    maxAttachmentsPerMessage: PAID_ATTACHMENTS_PER_MESSAGE,
    dailyAttachmentUploads: 'unlimited',
  },
  team_premium: {
    ...MAX_PLAN_PRODUCT_LIMITS,
    knowledgeStorageBytes: storageCapBytes(BILLING_PLAN_PRICING.team_premium.monthlyPriceUsd),
    monthlyDownloadBytes: downloadCapBytes(BILLING_PLAN_PRICING.team_premium.monthlyPriceUsd),
  },
  enterprise: {
    projects: 'custom',
    knowledgeStorageBytes: 'custom',
    monthlyDownloadBytes: 'custom',
    customMcpServers: 'custom',
    maxConcurrentTurns: 'custom',
    maxSandboxes: MAX_MANAGED_SANDBOXES_PER_USER,
    sandboxTtlMs: 60 * MINUTE_MS,
    maxConnectorTools: 'custom',
    maxScheduledTasks: 'custom',
    codeHarnessDailyCeilingCents: 'custom',
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    maxAttachmentsPerMessage: PAID_ATTACHMENTS_PER_MESSAGE,
    dailyAttachmentUploads: 'unlimited',
  },
});

export const SANDBOX_MINIMUM_FUNDED_RUN_MS = MINUTE_MS;

export type FreeDailyCap = keyof typeof FREE_DAILY_CAPS;

export function getFreeDailyCap(plan: string | null | undefined, cap: FreeDailyCap): number | null {
  return isFreeBillingPlanTier(plan) ? FREE_DAILY_CAPS[cap] : null;
}

export function getBillingPlanProductLimits(
  plan: string | null | undefined,
): BillingPlanProductLimits | null {
  if (!isBillingPlanTier(plan)) return null;
  return BILLING_PLAN_PRODUCT_LIMITS[plan];
}

export const MAX_PLAN_ATTACHMENT_BYTES = Math.max(
  ...Object.values(BILLING_PLAN_PRODUCT_LIMITS).map((limits) => limits.maxAttachmentBytes),
);

/** The largest single file a plan may upload; an unknown plan may upload nothing. */
export function getPlanMaxAttachmentBytes(plan: string | null | undefined): number {
  return getBillingPlanProductLimits(plan)?.maxAttachmentBytes ?? 0;
}

export function getPlanMaxAttachmentsPerMessage(plan: string | null | undefined): number {
  return getBillingPlanProductLimits(plan)?.maxAttachmentsPerMessage ?? 0;
}

/** Uploads a plan may start in a UTC day, or null when it is not counted. */
export function getPlanDailyAttachmentUploads(plan: string | null | undefined): number | null {
  const limits = getBillingPlanProductLimits(plan);
  if (!limits) return 0;
  return toEnforceableBillingPlanLimit(limits.dailyAttachmentUploads);
}

export function toEnforceableBillingPlanLimit(limit: BillingPlanLimit | undefined): number | null {
  if (limit === 'unlimited' || limit === 'custom') return null;
  return typeof limit === 'number' ? limit : 0;
}

export function getPlanMaxConcurrentTurns(plan: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxConcurrentTurns);
}

export function getPlanMaxSandboxes(plan: string | null | undefined): number {
  const configured = toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxSandboxes);
  return configured === null
    ? MAX_MANAGED_SANDBOXES_PER_USER
    : Math.min(configured, MAX_MANAGED_SANDBOXES_PER_USER);
}

export function getPlanSandboxTtlMs(plan: string | null | undefined): number {
  return getBillingPlanProductLimits(plan)?.sandboxTtlMs ?? 0;
}

export function getPlanMaxConnectorTools(plan: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxConnectorTools);
}

export function getPlanMaxScheduledTasks(plan: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxScheduledTasks);
}

/**
 * A contract-priced plan declares no published ceiling, so the coding harness
 * still gets one: without it `custom` would read as unbounded and the second
 * layer would protect every tier but the largest.
 */
export const ENTERPRISE_CODE_HARNESS_DAILY_CEILING_CENTS = 25_000;

export function getPlanCodeHarnessDailyCeilingCents(plan: string | null | undefined): number {
  const limit = getBillingPlanProductLimits(plan)?.codeHarnessDailyCeilingCents;
  if (limit === undefined) return 0;
  if (limit === 'custom') return ENTERPRISE_CODE_HARNESS_DAILY_CEILING_CENTS;
  if (limit === 'unlimited') return Number.POSITIVE_INFINITY;
  return limit;
}

/**
 * A sandbox alone is not AGI Code: the chat code tool uses one too. A plan
 * includes AGI Code only when its coding agent also has a daily budget to spend.
 */
export function planIncludesAgiCode(plan: string | null | undefined): boolean {
  return getPlanMaxSandboxes(plan) > 0 && getPlanCodeHarnessDailyCeilingCents(plan) > 0;
}

export function agiCodeMinimumPlan(): SelfServeIndividualPlanTier | null {
  return SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.find(planIncludesAgiCode) ?? null;
}

export function getNextUpgradeTier(
  plan: string | null | undefined,
): SelfServeIndividualPlanTier | null {
  const current = normalizeBillingPlanTier(plan);
  const index = (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly BillingPlanTier[]).indexOf(
    current,
  );
  if (index === -1) {
    return isTeamPlanTier(current) || current === 'enterprise'
      ? null
      : (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER[0] ?? null);
  }
  return SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER[index + 1] ?? null;
}

export type ManagedQuotaBlockKind =
  | 'free_trial'
  | 'rolling_window'
  | 'billing_period'
  | 'rate_limit'
  /**
   * The plan simply does not include the capability, nothing was exhausted and
   * nothing resets. Distinct from every other kind here, which are all "you had
   * an allowance and used it up", so the card must not offer a reset time.
   */
  | 'plan_capability';

export interface ManagedQuotaBlockPresentation {
  kind: ManagedQuotaBlockKind;
  feature: 'token_cap' | 'model_access' | 'paid_capability' | 'rolling_capacity' | 'request_rate';
  showUpgradeCta: boolean;
  showResetTime: boolean;
  suggestStandardModel: boolean;
  clearedByCredits: boolean;
  reason: string;
}

const MANAGED_QUOTA_BLOCKS: Readonly<Record<string, ManagedQuotaBlockPresentation>> = Object.freeze(
  {
    free_trial_token_budget_reached: {
      kind: 'free_trial',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: false,
      reason: 'You have reached the current free usage limit. Upgrade for more hosted capacity.',
    },
    free_trial_model_only: {
      kind: 'free_trial',
      feature: 'model_access',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: true,
      clearedByCredits: false,
      reason: 'That model requires a paid plan. Choose a free model or upgrade.',
    },
    free_trial_feature_unavailable: {
      kind: 'free_trial',
      feature: 'paid_capability',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: false,
      clearedByCredits: false,
      reason: 'That capability requires a paid plan.',
    },
    plan_upgrade_required: {
      kind: 'plan_capability',
      feature: 'paid_capability',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: false,
      clearedByCredits: false,
      reason: 'That capability is not included in your current plan.',
    },
    rolling_five_hour_limit_reached: {
      kind: 'rolling_window',
      feature: 'rolling_capacity',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: true,
      reason:
        'You have used your rolling 5-hour capacity. It refills as earlier usage leaves the window, or upgrade for a higher limit.',
    },
    rolling_weekly_limit_reached: {
      kind: 'rolling_window',
      feature: 'rolling_capacity',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: true,
      reason:
        'You have used your rolling weekly capacity. It refills as earlier usage leaves the window, or upgrade for a higher limit.',
    },
    flagship_weekly_limit_reached: {
      kind: 'rolling_window',
      feature: 'rolling_capacity',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: true,
      clearedByCredits: true,
      reason:
        'You have used your weekly capacity for the most capable models. Choose a standard model, wait for capacity to refill, or upgrade.',
    },
    insufficient_credits: {
      kind: 'billing_period',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: true,
      reason: 'Your plan usage for this billing period is used up. Upgrade or wait for the reset.',
    },
    monthly_limit_exceeded: {
      kind: 'billing_period',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: true,
      reason: 'Your plan usage for this billing period is used up. Upgrade or wait for the reset.',
    },
    monthly_credit_limit_reached: {
      kind: 'billing_period',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: false,
      reason: 'Your plan usage for this billing period is used up. Upgrade or wait for the reset.',
    },
    rate_limit_exceeded: {
      kind: 'rate_limit',
      feature: 'request_rate',
      showUpgradeCta: false,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: false,
      reason: 'Too many requests in a short time. Please wait a moment and try again.',
    },
  },
);

export function classifyManagedQuotaErrorCode(
  code: string | null | undefined,
): ManagedQuotaBlockPresentation | null {
  if (typeof code !== 'string' || code.length === 0) return null;
  return MANAGED_QUOTA_BLOCKS[code.trim().toLowerCase()] ?? null;
}

export interface ManagedQuotaResetTimes {
  usageResetAt: string | null;
  sessionResetAt: string | null;
  weeklyResetAt: string | null;
  flagshipWeeklyResetAt: string | null;
}

export function managedQuotaResetAt(
  code: string | null | undefined,
  resets: ManagedQuotaResetTimes,
): string | null {
  switch (code?.trim().toLowerCase()) {
    case 'insufficient_credits':
    case 'monthly_limit_exceeded':
    case 'monthly_credit_limit_reached':
      return resets.usageResetAt;
    case 'rolling_five_hour_limit_reached':
      return resets.sessionResetAt;
    case 'rolling_weekly_limit_reached':
      return resets.weeklyResetAt;
    case 'flagship_weekly_limit_reached':
      return resets.flagshipWeeklyResetAt;
    default:
      return null;
  }
}

/**
 * Tier spellings this catalogue retired, still on rows written before the
 * rename. Folding them here is what stops each client inventing its own map.
 */
export const LEGACY_BILLING_PLAN_TIER_ALIASES: Readonly<Record<string, BillingPlanTier>> =
  Object.freeze({
    hobby: 'basic',
    pro_plus: 'max',
  });

export function normalizeBillingPlanTier(value: string | null | undefined): BillingPlanTier {
  if (!value) return 'free';
  const normalized = value.toLowerCase();
  const alias = LEGACY_BILLING_PLAN_TIER_ALIASES[normalized];
  if (alias !== undefined) return alias;
  return isBillingPlanTier(normalized) ? normalized : 'free';
}

export function getBillingPlanPricing(plan: string | null | undefined): BillingPlanPricing {
  return BILLING_PLAN_PRICING[normalizeBillingPlanTier(plan)];
}

export function getPlanTrialDays(plan: string | null | undefined): number | null {
  const trialDays = getBillingPlanPricing(plan).trialDays;
  return typeof trialDays === 'number' && Number.isInteger(trialDays) && trialDays > 0
    ? trialDays
    : null;
}

export function isContractPricedPlan(plan: string | null | undefined): boolean {
  return getBillingPlanPricing(plan).contractPriced === true;
}

export function getPlanPriceUsd(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number | null {
  const pricing = getBillingPlanPricing(plan);
  const amount = interval === 'yearly' ? pricing.yearlyPriceUsd : pricing.monthlyPriceUsd;
  return typeof amount === 'number' ? amount : null;
}

export function getPlanPriceCents(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number | null {
  const usd = getPlanPriceUsd(plan, interval);
  return usd === null ? null : Math.round(usd * 100);
}

export function billingIntervalsForPlan(plan: string | null | undefined): BillingInterval[] {
  return BILLING_INTERVALS.filter((interval) => getPlanPriceUsd(plan, interval) !== null);
}

export function planOffersBillingInterval(
  plan: string | null | undefined,
  interval: BillingInterval,
): boolean {
  return getPlanPriceUsd(plan, interval) !== null;
}

export type PublishedPricePlanTier = Exclude<BillingPlanTier, 'enterprise'>;

export function getPublishedMonthlyPriceUsd(plan: PublishedPricePlanTier): number {
  return BILLING_PLAN_PRICING[plan].monthlyPriceUsd;
}

export function getPublishedPlanPriceUsd(
  plan: PublishedPricePlanTier,
  interval: BillingInterval,
): number | null {
  return interval === 'monthly'
    ? getPublishedMonthlyPriceUsd(plan)
    : getPlanPriceUsd(plan, interval);
}

export function getPublishedMonthlyPriceCents(plan: PublishedPricePlanTier): number {
  return Math.round(getPublishedMonthlyPriceUsd(plan) * 100);
}

export function getPublishedPlanPriceCents(
  plan: PublishedPricePlanTier,
  interval: BillingInterval,
): number | null {
  const usd = getPublishedPlanPriceUsd(plan, interval);
  return usd === null ? null : Math.round(usd * 100);
}

export function getPublishedPlanPricePerMonthUsd(
  plan: PublishedPricePlanTier,
  interval: BillingInterval,
): number | null {
  const cents = getPublishedPlanPriceCents(plan, interval);
  if (cents === null) return null;
  return interval === 'yearly' ? Math.round(cents / 12) / 100 : cents / 100;
}

export function getPlanPriceInr(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number | null {
  const pricing = getBillingPlanPricing(plan);
  const amount = interval === 'yearly' ? pricing.yearlyPriceInr : pricing.monthlyPriceInr;
  return typeof amount === 'number' ? amount : null;
}

export const BILLING_CURRENCIES = ['usd', 'inr'] as const;

export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export type PriceTaxBehavior = 'inclusive' | 'exclusive';

export interface BillingCurrencyTerms {
  taxBehavior: PriceTaxBehavior;
  includedTax: { label: string; rate: number; source: string; decidedOn: string } | null;
  usdPerUnit: { rate: number; source: string; observedOn: string };
  typicalCardOrigin: 'domestic' | 'international';
}

const ECB_REFERENCE_RATES = Object.freeze({
  source: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
  observedOn: '2026-10-09',
  usdPerEur: 1.1206,
  inrPerEur: 108.3965,
});

/**
 * How each sold currency is priced. INR prices include India's 18% GST, the way
 * ChatGPT, Google AI and Cursor price in India; every other price is net of tax,
 * which Stripe Tax adds at checkout. The USD rate turns a local price into the
 * revenue a budget is sized against and is a dated reference, not a live quote.
 */
export const BILLING_CURRENCY_TERMS: Readonly<Record<BillingCurrency, BillingCurrencyTerms>> =
  Object.freeze({
    usd: {
      taxBehavior: 'exclusive',
      includedTax: null,
      usdPerUnit: { rate: 1, source: 'identity', observedOn: ECB_REFERENCE_RATES.observedOn },
      typicalCardOrigin: 'domestic',
    },
    inr: {
      taxBehavior: 'inclusive',
      includedTax: {
        label: 'GST',
        rate: 0.18,
        source: 'owner decision of 2026-10-10: INR prices include 18% GST',
        decidedOn: '2026-10-10',
      },
      usdPerUnit: {
        rate: ECB_REFERENCE_RATES.usdPerEur / ECB_REFERENCE_RATES.inrPerEur,
        source: ECB_REFERENCE_RATES.source,
        observedOn: ECB_REFERENCE_RATES.observedOn,
      },
      typicalCardOrigin: 'international',
    },
  });

export function isBillingCurrency(value: string | null | undefined): value is BillingCurrency {
  return (BILLING_CURRENCIES as readonly string[]).includes(value?.trim().toLowerCase() ?? '');
}

export function billingCurrencyTerms(currency: string): BillingCurrencyTerms | null {
  const normalized = currency.trim().toLowerCase();
  return isBillingCurrency(normalized) ? BILLING_CURRENCY_TERMS[normalized] : null;
}

export function getPlanPriceInCurrency(
  plan: string | null | undefined,
  interval: BillingInterval,
  currency: BillingCurrency,
): number | null {
  return currency === 'inr' ? getPlanPriceInr(plan, interval) : getPlanPriceUsd(plan, interval);
}
