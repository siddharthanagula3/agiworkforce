import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
  applyWorkMode,
  getWorkModeEntitlementError,
  appendWebSearchTool,
  isFreeTierBlockedAddOn,
  resolveManagedUsageLeaseSeconds,
  processRequest,
  shouldOfferGenericWebSearchTool,
} from './request-processor';
import {
  WEB_SEARCH_INJECTION_PROVIDERS,
  providerInjectsWebSearchTool,
} from '@/lib/web-search-support';

describe('applyWorkMode', () => {
  it('turns AGI Work into a real tool-using managed-cloud request', () => {
    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Research this and build a report.' }],
      stream: false,
      work_mode: 'agiwork' as const,
    };

    applyWorkMode(request);

    expect(request).toMatchObject({
      work_mode: 'agiwork',
      web_search: true,
      web_fetch: true,
      code_execution: true,
      stream: true,
    });
  });

  it('does not change ordinary chat requests', () => {
    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Hello' }],
      stream: false,
      work_mode: 'chat' as const,
    };

    applyWorkMode(request);

    expect(request).toEqual({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: false,
      work_mode: 'chat',
    });
  });
});

describe('getWorkModeEntitlementError', () => {
  it.each(['free', 'basic', 'local-only', 'byok', 'not-a-plan'])(
    'rejects AGI Work for %s',
    (planTier) => {
      expect(getWorkModeEntitlementError('agiwork', planTier)).toEqual({
        code: 'agi_work_plan_required',
        message: 'AGI Work requires Pro or higher.',
        requiredTier: 'pro',
      });
    },
  );

  it.each(['pro', 'max', 'max_15x', 'team', 'enterprise'])('admits AGI Work for %s', (planTier) => {
    expect(getWorkModeEntitlementError('agiwork', planTier)).toBeNull();
  });

  it('does not gate ordinary chat through the AGI Work capability', () => {
    expect(getWorkModeEntitlementError('chat', 'basic')).toBeNull();
    expect(getWorkModeEntitlementError(undefined, 'free')).toBeNull();
  });

  it('returns a structured 403 before any Managed Cloud work starts for Basic', async () => {
    const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'work-mode-basic-1',
        'x-agi-surface': 'web',
      },
      body: JSON.stringify({
        model: 'auto',
        messages: [{ role: 'user', content: 'Build a report.' }],
        work_mode: 'agiwork',
      }),
    });

    const result = await processRequest(request, {
      ok: true,
      userId: 'user-basic',
      token: 'session-token',
      subscription: {
        id: 'sub-basic',
        user_id: 'user-basic',
        plan_tier: 'basic',
        status: 'active',
        current_period_start: new Date('2026-07-01T00:00:00Z'),
        current_period_end: new Date('2026-08-01T00:00:00Z'),
        stripe_subscription_id: 'stripe-sub-basic',
        stripe_price_id: 'stripe-price-basic',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({
        error: {
          code: 'agi_work_plan_required',
          requiredTier: 'pro',
          type: 'invalid_request_error',
        },
      });
    }
  });
});

describe('resolveManagedUsageLeaseSeconds', () => {
  it('keeps ordinary chat leases short and protects long AGI Work workflows from recovery', () => {
    expect(resolveManagedUsageLeaseSeconds(undefined)).toBe(900);
    expect(resolveManagedUsageLeaseSeconds('chat')).toBe(900);
    expect(resolveManagedUsageLeaseSeconds('agiwork')).toBe(86_400);
  });
});

