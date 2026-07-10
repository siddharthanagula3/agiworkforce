import { describe, it, expect } from 'vitest';
import {
  providerSupportsWebSearch,
  providerInjectsWebSearchTool,
  WEB_SEARCH_INJECTION_PROVIDERS,
  WEB_SEARCH_CAPABLE_PROVIDERS,
} from './web-search-support';

describe('providerSupportsWebSearch (composer toggle gate)', () => {
  it('is true for the tool-injection providers', () => {
    expect(providerSupportsWebSearch('anthropic')).toBe(true);
    expect(providerSupportsWebSearch('google')).toBe(true);
    expect(providerSupportsWebSearch('openai')).toBe(true);
  });

  it('is true for perplexity (native Sonar search) and managed_cloud (Auto resolves)', () => {
    expect(providerSupportsWebSearch('perplexity')).toBe(true);
    expect(providerSupportsWebSearch('managed_cloud')).toBe(true);
  });

  it('is false for search:true providers with no wired search path (cosmetic-toggle fix)', () => {
    // These carry capabilities.search:true in models.json but the v1 route injects no
    // tool for them — so the toggle must be gated off client-side.
    expect(providerSupportsWebSearch('xai')).toBe(false);
    expect(providerSupportsWebSearch('qwen')).toBe(false);
    expect(providerSupportsWebSearch('moonshot')).toBe(false);
    expect(providerSupportsWebSearch('deepseek')).toBe(false);
  });

  it('is case-insensitive and null-safe', () => {
    expect(providerSupportsWebSearch('Anthropic')).toBe(true);
    expect(providerSupportsWebSearch(undefined)).toBe(false);
    expect(providerSupportsWebSearch(null)).toBe(false);
  });
});

describe('WEB_SEARCH_INJECTION_PROVIDERS', () => {
  it('is exactly the three tool-injecting providers', () => {
    expect([...WEB_SEARCH_INJECTION_PROVIDERS].sort()).toEqual(['anthropic', 'google', 'openai']);
  });

  it('is a subset of the toggle-capable providers', () => {
    for (const p of WEB_SEARCH_INJECTION_PROVIDERS) {
      expect(WEB_SEARCH_CAPABLE_PROVIDERS.has(p)).toBe(true);
      expect(providerInjectsWebSearchTool(p)).toBe(true);
    }
  });
});
