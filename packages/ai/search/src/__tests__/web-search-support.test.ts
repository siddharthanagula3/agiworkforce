import { describe, it, expect } from 'vitest';
import { getProvidersWithImplementedHarnessFeature } from '@agiworkforce/types';
import {
  providerSupportsWebSearch,
  providerInjectsWebSearchTool,
  isWebSearchAvailable,
  webSearchNeedsGenericTool,
  WEB_SEARCH_INJECTION_PROVIDERS,
  WEB_SEARCH_CAPABLE_PROVIDERS,
} from '../web-search-support';

describe('isWebSearchAvailable (cross-surface composer gate)', () => {
  it('allows a model with native search when its provider path is implemented', () => {
    expect(
      isWebSearchAvailable({
        provider: 'anthropic',
        modelSupportsNativeSearch: true,
        modelSupportsTools: true,
        genericBackendConfigured: false,
      }),
    ).toBe(true);
  });

  it('allows a tools-capable model through the configured generic fallback', () => {
    expect(
      isWebSearchAvailable({
        provider: 'xai',
        modelSupportsNativeSearch: false,
        modelSupportsTools: true,
        genericBackendConfigured: true,
      }),
    ).toBe(true);
  });

  it('does not advertise a generic fallback without a configured backend', () => {
    expect(
      isWebSearchAvailable({
        provider: 'qwen',
        modelSupportsNativeSearch: false,
        modelSupportsTools: true,
        genericBackendConfigured: false,
      }),
    ).toBe(false);
  });

  it('does not offer the generic function tool to a model without tools', () => {
    expect(
      isWebSearchAvailable({
        provider: 'moonshot',
        modelSupportsNativeSearch: false,
        modelSupportsTools: false,
        genericBackendConfigured: true,
      }),
    ).toBe(false);
  });

  it('is null-safe and never infers a provider', () => {
    expect(
      isWebSearchAvailable({
        provider: null,
        modelSupportsNativeSearch: true,
        modelSupportsTools: true,
        genericBackendConfigured: true,
      }),
    ).toBe(false);
  });
});

describe('providerSupportsWebSearch (composer toggle native gate)', () => {
  it('is true for the providers whose native injection provably survives to the wire', () => {
    expect(providerSupportsWebSearch('anthropic')).toBe(true);
    expect(providerSupportsWebSearch('google')).toBe(true);
  });

  it('is true for perplexity (native Sonar search) and managed_cloud (Auto resolves)', () => {
    expect(providerSupportsWebSearch('perplexity')).toBe(true);
    expect(providerSupportsWebSearch('managed_cloud')).toBe(true);
  });

  it('is true for openai through the native Responses web_search path', () => {
    expect(providerSupportsWebSearch('openai')).toBe(true);
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

  it('is exactly the providers whose native injection survives to the wire', () => {
    expect([...WEB_SEARCH_INJECTION_PROVIDERS].sort()).toEqual(['anthropic', 'google', 'openai']);
  });

  it('is a subset of the toggle-capable providers (injecting always implies delivering here)', () => {
    for (const p of WEB_SEARCH_INJECTION_PROVIDERS) {
      expect(WEB_SEARCH_CAPABLE_PROVIDERS.has(p)).toBe(true);
      expect(providerInjectsWebSearchTool(p)).toBe(true);
    }
  });

  it('includes openai after the route adopted Responses web_search', () => {
    expect(providerInjectsWebSearchTool('openai')).toBe(true);
  });
});

describe('webSearchNeedsGenericTool (WP4 fallback gate)', () => {
  it('is false for openai because the native Responses path exists', () => {
    expect(webSearchNeedsGenericTool('openai')).toBe(false);
  });

  it('is true for providers with no native injection branch', () => {
    for (const p of ['xai', 'deepseek', 'qwen', 'moonshot', 'zhipu', 'mistral', 'groq']) {
      expect(webSearchNeedsGenericTool(p)).toBe(true);
    }
  });

  it('is false for providers with a genuinely working native/resolved path', () => {
    expect(webSearchNeedsGenericTool('anthropic')).toBe(false);
    expect(webSearchNeedsGenericTool('google')).toBe(false);
    expect(webSearchNeedsGenericTool('openai')).toBe(false);
    expect(webSearchNeedsGenericTool('perplexity')).toBe(false);
    expect(webSearchNeedsGenericTool('managed_cloud')).toBe(false);
  });

  it('is case-insensitive and null-safe', () => {
    expect(webSearchNeedsGenericTool('XAI')).toBe(true);
    expect(webSearchNeedsGenericTool(undefined)).toBe(false);
    expect(webSearchNeedsGenericTool(null)).toBe(false);
  });
});