/**
 * Bug 2 (web search "still cosmetic") root-cause proof — test at the injection hop.
 *
 * The client sends `web_search:true` and the composer only lets the toggle turn on
 * when the model's catalog `search` flag is set. The break was NOT client-side (the
 * prior "added deps to handleSubmit" fix): it is that the server only injects a
 * native search tool for anthropic/google, while xai/qwen/moonshot/openai models
 * ALSO carry (or carried) `search:true` in the catalog — so their toggle lit a
 * checkmark but the request went out with no tool and the model replied "I can't
 * browse the internet".
 *
 * These tests pin exactly which providers inject (so the composer's client-side gate,
 * `providerSupportsWebSearch`, can never drift from the server) and that unsupported
 * providers are a no-op at this hop — WP4's `shouldOfferGenericWebSearchTool` covers
 * them with the platform-executed fallback tool instead (tested below).
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

  it('injects the stable OpenAI Responses web_search tool', () => {
    expect(appendWebSearchTool('openai', undefined, caps)).toEqual([{ type: 'web_search' }]);
  });

  it.each(['xai', 'qwen', 'moonshot', 'deepseek', 'perplexity'])(
    'does NOT inject a tool for %s (no native path on this route — WP4 generic tool covers it)',
    (provider) => {
      // Returns the existing tool list unchanged. xai/qwen/moonshot/deepseek
      // are gated OUT of the composer toggle client-side (providerSupportsWebSearch)
      // so this no-op is never reached with an enabled native-path toggle; all of
      // them are covered by the generic fallback instead.
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

/**
 * WP4 — gates the platform-executed generic `web_search` function tool. Every
 * condition must hold or the tool is not offered; getting any one wrong either
 * reintroduces a cosmetic toggle (offering with no backend) or a stalled turn
 * (offering with no execution path, i.e. outside the tool loop).
 */
describe('shouldOfferGenericWebSearchTool', () => {
  const baseArgs = {
    providerLower: 'openai',
    toolsCapable: true,
    stream: true,
    freeTrial: false,
    backendConfigured: true,
  };

  it('is false for openai because its native Responses path covers search', () => {
    expect(shouldOfferGenericWebSearchTool(baseArgs)).toBe(false);
  });

  it.each(['xai', 'deepseek', 'qwen', 'moonshot', 'zhipu', 'mistral', 'groq'])(
    'is true for %s (no native path) with every other condition satisfied',
    (providerLower) => {
      expect(shouldOfferGenericWebSearchTool({ ...baseArgs, providerLower })).toBe(true);
    },
  );

  it.each(['anthropic', 'google', 'openai', 'perplexity', 'managed_cloud'])(
    'is false for %s — native/resolved path already covers it, no fallback needed',
    (providerLower) => {
      expect(shouldOfferGenericWebSearchTool({ ...baseArgs, providerLower })).toBe(false);
    },
  );

  it('is false when the resolved model is not tools-capable', () => {
    expect(shouldOfferGenericWebSearchTool({ ...baseArgs, toolsCapable: false })).toBe(false);
  });

  it('is false on a non-streaming request (offer ⊆ run — only streaming enters the tool loop)', () => {
    expect(shouldOfferGenericWebSearchTool({ ...baseArgs, stream: false })).toBe(false);
    expect(shouldOfferGenericWebSearchTool({ ...baseArgs, stream: undefined })).toBe(false);
  });

  it('is true on a free-tier request when the backend is configured', () => {
    expect(
      shouldOfferGenericWebSearchTool({ ...baseArgs, providerLower: 'xai', freeTrial: true }),
    ).toBe(true);
  });

  it('is false when no search backend is configured — never offer a tool the server cannot execute', () => {
    expect(shouldOfferGenericWebSearchTool({ ...baseArgs, backendConfigured: false })).toBe(false);
  });
});

describe('isFreeTierBlockedAddOn', () => {
  it('keeps Deep Research paid while allowing normal web search', () => {
    expect(isFreeTierBlockedAddOn({ web_search: true })).toBe(false);
    expect(isFreeTierBlockedAddOn({ research: true })).toBe(true);
  });

  it('keeps arbitrary client tool definitions and multi-completion API use out of free chat', () => {
    expect(
      isFreeTierBlockedAddOn({
        tools: [{ type: 'function', function: { name: 'custom_tool', parameters: {} } }],
      }),
    ).toBe(true);
    expect(isFreeTierBlockedAddOn({ tool_choice: 'auto' })).toBe(true);
    expect(isFreeTierBlockedAddOn({ n: 2 })).toBe(true);
  });

  it('keeps the developer-level AGI Work agent on paid plans', () => {
    expect(isFreeTierBlockedAddOn({ work_mode: 'agiwork' })).toBe(true);
    expect(isFreeTierBlockedAddOn({ work_mode: 'chat' })).toBe(false);
  });
});
