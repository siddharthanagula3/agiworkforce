import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ loggerWarn: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: (...args: unknown[]) => mocks.loggerWarn(...args),
  },
}));

import { resolveWebCloudModelRoute } from './request-processor';
import { resolveProviderFromModel } from '@/lib/services/provider-adapter-service';

const MINIMAX_MODEL_ID = 'minimax-m3';
const OPEN_ROUTER_MINIMAX_ROUTE_ID = 'open_router/minimax-m3';
const MISMATCHED_ROUTE_ID = 'anthropic/claude-sonnet-5';
const MANAGED_CLOUD_TRUST_MODE = 'managed_cloud';
const PRO_SUBSCRIPTION_TIER = 'pro';
const GENERAL_TASK_TYPE = 'general';

const savedOpenRouterKey = process.env['OPENROUTER_API_KEY'];
const savedMinimaxKey = process.env['MINIMAX_API_KEY'];

beforeEach(() => {
  mocks.loggerWarn.mockReset();
  process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
  delete process.env['MINIMAX_API_KEY'];
});

afterEach(() => {
  if (savedOpenRouterKey === undefined) delete process.env['OPENROUTER_API_KEY'];
  else process.env['OPENROUTER_API_KEY'] = savedOpenRouterKey;
  if (savedMinimaxKey === undefined) delete process.env['MINIMAX_API_KEY'];
  else process.env['MINIMAX_API_KEY'] = savedMinimaxKey;
});

describe('dispatch follows the route the resolver selected', () => {
  it('dispatches openrouter when the resolver selects the OpenRouter route for minimax-m3', () => {
    const decision = resolveWebCloudModelRoute(
      MINIMAX_MODEL_ID,
      PRO_SUBSCRIPTION_TIER,
      GENERAL_TASK_TYPE,
      undefined,
      undefined,
      { preferredRouteId: OPEN_ROUTER_MINIMAX_ROUTE_ID },
    );

    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.routeId).toBe(OPEN_ROUTER_MINIMAX_ROUTE_ID);

    const provider = resolveProviderFromModel(decision.modelKey, decision.routeId, {
      trustMode: MANAGED_CLOUD_TRUST_MODE,
    });

    expect(provider).toBe('openrouter');
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('falls back to the default provider resolution when the route id belongs to a different model', () => {
    const decision = resolveWebCloudModelRoute(
      MINIMAX_MODEL_ID,
      PRO_SUBSCRIPTION_TIER,
      GENERAL_TASK_TYPE,
    );
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;

    const provider = resolveProviderFromModel(decision.modelKey, MISMATCHED_ROUTE_ID, {
      trustMode: MANAGED_CLOUD_TRUST_MODE,
    });

    expect(provider).toBe(resolveProviderFromModel(decision.modelKey));
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: MISMATCHED_ROUTE_ID,
        model: MINIMAX_MODEL_ID,
        reason: 'model_mismatch',
      }),
      expect.stringContaining('Rejected selected route'),
    );
  });
});
