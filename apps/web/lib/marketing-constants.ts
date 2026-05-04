/**
 * Single source of truth for all marketing statistics used across the website.
 * Import from here instead of hardcoding numbers in pages.
 *
 * When product stats change, update ONLY this file - all pages pull from here.
 *
 * Provider count: "10+" = 9 first-party cloud APIs (Anthropic, OpenAI, Google,
 * xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu) + Ollama (local) + LM Studio
 * (local) + unlimited custom OpenAI-compatible BYO endpoints.
 *
 * Surface count: 6 (Desktop, Web, Mobile, CLI, VS Code, Chrome).
 */

export const MARKETING = {
  providers: { count: 10, display: '10+', label: 'AI Providers' },
  skills: { count: 150, display: '150+', label: 'AI Skills' },
  categories: { count: 23, display: '23', label: 'Skill Categories' },
  tools: { count: 1459, display: '1,459+', label: 'Built-in Tools' },
  models: { count: 70, display: '70+', label: 'AI Models' },
  surfaces: { count: 6, display: '6', label: 'Platforms' },
  appSize: { value: 35, display: '~35MB', label: 'App Size' },
  tagline: 'Beyond one model. Beyond one surface. AGI in your hands.',
} as const;
