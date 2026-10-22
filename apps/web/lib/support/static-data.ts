import {
  billingPlanCapabilitiesAddedOver,
  getBillingPlanPricing,
  type BillingPlanCapability,
} from '@agiworkforce/types';
import {
  planCapabilityLabel,
  planCapabilityReleased,
} from '@/features/billing/lib/plan-capability-release';
import { CATALOG_SCOPES } from '@/lib/catalog-scopes';
import {
  BYOK_SURFACES,
  CLI_AVAILABILITY_NOTE,
  CLI_LOCAL_RUNTIMES,
  surfaceAvailabilitySummary,
} from '@/lib/marketing-constants';
import {
  ALL_DOC_PLANS,
  ALL_DOC_PLATFORMS,
  CLOUD_DOC_PLANS,
  KEY_BEARING_DOC_PLANS,
  type DocApplicability,
  type DocAudience,
  type DocMaturity,
} from '@/lib/support/doc-metadata';

const BASIC_PLAN_LABEL = getBillingPlanPricing('basic').label;
const PRO_PLAN_LABEL = getBillingPlanPricing('pro').label;

const PRO_HEADLINE_CAPABILITIES: readonly BillingPlanCapability[] = [
  'agi_work',
  'deep_research',
  'image_generation',
];

const PRO_ADDS_OVER_BASIC = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
}).format(
  billingPlanCapabilitiesAddedOver('pro', 'basic')
    .filter(
      (capability) =>
        PRO_HEADLINE_CAPABILITIES.includes(capability) && planCapabilityReleased(capability),
    )
    .map((capability) => planCapabilityLabel(capability)),
);

export interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  display_order: number;
  is_published: boolean;
  updated: string;
  maturity: DocMaturity;
  audience: DocAudience;
  applicability: DocApplicability;
}

export interface SupportArticle {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  views: number;
  updated: string;
  maturity: DocMaturity;
  audience: DocAudience;
  applicability: DocApplicability;
}

export const STATIC_FAQS: FAQ[] = [
  {
    id: 'faq-001',
    category: 'getting-started',
    question: 'How do I add my first AI provider key?',
    answer: `Provider keys are accepted by the CLI. ${BYOK_SURFACES.availability} On the CLI, run "agi login <provider>" and then "agi auth-status". A bare "agi login" signs in to managed cloud. ${BYOK_SURFACES.exclusion}`,
    display_order: 1,
    is_published: true,
    updated: '2026-09-18',
    maturity: 'ga',
    audience: 'developer',
    applicability: { platforms: ['cli', 'vscode'], plans: ALL_DOC_PLANS },
  },
  {
    id: 'faq-002',
    category: 'getting-started',
    question: 'Which AI providers are supported?',
    answer: `The CLI takes your own key for the ${CATALOG_SCOPES.byokProviders.text} on its provider-key list, which the provider directory names, and custom OpenAI-compatible endpoints can be configured beside them. ${CLI_AVAILABILITY_NOTE} The CLI supports ${CLI_LOCAL_RUNTIMES.label} for Local mode. ${BYOK_SURFACES.exclusion} On those surfaces the model picker is the current source of truth for the models your plan includes.`,
    display_order: 2,
    is_published: true,
    updated: '2026-10-12',
    maturity: 'ga',
    audience: 'user',
    applicability: { platforms: ALL_DOC_PLATFORMS, plans: ALL_DOC_PLANS },
  },
  {
    id: 'faq-003',
    category: 'billing',
    question: `What is the difference between ${BASIC_PLAN_LABEL} and ${PRO_PLAN_LABEL}?`,
    answer: `${BASIC_PLAN_LABEL} includes ${planCapabilityLabel('managed_chat')}. ${PRO_PLAN_LABEL} adds higher usage and ${PRO_ADDS_OVER_BASIC}. The pricing page shows current availability, regional prices and per-plan limits.`,
    display_order: 3,
    is_published: true,
    updated: '2026-10-12',
    maturity: 'ga',
    audience: 'user',
    applicability: { platforms: ALL_DOC_PLATFORMS, plans: CLOUD_DOC_PLANS },
  },
  {
    id: 'faq-004',
    category: 'billing',
    question: 'How do I cancel my subscription?',
    answer:
      'You can cancel at any time from Settings > Billing. Your access continues until the end of your current billing period.',
    display_order: 4,
    is_published: true,
    updated: '2026-09-18',
    maturity: 'ga',
    audience: 'user',
    applicability: { platforms: ALL_DOC_PLATFORMS, plans: CLOUD_DOC_PLANS },
  },
  {
    id: 'faq-005',
    category: 'privacy',
    question: 'Are my conversations stored on your servers?',
    answer:
      'In Local mode on the CLI, conversations stay on your device and are never uploaded. Managed cloud conversations are encrypted in transit, and at rest by the database and object-storage vendors that hold them. You can export your data and delete chats from Settings > Privacy, and delete the account from Settings > Account.',
    display_order: 5,
    is_published: true,
    updated: '2026-10-12',
    maturity: 'ga',
    audience: 'user',
    applicability: { platforms: ALL_DOC_PLATFORMS, plans: ALL_DOC_PLANS },
  },
  {
    id: 'faq-006',
    category: 'features',
    question: 'Can I use AGI on multiple devices?',
    answer: `Conversations belong to your account rather than to one device, so any signed-in surface opens the same history. ${surfaceAvailabilitySummary()} The download page takes your email address so we can write when a platform opens.`,
    display_order: 6,
    is_published: true,
    updated: '2026-10-12',
    maturity: 'ga',
    audience: 'user',
    applicability: { platforms: ALL_DOC_PLATFORMS, plans: CLOUD_DOC_PLANS },
  },
];

