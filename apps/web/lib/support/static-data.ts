/**
 * Static FAQ and article content for the support centre.
 * These are served from in-memory until a DB-backed CMS is added.
 */

export interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  display_order: number;
  is_published: boolean;
}

export interface SupportArticle {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  views: number;
}

export const STATIC_FAQS: FAQ[] = [
  {
    id: 'faq-001',
    category: 'getting-started',
    question: 'How do I add my first AI provider key?',
    answer:
      'Go to Settings > Providers, click "Add provider", select your provider, and paste your API key. The key is stored encrypted and never sent to our servers.',
    display_order: 1,
    is_published: true,
  },
  {
    id: 'faq-002',
    category: 'getting-started',
    question: 'Which AI providers are supported?',
    answer:
      'AGI supports 10+ providers including Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Ollama, and LM Studio. More providers are added regularly.',
    display_order: 2,
    is_published: true,
  },
  {
    id: 'faq-003',
    category: 'billing',
    question: 'What is the difference between Basic and Pro?',
    answer:
      'Basic includes Managed Cloud chat on Web, Mobile, and Desktop. Pro adds higher usage, more projects and custom MCP connections, image generation, AGI Work, and managed Cloud access from CLI, Chrome, and VS Code. Current availability and regional prices are shown on the pricing page.',
    display_order: 3,
    is_published: true,
  },
  {
    id: 'faq-004',
    category: 'billing',
    question: 'How do I cancel my subscription?',
    answer:
      'You can cancel at any time from Settings > Billing. Your access continues until the end of your current billing period.',
    display_order: 4,
    is_published: true,
  },
  {
    id: 'faq-005',
    category: 'privacy',
    question: 'Are my conversations stored on your servers?',
    answer:
      'For Local-only mode, all data stays on your device. For cloud sync, conversations are stored encrypted in our database. You can export or delete your data at any time from Settings > Privacy.',
    display_order: 5,
    is_published: true,
  },
  {
    id: 'faq-006',
    category: 'features',
    question: 'Can I use AGI on multiple devices?',
    answer:
      'Yes. Your conversations sync across web, desktop, mobile, and browser extension when you are signed in.',
    display_order: 6,
    is_published: true,
  },
];

export const STATIC_ARTICLES: SupportArticle[] = [
  {
    id: 'article-001',
    category_id: 'getting-started',
    title: 'Getting started with AGI',
    slug: 'getting-started',
    excerpt: 'Learn how to set up AGI and start your first conversation.',
    content:
      '# Getting started with AGI\n\n1. Create an account at agi.app.\n2. Add at least one provider key in Settings > Providers.\n3. Start a new chat from the sidebar and select your provider.\n\nFor Local-only mode, download the desktop app and run Ollama or LM Studio locally - no API key needed.',
    views: 1240,
  },
  {
    id: 'article-002',
    category_id: 'providers',
    title: 'Connecting AI providers',
    slug: 'connecting-providers',
    excerpt: 'Step-by-step guide to adding provider API keys.',
    content:
      '# Connecting AI providers\n\nAGI supports BYOK (bring your own key) for all cloud providers.\n\n## Anthropic\n1. Create an API key at console.anthropic.com.\n2. Paste the key in Settings > Providers > Anthropic.\n\n## OpenAI\n1. Create an API key at platform.openai.com.\n2. Paste the key in Settings > Providers > OpenAI.',
    views: 875,
  },
  {
    id: 'article-003',
    category_id: 'features',
    title: 'Using web search in chat',
    slug: 'web-search',
    excerpt: 'How to enable real-time web search for your conversations.',
    content:
      '# Using web search\n\nEnable web search in the chat toolbar to let the AI fetch current information. Managed Cloud search follows the chat and usage policy for your plan; Local and BYOK behavior depends on the selected runtime and provider.',
    views: 640,
  },
];
