import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  getAllowedModelsForTier,
  getModelMetadataById,
  listCanonicalModels,
  requireProviderDefaultModel,
} from '@agiworkforce/types';

vi.mock('@/lib/services/free-trial-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/free-trial-service')>();
  return {
    ...actual,
    beginFreeTrialRequest: vi.fn(async ({ userId, requestId }) => ({
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId,
        requestId,
        reservedMicrousd: 25_000,
      },
    })),
    applyFreeTrialProviderBudget: vi.fn(() => ({ ok: true, maxOutputTokens: 1_024 })),
    settleFreeTrialRequest: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-content-safety-service')>();
  return {
    ...actual,
    enforceManagedContentSafetyPreference: vi.fn(async () => ({
      enabled: false,
      allowed: true,
    })),
  };
});

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async (request: NextRequest) => ({
    db: {},
    userId: request.headers.get('idempotency-key')?.startsWith('free-') ? 'user-free' : 'user-pro',
  })),
}));

import {
  applyWorkMode,
  getWorkModeEntitlementError,
  appendWebSearchTool,
  isFreeTierBlockedAddOn,
  resolveManagedUsageLeaseSeconds,
  processRequest,
  shouldOfferGenericWebSearchTool,
} from './request-processor';
import * as requestProcessorModule from './request-processor';
import {
  WEB_SEARCH_INJECTION_PROVIDERS,
  providerInjectsWebSearchTool,
} from '@/lib/web-search-support';

const GENERIC_SEARCH_FALLBACK_MODEL = requireProviderDefaultModel('deepseek');
const ANTHROPIC_PLATFORM_FETCH_MODEL = (() => {
  const model = listCanonicalModels().find(
    (candidate) =>
      candidate.provider === 'anthropic' &&
      candidate.providerCompatibility?.nativeWebFetch === false,
  );
  if (!model) throw new Error('Canonical Anthropic platform-fetch fixture is missing');
  return model.id;
})();
const FREE_NATIVE_SEARCH_MODEL = (() => {
  const model = getAllowedModelsForTier('economy')
    .map((modelId) => getModelMetadataById(modelId))
    .find(
      (candidate) =>
        candidate?.provider === 'google' &&
        candidate.tierPolicy?.minTier === 'free' &&
        candidate.capabilities.search === true,
    );
  if (!model) throw new Error('Canonical Free native-search fixture is missing');
  return model.id;
})();

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
    expect(request.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringMatching(/always call an appropriate available tool/i),
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

  it('rejects non-streaming web_search on a generic-fallback provider before reserving credits', async () => {
    const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'ws-nostream-1',
        'x-agi-surface': 'web',
      },
      body: JSON.stringify({
        model: GENERIC_SEARCH_FALLBACK_MODEL,
        messages: [{ role: 'user', content: 'What is the latest news today?' }],
        web_search: true,
        stream: false,
      }),
    });

    const result = await processRequest(request, {
      ok: true,
      userId: 'user-pro',
      token: 'session-token',
      subscription: {
        id: 'sub-pro',
        user_id: 'user-pro',
        plan_tier: 'pro',
        status: 'active',
        current_period_start: new Date('2026-07-01T00:00:00Z'),
        current_period_end: new Date('2026-08-01T00:00:00Z'),
        stripe_subscription_id: 'stripe-sub-pro',
        stripe_price_id: 'stripe-price-pro',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(422);
      await expect(result.response.json()).resolves.toMatchObject({
        error: { code: 'web_search_stream_required', param: 'stream' },
      });
    }
  });
});

