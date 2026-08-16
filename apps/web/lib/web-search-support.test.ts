
import { describe, it, expect } from 'vitest';
import {
  providerSupportsWebSearch,
  providerInjectsWebSearchTool,
  webSearchNeedsGenericTool,
  WEB_SEARCH_INJECTION_PROVIDERS,
  WEB_SEARCH_CAPABLE_PROVIDERS,
} from './web-search-support';

describe('web-search-support re-export shim', () => {
  it('re-exports the canonical functions and sets, wired correctly', () => {
    expect(providerSupportsWebSearch('anthropic')).toBe(true);
    expect(providerSupportsWebSearch('openai')).toBe(true);
    expect(providerInjectsWebSearchTool('google')).toBe(true);
    expect(webSearchNeedsGenericTool('openai')).toBe(false);
    expect(WEB_SEARCH_INJECTION_PROVIDERS.has('anthropic')).toBe(true);
    expect(WEB_SEARCH_CAPABLE_PROVIDERS.has('perplexity')).toBe(true);
  });
});
