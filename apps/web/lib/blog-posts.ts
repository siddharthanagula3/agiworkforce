export const BLOG_DESCRIPTION = 'Practical guides to AI models, plans and workflows.';

export const SUBSCRIPTION_GUIDE = {
  slug: 'multi-model-ai-vs-separate-subscriptions',
  path: '/blog/multi-model-ai-vs-separate-subscriptions',
  title: 'One AI subscription or separate apps?',
  description:
    'Compare multi-model workspaces, BYOK and separate AI subscriptions. Check model access, usage limits, native features and total cost before switching.',
  summary:
    'A multi-model AI workspace can replace some separate subscriptions if it supports the models, tasks and usage you need. It does not automatically include subscriptions to the providers’ own apps.',
  updated: '2026-11-07',
} as const;

export const BLOG_POSTS = [SUBSCRIPTION_GUIDE] as const;