describe('free-trial capability gate, model-agnostic web search', () => {
  const freeSubscription = {
    id: 'sub-free',
    user_id: 'user-free',
    plan_tier: 'free',
    status: 'active' as const,
    current_period_start: new Date('2026-07-01T00:00:00Z'),
    current_period_end: new Date('2026-08-01T00:00:00Z'),
    stripe_subscription_id: 'stripe-sub-free',
    stripe_price_id: 'stripe-price-free',
  };

  const freeTrialRequest = (body: Record<string, unknown>, key: string) =>
    new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
        'x-agi-surface': 'web',
      },
      body: JSON.stringify(body),
    });

  it('admits provider-native web search on a Free/Basic model', async () => {
    const result = await processRequest(
      freeTrialRequest(
        {
          model: FREE_NATIVE_SEARCH_MODEL,
          messages: [{ role: 'user', content: 'What is the latest news today?' }],
          web_search: true,
          stream: false,
        },
        'free-ws-1',
      ),
      { ok: true, userId: 'user-free', token: 'session-token', subscription: freeSubscription },
    );

    expect(result.ok).toBe(true);
  });

  it('automatically enables web search for a current-information request when the client omits the toggle', async () => {
    const result = await processRequest(
      freeTrialRequest(
        {
          model: FREE_NATIVE_SEARCH_MODEL,
          messages: [{ role: 'user', content: 'What are the latest AI headlines today?' }],
          stream: false,
        },
        'free-ws-auto-1',
      ),
      { ok: true, userId: 'user-free', token: 'session-token', subscription: freeSubscription },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolvedTaskType).toBe('research');
      expect(result.chatRequest.web_search).toBe(true);
      expect(result.llmRequest.tools).toContainEqual({ google_search: {} });
    }
  });

  it('preserves an explicit web-search opt-out on a current-information request', async () => {
    const result = await processRequest(
      freeTrialRequest(
        {
          model: FREE_NATIVE_SEARCH_MODEL,
          messages: [{ role: 'user', content: 'What are the latest AI headlines today?' }],
          web_search: false,
          stream: false,
        },
        'free-ws-auto-opt-out-1',
      ),
      { ok: true, userId: 'user-free', token: 'session-token', subscription: freeSubscription },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolvedTaskType).toBe('research');
      expect(result.chatRequest.web_search).toBe(false);
      expect(result.llmRequest.tools).toBeUndefined();
    }
  });

  it('does not attach search tools to an ordinary chat request', async () => {
    const result = await processRequest(
      freeTrialRequest(
        {
          model: FREE_NATIVE_SEARCH_MODEL,
          messages: [{ role: 'user', content: 'Explain how a binary search works.' }],
          stream: false,
        },
        'free-ws-auto-chat-1',
      ),
      { ok: true, userId: 'user-free', token: 'session-token', subscription: freeSubscription },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolvedTaskType).not.toBe('research');
      expect(result.chatRequest.web_search).toBeUndefined();
      expect(result.llmRequest.tools).toBeUndefined();
    }
  });

  it('refuses a free-trial capability the selected model lacks, naming the way out', async () => {
    const unsupportedModel = getAllowedModelsForTier('economy').find((modelId) => {
      const metadata = getModelMetadataById(modelId);
      return (
        metadata?.tierPolicy?.minTier === 'free' && metadata.capabilities.codeExecution !== true
      );
    });
    expect(unsupportedModel).toBeDefined();

    const result = await processRequest(
      freeTrialRequest(
        {
          model: unsupportedModel!,
          messages: [{ role: 'user', content: 'Run this snippet and show the output.' }],
          code_execution: true,
          stream: false,
        },
        'free-cap-code-exec-1',
      ),
      { ok: true, userId: 'user-free', token: 'session-token', subscription: freeSubscription },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = (await result.response.json()) as {
        error: { code: string; message: string };
      };
      expect(result.response.status).toBe(400);
      expect(body.error.code).toBe('free_trial_model_capability');
      expect(body.error.message).toContain('code execution');
      expect(body.error.message).toMatch(/Pick a model that does|turn that option off/i);
    }
  });

  it('keeps the other Free models able to satisfy every gated capability', async () => {
    const GATED = ['search', 'codeExecution', 'thinking', 'vision'] as const;
    const freeModels = getAllowedModelsForTier('economy').filter(
      (modelId) => getModelMetadataById(modelId)?.tierPolicy?.minTier === 'free',
    );

    for (const cap of GATED) {
      const supported = freeModels.filter(
        (modelId) =>
          (getModelMetadataById(modelId)?.capabilities as Record<string, boolean> | undefined)?.[
            cap
          ] === true,
      );
      expect(
        supported.length,
        `no Free model supports ${cap}, the composer offers a dead end`,
      ).toBeGreaterThan(0);
    }
  });
});