export const STATIC_ARTICLES: SupportArticle[] = [
  {
    id: 'article-001',
    category_id: 'getting-started',
    title: 'Getting started with AGI',
    slug: 'getting-started',
    excerpt: 'Learn how to set up AGI and start your first conversation.',
    content: `# Getting started with AGI\n\n1. Create an account with Google, GitHub, or an email address and a password. The Free plan on managed cloud is open by default, with no waitlist and no invite code; paid upgrades start from the pricing page, which offers the upgrade waitlist or takes an access code if they are not open to your account yet.\n2. Start a new chat and send a message. The reply names the model that answered.\n3. Leave the model on Auto, or pick one by name from the control under the composer.\n\nThe web app and Desktop run on your AGI account. The CLI provides Local mode through ${CLI_LOCAL_RUNTIMES.label} and accepts provider keys with "agi login <provider>". ${surfaceAvailabilitySummary()} ${BYOK_SURFACES.exclusion}`,
    views: 1240,
    updated: '2026-10-12',
    maturity: 'ga',
    audience: 'user',
    applicability: { platforms: ALL_DOC_PLATFORMS, plans: ALL_DOC_PLANS },
  },
  {
    id: 'article-002',
    category_id: 'providers',
    title: 'Connecting AI providers',
    slug: 'connecting-providers',
    excerpt: 'Step-by-step guide to adding provider API keys.',
    content: `# Connecting AI providers\n\nThe CLI supports BYOK (bring your own key) for cloud providers. ${BYOK_SURFACES.availability} ${BYOK_SURFACES.exclusion}\n\n## On the CLI\n1. Create an API key with your provider.\n2. Run "agi login <provider>" and paste it, then "agi auth-status" to inspect the saved credentials. A bare "agi login" signs in to AGI managed cloud.\n\n## In VS Code\nVS Code provider-key management requires a connected local CLI runtime and delegates key storage to that runtime. "AGI Code: Set API Key" and "AGI Code: Clear API Key" manage the AGI account API key, not a provider key.`,
    views: 875,
    updated: '2026-10-12',
    maturity: 'ga',
    audience: 'developer',
    applicability: { platforms: ['cli', 'vscode'], plans: KEY_BEARING_DOC_PLANS },
  },
  {
    id: 'article-003',
    category_id: 'features',
    title: 'Using web search in chat',
    slug: 'web-search',
    excerpt: 'How real-time web search reaches your conversations.',
    content:
      '# Using web search\n\nThere is no search switch to find. Search-capable models reach the live web on their own when an answer should not come from training data alone, and the composer states whether search is on for the model you picked. Managed Cloud search follows the chat and usage policy for your plan; Local and BYOK behavior depends on the selected runtime and provider.',
    views: 640,
    updated: '2026-09-18',
    maturity: 'ga',
    audience: 'user',
    applicability: { platforms: ALL_DOC_PLATFORMS, plans: ALL_DOC_PLANS },
  },
];
