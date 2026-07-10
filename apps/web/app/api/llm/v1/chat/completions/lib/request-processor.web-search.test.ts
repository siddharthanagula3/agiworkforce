import { describe, it, expect } from 'vitest';
import { appendWebSearchTool } from './request-processor';
import {
  WEB_SEARCH_INJECTION_PROVIDERS,
  providerInjectsWebSearchTool,
} from '@/lib/web-search-support';

/**
 * Bug 2 (web search "still cosmetic") root-cause proof — test at the injection hop.
 *
 * The client sends `web_search:true` and the composer only lets the toggle turn on
 * when the model's catalog `search` flag is set. The break was NOT client-side (the
 * prior "added deps to handleSubmit" fix): it is that the server only injects a
 * native search tool for anthropic/google/openai, while xai/qwen/moonshot models
 * ALSO carry `search:true` in the catalog — so their toggle lit a checkmark but the
 * request went out with no tool and the model replied "I can't browse the internet".
 *
 * These tests pin exactly which providers inject (so the composer's client-side gate,
 * `providerSupportsWebSearch`, can never drift from the server) and that unsupported
 * providers are a no-op rather than a silent-but-toggle-enabled failure.
 */
describe('appendWebSearchTool', () => {
  const caps = { search: true };

  it('injects the current Anthropic web_search server tool with direct callers', () => {
    const tools = appendWebSearchTool('anthropic', undefined, caps);
    expect(tools).toEqual([
      { type: 'web_search_20260209', name: 'web_search', allowed_callers: ['direct'] },
    ]);
  });

  it('injects the Google google_search tool', () => {
    expect(appendWebSearchTool('google', undefined, caps)).toEqual([{ google_search: {} }]);
  });

  it('injects the OpenAI web_search_preview tool', () => {
    expect(appendWebSearchTool('openai', undefined, caps)).toEqual([
      { type: 'web_search_preview' },
    ]);
  });

  it.each(['xai', 'qwen', 'moonshot', 'deepseek', 'perplexity'])(
    'does NOT inject a tool for %s (no wired tool-injection branch)',
    (provider) => {
      // Returns the existing tool list unchanged — the historical silent no-op that
      // made the toggle cosmetic. These providers are now gated OUT of the composer
      // toggle client-side (providerSupportsWebSearch) so the no-op is never reached
      // with an enabled toggle.
      const existing = [{ type: 'function', function: { name: 'x' } }];
      expect(appendWebSearchTool(provider, existing, caps)).toEqual(existing);
    },
  );

  it('preserves pre-existing tools when injecting', () => {
    const existing = [{ type: 'function', function: { name: 'x' } }];
    const tools = appendWebSearchTool('anthropic', existing, caps);
    expect(tools).toHaveLength(2);
    expect(tools?.[0]).toEqual(existing[0]);
  });

  it('does not inject when the model does not support search (caps.search=false)', () => {
    expect(appendWebSearchTool('anthropic', undefined, { search: false })).toBeUndefined();
  });

  it('stays permissive for unknown/missing caps (never silently drops a real tool)', () => {
    expect(appendWebSearchTool('anthropic', undefined, undefined)).toHaveLength(1);
  });

  it('injection branches match the shared WEB_SEARCH_INJECTION_PROVIDERS source of truth', () => {
    for (const provider of ['anthropic', 'google', 'openai']) {
      expect(WEB_SEARCH_INJECTION_PROVIDERS.has(provider)).toBe(true);
      expect(providerInjectsWebSearchTool(provider)).toBe(true);
      expect(appendWebSearchTool(provider, undefined, caps)).toHaveLength(1);
    }
    for (const provider of ['xai', 'qwen', 'moonshot']) {
      expect(providerInjectsWebSearchTool(provider)).toBe(false);
      expect(appendWebSearchTool(provider, undefined, caps)).toBeUndefined();
    }
  });
});
