import { BILLING_PLAN_PRICING, type BillingPlanTier } from '@agiworkforce/types';

import { AVAILABLE_NOW_LABEL, SURFACE_STATUS } from '@/lib/surface-status';

export const DOC_MATURITIES = ['ga', 'beta', 'alpha'] as const;
export type DocMaturity = (typeof DOC_MATURITIES)[number];

export const DOC_AUDIENCES = ['user', 'admin', 'developer'] as const;
export type DocAudience = (typeof DOC_AUDIENCES)[number];

export const DOC_SEGMENTS = ['consumer', 'business', 'enterprise'] as const;
export type DocSegment = (typeof DOC_SEGMENTS)[number];

export type DocPlatform = keyof typeof SURFACE_STATUS;

export const DOC_MATURITY_LABELS: Readonly<Record<DocMaturity, string>> = Object.freeze({
  ga: 'GA',
  beta: 'Beta',
  alpha: 'Alpha',
});

export const DOC_AUDIENCE_LABELS: Readonly<Record<DocAudience, string>> = Object.freeze({
  user: 'Everyone',
  admin: 'Workspace admins',
  developer: 'Developers',
});

export const DOC_SEGMENT_LABELS: Readonly<Record<DocSegment, string>> = Object.freeze({
  consumer: 'Individual',
  business: 'Business',
  enterprise: 'Enterprise',
});

export const DOC_PLATFORM_LABELS: Readonly<Record<DocPlatform, string>> = Object.freeze({
  web: 'Web',
  desktop: 'Desktop',
  cli: 'CLI',
  mobile: 'Mobile',
  vscode: 'VS Code',
  chrome: 'Chrome',
});

export const ALL_DOC_PLATFORMS = Object.freeze(
  Object.keys(SURFACE_STATUS) as DocPlatform[],
) as readonly DocPlatform[];

export const RELEASED_DOC_PLATFORMS = Object.freeze(
  ALL_DOC_PLATFORMS.filter((platform) => SURFACE_STATUS[platform] === AVAILABLE_NOW_LABEL),
) as readonly DocPlatform[];

export const ALL_DOC_PLANS = Object.freeze(
  Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[],
) as readonly BillingPlanTier[];

export const WORKSPACE_DOC_PLANS = Object.freeze([
  'team',
  'enterprise',
]) as readonly BillingPlanTier[];

export const ENTERPRISE_DOC_PLANS = Object.freeze(['enterprise']) as readonly BillingPlanTier[];

export const CLOUD_DOC_PLANS = Object.freeze(
  ALL_DOC_PLANS.filter((plan) => plan !== 'local-only' && plan !== 'byok'),
) as readonly BillingPlanTier[];

export const PAID_CLOUD_DOC_PLANS = Object.freeze(
  CLOUD_DOC_PLANS.filter((plan) => plan !== 'free'),
) as readonly BillingPlanTier[];

export const KEY_BEARING_DOC_PLANS = Object.freeze([
  'local-only',
  'byok',
]) as readonly BillingPlanTier[];

export interface DocApplicability {
  platforms: readonly DocPlatform[];
  plans: readonly BillingPlanTier[];
  apiVersions?: readonly string[];
}

export interface DocMetadata {
  maturity: DocMaturity;
  audience: DocAudience;
  applicability: DocApplicability;
}

export function planLabel(plan: BillingPlanTier): string {
  return BILLING_PLAN_PRICING[plan].label;
}

/** Which commercial shape a document speaks to, read off the plans it applies to. */
export function segmentsForPlans(plans: readonly BillingPlanTier[]): readonly DocSegment[] {
  const segments: DocSegment[] = [];
  if (plans.some((plan) => plan !== 'team' && plan !== 'enterprise')) segments.push('consumer');
  if (plans.includes('team')) segments.push('business');
  if (plans.includes('enterprise')) segments.push('enterprise');
  return segments;
}

export function appliesToEveryPlan(plans: readonly BillingPlanTier[]): boolean {
  return ALL_DOC_PLANS.every((plan) => plans.includes(plan));
}

export function appliesToEveryPlatform(platforms: readonly DocPlatform[]): boolean {
  return ALL_DOC_PLATFORMS.every((platform) => platforms.includes(platform));
}

function metadata(
  maturity: DocMaturity,
  audience: DocAudience,
  platforms: readonly DocPlatform[],
  plans: readonly BillingPlanTier[],
  apiVersions?: readonly string[],
): DocMetadata {
  return Object.freeze({
    maturity,
    audience,
    applicability: Object.freeze({
      platforms: Object.freeze([...platforms]),
      plans: Object.freeze([...plans]),
      ...(apiVersions ? { apiVersions: Object.freeze([...apiVersions]) } : {}),
    }),
  });
}

/**
 * Applicability per help-centre document. Keyed by corpus document id, so a new
 * document without an entry fails doc-metadata.test.ts rather than rendering bare.
 */
