/**
 * Single source of truth for all marketing statistics used across the website.
 * Import from here instead of hardcoding numbers in pages.
 *
 * When product stats change, update ONLY this file - all pages pull from here.
 */

export const MARKETING = {
  providers: { count: 25, display: '25+', label: 'AI Providers' },
  skills: { label: 'AI Skills', description: 'Across multiple categories' },
  categories: { count: 23, display: '23', label: 'Skill Categories' },
  tools: { count: 1459, display: '1,459+', label: 'Built-in Tools' },
  models: { count: 70, display: '70+', label: 'AI Models' },
  surfaces: { count: 8, display: '8', label: 'Platforms' },
  appSize: { value: 35, display: '~35MB', label: 'App Size' },
} as const;
