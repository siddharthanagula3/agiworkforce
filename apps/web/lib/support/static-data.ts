import {
  BYOK_SURFACES,
  CLI_LOCAL_RUNTIMES,
  MARKETING,
  SURFACE_STATUS,
  AVAILABLE_NOW_LABEL,
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

const SURFACE_NAMES: Record<keyof typeof SURFACE_STATUS, string> = {
  web: 'the web app',
  desktop: 'Desktop',
  cli: 'the CLI',
  mobile: 'Mobile',
  vscode: 'VS Code',
  chrome: 'Chrome',
};

const PUBLISHED_SURFACES = (Object.keys(SURFACE_STATUS) as (keyof typeof SURFACE_STATUS)[]).filter(
  (surface) => SURFACE_STATUS[surface] === AVAILABLE_NOW_LABEL,
);

const PUBLISHED_SURFACE_LIST = PUBLISHED_SURFACES.map((surface) => SURFACE_NAMES[surface]).join(
  ' and ',
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
    answer: `Provider keys are accepted by the released CLI today; VS Code BYOK is coming soon. On the CLI, run "agi login <provider>" and then "agi auth-status". A bare "agi login" signs in to managed cloud. ${BYOK_SURFACES.exclusion}`,
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
    answer: `AGI supports ${MARKETING.providers.display} provider integrations, including Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, and custom OpenAI-compatible endpoints. The released CLI supports ${CLI_LOCAL_RUNTIMES.label} for Local mode. Desktop uses managed cloud and accepts no provider key. The in-product catalog is the current source of truth.`,
    display_order: 2,
    is_published: true,
    updated: '2026-09-18',
    maturity: 'ga',
    audience: 'user',
    applicability: { platforms: ALL_DOC_PLATFORMS, plans: ALL_DOC_PLANS },
  },
  {
    id: 'faq-003',
    category: 'billing',
    question: 'What is the difference between Basic and Pro?',
    answer:
      'Basic includes Managed Cloud chat on Web, Mobile, and Desktop. Pro adds higher usage, more projects and custom MCP connections, image generation, AGI Work, and managed Cloud access from CLI, Chrome, and VS Code. Current availability and regional prices are shown on the pricing page.',
    display_order: 3,
    is_published: true,
    updated: '2026-09-18',
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
      'For Local-only mode, all data stays on your device. For cloud sync, conversations are stored encrypted in our database. You can export or delete your data at any time from Settings > Privacy.',
    display_order: 5,
    is_published: true,
    updated: '2026-09-18',
    maturity: 'ga',
    audience: 'user',
    applicability: { platforms: ALL_DOC_PLATFORMS, plans: ALL_DOC_PLANS },
  },
  {
    id: 'faq-006',
    category: 'features',
    question: 'Can I use AGI on multiple devices?',
    answer: `Conversations belong to your account rather than to one device, so any signed-in surface opens the same history. ${PUBLISHED_SURFACE_LIST} are published today; Desktop, Mobile, VS Code and Chrome are not released yet, and the download page takes your address for the platform you want.`,
    display_order: 6,
    is_published: true,
    updated: '2026-09-18',
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
    content: `# Getting started with AGI\n\n1. Create an account with Google, GitHub, or an email address and a password. Managed cloud is open by default, so there is no waitlist and no invite code.\n2. Start a new chat and confirm the visible route label, which names where the answer came from.\n3. Leave the model on Auto, or pick one by name from the control under the composer.\n\nThe web app and Desktop run on your AGI account. The released CLI provides Local mode through ${CLI_LOCAL_RUNTIMES.label} and accepts provider keys with "agi login <provider>". VS Code BYOK is coming soon. ${BYOK_SURFACES.exclusion}`,
    views: 1240,
    updated: '2026-09-18',
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
    content: `# Connecting AI providers\n\nThe released CLI supports BYOK (bring your own key) for cloud providers today. VS Code BYOK is coming soon. ${BYOK_SURFACES.exclusion}\n\n## On the CLI\n1. Create an API key with your provider.\n2. Run "agi login <provider>" and paste it, then "agi auth-status" to confirm the configured provider. A bare "agi login" signs in to AGI managed cloud.\n\n## In VS Code\nThe unreleased extension implements "AGI Workforce: Set API Key", "AGI Workforce: Select Model", and "AGI Workforce: Clear API Key" with VS Code SecretStorage. These instructions apply when a VSIX is published.`,
    views: 875,
    updated: '2026-09-18',
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