export const SUPPORT_DOC_METADATA: Readonly<Record<string, DocMetadata>> = Object.freeze({
  'account-security': metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'accounts-and-sign-in': metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'agi-work': metadata('beta', 'user', ['web'], PAID_CLOUD_DOC_PLANS),
  artifacts: metadata('ga', 'user', ['web', 'desktop'], CLOUD_DOC_PLANS),
  'billing-and-plans': metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'byok-provider-keys': metadata('ga', 'developer', ['cli', 'desktop', 'vscode'], ALL_DOC_PLANS),
  'chat-basics': metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'chrome-extension': metadata('beta', 'user', ['chrome'], CLOUD_DOC_PLANS),
  'connectors-and-mcp': metadata('ga', 'user', ALL_DOC_PLATFORMS, CLOUD_DOC_PLANS),
  'delete-your-account': metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'desktop-and-cli': metadata('ga', 'developer', ['desktop', 'cli'], ALL_DOC_PLANS),
  'enterprise-security': metadata('ga', 'admin', ALL_DOC_PLATFORMS, ENTERPRISE_DOC_PLANS),
  'export-your-data': metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'files-and-attachments': metadata('ga', 'user', ['web', 'desktop', 'mobile'], CLOUD_DOC_PLANS),
  'getting-started': metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'install-desktop-and-mobile': metadata('beta', 'user', ['desktop', 'mobile'], ALL_DOC_PLANS),
  'install-the-cli': metadata('ga', 'developer', ['cli'], ALL_DOC_PLANS),
  'keyboard-shortcuts': metadata('ga', 'user', ['web', 'desktop'], ALL_DOC_PLANS),
  library: metadata('ga', 'user', ['web'], CLOUD_DOC_PLANS),
  'local-mode': metadata('ga', 'developer', ['desktop', 'cli'], KEY_BEARING_DOC_PLANS),
  'managed-cloud': metadata('ga', 'developer', ALL_DOC_PLATFORMS, CLOUD_DOC_PLANS, ['v1']),
  'mcp-connections': metadata('ga', 'developer', ALL_DOC_PLATFORMS, CLOUD_DOC_PLANS),
  memory: metadata('ga', 'user', ['web', 'desktop'], CLOUD_DOC_PLANS),
  'models-and-reasoning': metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'privacy-controls': metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  projects: metadata('ga', 'user', ['web', 'desktop'], CLOUD_DOC_PLANS),
  'providers-and-models': metadata('ga', 'developer', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'schedules-and-triggers': metadata('beta', 'user', ['web'], PAID_CLOUD_DOC_PLANS),
  search: metadata('ga', 'user', ALL_DOC_PLATFORMS, CLOUD_DOC_PLANS),
  'sharing-conversations': metadata('ga', 'user', ['web'], CLOUD_DOC_PLANS),
  'signing-up': metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'temporary-chats': metadata('ga', 'user', ['web', 'desktop'], CLOUD_DOC_PLANS),
  'tool-approvals': metadata('ga', 'user', ALL_DOC_PLATFORMS, CLOUD_DOC_PLANS),
  troubleshooting: metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  'usage-and-credits': metadata('ga', 'user', ALL_DOC_PLATFORMS, CLOUD_DOC_PLANS),
  voice: metadata('beta', 'user', ['web'], PAID_CLOUD_DOC_PLANS),
  'vscode-extension': metadata('beta', 'developer', ['vscode'], ALL_DOC_PLANS),
  'workspace-administration': metadata('ga', 'admin', ['web'], WORKSPACE_DOC_PLANS),
  'workspace-policy': metadata('ga', 'admin', ['web'], WORKSPACE_DOC_PLANS),
  'workspace-roles-and-groups': metadata('ga', 'admin', ['web'], WORKSPACE_DOC_PLANS),
});

export function docMetadataFor(docId: string): DocMetadata | null {
  return SUPPORT_DOC_METADATA[docId] ?? null;
}

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

const NAMED_PLAN_SETS: readonly { plans: readonly BillingPlanTier[]; label: string }[] = [
  { plans: ALL_DOC_PLANS, label: 'Every plan' },
  { plans: CLOUD_DOC_PLANS, label: 'Every managed cloud plan' },
  { plans: PAID_CLOUD_DOC_PLANS, label: 'Every paid plan' },
];

export function describePlans(plans: readonly BillingPlanTier[]): string {
  const named = NAMED_PLAN_SETS.find((set) => sameSet(set.plans, plans));
  if (named) return named.label;
  return plans.map(planLabel).join(', ');
}

export function describePlatforms(platforms: readonly DocPlatform[]): string {
  if (appliesToEveryPlatform(platforms)) return 'Every surface';
  return platforms.map((platform) => DOC_PLATFORM_LABELS[platform]).join(', ');
}

export function describeSegments(plans: readonly BillingPlanTier[]): string {
  return segmentsForPlans(plans)
    .map((segment) => DOC_SEGMENT_LABELS[segment])
    .join(', ');
}
