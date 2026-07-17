import { describe, it, expect } from 'vitest';
import { getProvidersWithImplementedHarnessFeature } from '@agiworkforce/types';
import {
  providerSupportsWebSearch,
  providerInjectsWebSearchTool,
  webSearchNeedsGenericTool,
  WEB_SEARCH_INJECTION_PROVIDERS,
  WEB_SEARCH_CAPABLE_PROVIDERS,
} from '../web-search-support';

describe('providerSupportsWebSearch (composer toggle native gate)', () => {
  it('is true for the providers whose native injection provably survives to the wire', () => {
    expect(providerSupportsWebSearch('anthropic')).toBe(true);
    expect(providerSupportsWebSearch('google')).toBe(true);
  });

  it('is true for perplexity (native Sonar search) and managed_cloud (Auto resolves)', () => {
    expect(providerSupportsWebSearch('perplexity')).toBe(true);
    expect(providerSupportsWebSearch('managed_cloud')).toBe(true);
  });

  it('is false for openai — no native path on this route (Responses-only tool, route is chat/completions-only)', () => {
    expect(providerSupportsWebSearch('openai')).toBe(false);
  });

  it('is false for search:true catalog providers with no wired native search path (cosmetic-toggle fix)', () => {
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
  it('is derived from canonical implemented harness features', () => {
    expect([...WEB_SEARCH_INJECTION_PROVIDERS].sort()).toEqual(
      getProvidersWithImplementedHarnessFeature('webSearchInjection').sort(),
    );
    expect([...WEB_SEARCH_CAPABLE_PROVIDERS].sort()).toEqual(
      getProvidersWithImplementedHarnessFeature('webSearch').sort(),
    );
  });

  it('is exactly the two providers whose native injection survives to the wire', () => {
    expect([...WEB_SEARCH_INJECTION_PROVIDERS].sort()).toEqual(['anthropic', 'google']);
  });

  it('is a subset of the toggle-capable providers (injecting always implies delivering here)', () => {
    for (const p of WEB_SEARCH_INJECTION_PROVIDERS) {
      expect(WEB_SEARCH_CAPABLE_PROVIDERS.has(p)).toBe(true);
      expect(providerInjectsWebSearchTool(p)).toBe(true);
    }
  });

  it('does not include openai — it never had a working native path on this route', () => {
    expect(providerInjectsWebSearchTool('openai')).toBe(false);
  });
});

describe('webSearchNeedsGenericTool (WP4 fallback gate)', () => {
  it('is true for openai — no native path exists on this route at all', () => {
    expect(webSearchNeedsGenericTool('openai')).toBe(true);
  });

  it('is true for providers with no native injection branch', () => {
    for (const p of ['xai', 'deepseek', 'qwen', 'moonshot', 'zhipu', 'mistral', 'groq']) {
      expect(webSearchNeedsGenericTool(p)).toBe(true);
    }
  });

  it('is false for providers with a genuinely working native/resolved path', () => {
    expect(webSearchNeedsGenericTool('anthropic')).toBe(false);
    expect(webSearchNeedsGenericTool('google')).toBe(false);
    expect(webSearchNeedsGenericTool('perplexity')).toBe(false);
    expect(webSearchNeedsGenericTool('managed_cloud')).toBe(false);
  });

  it('is case-insensitive and null-safe', () => {
    expect(webSearchNeedsGenericTool('XAI')).toBe(true);
    expect(webSearchNeedsGenericTool(undefined)).toBe(false);
    expect(webSearchNeedsGenericTool(null)).toBe(false);
  });
});