describe('resolveManagedUsageLeaseSeconds', () => {
  it('keeps ordinary chat leases short', () => {
    expect(resolveManagedUsageLeaseSeconds({})).toBe(900);
    expect(resolveManagedUsageLeaseSeconds({ work_mode: 'chat' })).toBe(900);
  });

  it('protects every turn that can run as a durable workflow from premature recovery', () => {
    expect(resolveManagedUsageLeaseSeconds({ work_mode: 'agiwork' })).toBe(86_400);
    expect(resolveManagedUsageLeaseSeconds({ work_mode: 'chat', web_search: true })).toBe(86_400);
    expect(resolveManagedUsageLeaseSeconds({ code_execution: true })).toBe(86_400);
    expect(
      resolveManagedUsageLeaseSeconds({
        tools: [{ type: 'function', function: { name: 'read_file' } }],
      }),
    ).toBe(86_400);
    expect(resolveManagedUsageLeaseSeconds({ tools: [] })).toBe(900);
  });
});

describe('appendWebSearchTool', () => {
  const caps = { search: true };

  it('injects the current Anthropic web_search server tool with direct callers', () => {
    const tools = appendWebSearchTool('anthropic', undefined, caps);
    expect(tools).toEqual([
      {
        type: 'web_search_20260209',
        name: 'web_search',
        allowed_callers: ['direct'],
        max_uses: 3,
      },
    ]);
  });

  it('allows a larger Anthropic search budget only for Deep Research', () => {
    expect(appendWebSearchTool('anthropic', undefined, caps, { researchMode: true })).toEqual([
      {
        type: 'web_search_20260209',
        name: 'web_search',
        allowed_callers: ['direct'],
        max_uses: 20,
      },
    ]);
  });

  it('drives the Anthropic max_uses from AGI_NATIVE_SEARCH_MAX_USES when set', () => {
    const original = process.env['AGI_NATIVE_SEARCH_MAX_USES'];
    process.env['AGI_NATIVE_SEARCH_MAX_USES'] = '7';
    try {
      const tools = appendWebSearchTool('anthropic', undefined, caps);
      expect(tools).toEqual([
        {
          type: 'web_search_20260209',
          name: 'web_search',
          allowed_callers: ['direct'],
          max_uses: 7,
        },
      ]);
    } finally {
      if (original === undefined) delete process.env['AGI_NATIVE_SEARCH_MAX_USES'];
      else process.env['AGI_NATIVE_SEARCH_MAX_USES'] = original;
    }
  });

  it('injects the Google google_search tool', () => {
    expect(appendWebSearchTool('google', undefined, caps)).toEqual([{ google_search: {} }]);
  });

  it('keeps grounding when the pool is unspecified or available', () => {
    expect(appendWebSearchTool('google', undefined, caps)).toEqual([{ google_search: {} }]);
    expect(
      appendWebSearchTool('google', undefined, caps, { googleGroundingPoolAvailable: true }),
    ).toEqual([{ google_search: {} }]);
  });

  it('routes to the Perplexity fallback once the grounding pool is spent and a key is configured', () => {
    const original = process.env['PERPLEXITY_API_KEY'];
    process.env['PERPLEXITY_API_KEY'] = 'test-key';
    try {
      const tools = appendWebSearchTool('google', undefined, caps, {
        googleGroundingPoolAvailable: false,
      });
      expect(tools).toHaveLength(1);
      expect((tools?.[0] as { type?: string })?.type).toBe('function');
      expect((tools?.[0] as { function?: { name?: string } })?.function?.name).toBe('web_search');
    } finally {
      if (original === undefined) delete process.env['PERPLEXITY_API_KEY'];
      else process.env['PERPLEXITY_API_KEY'] = original;
    }
  });

  it('keeps grounding when the pool is spent but no fallback backend is configured', () => {
    const original = process.env['PERPLEXITY_API_KEY'];
    delete process.env['PERPLEXITY_API_KEY'];
    try {
      expect(
        appendWebSearchTool('google', undefined, caps, { googleGroundingPoolAvailable: false }),
      ).toEqual([{ google_search: {} }]);
    } finally {
      if (original !== undefined) process.env['PERPLEXITY_API_KEY'] = original;
    }
  });

  it('injects the stable OpenAI Responses web_search tool', () => {
    expect(appendWebSearchTool('openai', undefined, caps)).toEqual([{ type: 'web_search' }]);
  });

  it.each(['xai', 'qwen', 'moonshot', 'deepseek', 'perplexity'])(
    'does NOT inject a tool for %s (no native path on this route, WP4 generic tool covers it)',
    (provider) => {
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

describe('resolveWebFetchTools', () => {
  type ResolveWebFetchTools = (options: {
    providerLower: string;
    model: string;
    tools: unknown[] | undefined;
    toolsCapable: boolean;
    stream: boolean | undefined;
  }) => unknown[] | undefined;

  it('uses AGI url_fetch when catalog metadata disables the Anthropic native tool', () => {
    const resolveWebFetchTools = (
      requestProcessorModule as unknown as {
        resolveWebFetchTools?: ResolveWebFetchTools;
      }
    ).resolveWebFetchTools;

    expect(resolveWebFetchTools).toBeTypeOf('function');
    const tools = resolveWebFetchTools?.({
      providerLower: 'anthropic',
      model: ANTHROPIC_PLATFORM_FETCH_MODEL,
      tools: undefined,
      toolsCapable: true,
      stream: true,
    });

    expect(tools).toContainEqual(
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: 'url_fetch' }),
      }),
    );
    expect(tools).not.toContainEqual(expect.objectContaining({ name: 'web_fetch' }));
  });
});

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

  it.each(['xai', 'deepseek', 'qwen', 'moonshot', 'zhipu', 'minimax'])(
    'is true for %s (no native path) with every other condition satisfied',
    (providerLower) => {
      expect(shouldOfferGenericWebSearchTool({ ...baseArgs, providerLower })).toBe(true);
    },
  );

  it.each(['anthropic', 'google', 'openai', 'perplexity', 'managed_cloud'])(
    'is false for %s, native/resolved path already covers it, no fallback needed',
    (providerLower) => {
      expect(shouldOfferGenericWebSearchTool({ ...baseArgs, providerLower })).toBe(false);
    },
  );

  it('is false when the resolved model is not tools-capable', () => {
    expect(shouldOfferGenericWebSearchTool({ ...baseArgs, toolsCapable: false })).toBe(false);
  });

  it('is false on a non-streaming request (offer ⊆ run, only streaming enters the tool loop)', () => {
    expect(shouldOfferGenericWebSearchTool({ ...baseArgs, stream: false })).toBe(false);
    expect(shouldOfferGenericWebSearchTool({ ...baseArgs, stream: undefined })).toBe(false);
  });

  it('is true on a free-tier request when the backend is configured', () => {
    expect(
      shouldOfferGenericWebSearchTool({ ...baseArgs, providerLower: 'xai', freeTrial: true }),
    ).toBe(true);
  });

  it('is false when no search backend is configured, never offer a tool the server cannot execute', () => {
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

describe('processRequest CPST route identity', () => {
  const freeSubscription = {
    id: 'sub-free',
    user_id: 'user-free',
    plan_tier: 'free',
    status: 'active' as const,
    current_period_start: new Date('2026-07-01T00:00:00Z'),
    current_period_end: new Date('2026-08-01T00:00:00Z'),
    stripe_subscription_id: 'stripe-sub-free',
    stripe_price_id: 'stripe-price-free',
  };

  it('carries an interim-labelled route plan id and the classified task family', async () => {
    const result = await processRequest(
      new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'free-cpst-route-1',
          'x-agi-surface': 'web',
        },
        body: JSON.stringify({
          model: FREE_NATIVE_SEARCH_MODEL,
          messages: [{ role: 'user', content: 'Say hello.' }],
          stream: false,
        }),
      }),
      { ok: true, userId: 'user-free', token: 'session-token', subscription: freeSubscription },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.routePlanId).toMatch(/^interim:/);
      expect(result.routePlanId?.split(':').length).toBeGreaterThanOrEqual(4);
      expect(result.resolvedTaskType).toBeTruthy();
      expect(typeof result.classifierConfidence).toBe('number');
      expect(result.retries).toBeUndefined();
    }
  });
});
