import { getPickerModels } from '@agiworkforce/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeChromeManagedChat,
  type ChromeManagedChatDependencies,
} from '../src/features/cloud-bridge/managedChatHandler';
import { FREE_TRIAL_MODEL, streamFreeChat } from '../src/features/cloud-bridge/freeTrialClient';

const SERVER_PLAN_REQUIRED = JSON.stringify({
  error: {
    code: 'free_trial_model_only',
    message: 'The selected model is not included in this plan.',
    usage_percentage: 37,
    usage_reset_at: '2026-11-01T00:00:00.000Z',
  },
});
const SERVER_LIMIT = JSON.stringify({
  error: {
    code: 'rolling_five_hour_limit_reached',
    message:
      'Your rolling 5-hour usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit.',
    usage_percentage: 100,
    usage_reset_at: '2026-11-01T00:00:00.000Z',
  },
});

function dependencies(subscriptionTier: string): ChromeManagedChatDependencies {
  return {
    getAuthToken: vi.fn(async () => 'token'),
    getModelAccess: vi.fn(async () => ({
      subscriptionTier,
      modelIds: getPickerModels().map((model) => model.id),
      allowedAutoModes: ['auto'],
    })),
    streamChat: vi.fn(async function* () {
      yield { type: 'text' as const, text: 'Admitted reply' };
      yield { type: 'done' as const };
    }),
    onText: vi.fn(),
  };
}

afterEach(() => vi.unstubAllGlobals());

async function serverRefusal(status: number, body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  );
  const chunks = [];
  for await (const chunk of streamFreeChat([{ role: 'user', content: 'Hello' }], 'token'))
    chunks.push(chunk);
  expect(chunks).toHaveLength(1);
  const refusal = chunks[0]!;
  if (refusal.type !== 'error')
    throw new Error('Expected the public stream to refuse the request.');
  return refusal;
}

function showsNoUsageDashboard(value: unknown): void {
  const rendered = JSON.stringify(value);
  expect(rendered).not.toMatch(/usage_percentage|usagePercentage|usage_reset_at|usageResetAt/);
}

describe('Chrome managed cloud follows the AGI Subscription', () => {
  it.each(['free', 'basic'])(
    'admits ordinary Chrome chat for %s with an admitted model',
    async (tier) => {
      const deps = dependencies(tier);
      const result = await executeChromeManagedChat(
        { id: 'stream-plan', text: 'Hello', modelSelection: FREE_TRIAL_MODEL },
        deps,
      );

      expect(result.status).toBe('success');
      expect(deps.streamChat).toHaveBeenCalledTimes(1);
      expect(deps.onText).toHaveBeenCalledWith('Admitted reply');
      showsNoUsageDashboard(result);
    },
  );

  it.each(['free', 'basic'])('refuses AGI Work for %s before inference', async (tier) => {
    const deps = dependencies(tier);
    const result = await executeChromeManagedChat(
      { id: 'stream-work', text: 'Hello', modelSelection: FREE_TRIAL_MODEL, workMode: 'agiwork' },
      deps,
    );
    expect(result).toMatchObject({ status: 'error', code: 'plan_required' });
    expect(deps.streamChat).not.toHaveBeenCalled();
    showsNoUsageDashboard(result);
  });

  it('refuses a model the account has not admitted before inference', async () => {
    const deps = dependencies('free');
    vi.mocked(deps.getModelAccess).mockResolvedValue({
      subscriptionTier: 'free',
      modelIds: [],
      allowedAutoModes: [],
    });
    const result = await executeChromeManagedChat(
      { id: 'stream-model', text: 'Hello', modelSelection: FREE_TRIAL_MODEL },
      deps,
    );
    expect(result).toMatchObject({ status: 'error', code: 'model_not_admitted' });
    expect(deps.streamChat).not.toHaveBeenCalled();
  });

  it('shows a server model-plan refusal through the public stream without usage counters', async () => {
    const refusal = await serverRefusal(403, SERVER_PLAN_REQUIRED);

    expect(refusal.code).toBe('plan_required');
    expect(refusal.message).toBe('The selected model is not included in this plan.');
    expect(refusal.message).not.toMatch(/not available for this AGI account/);
    showsNoUsageDashboard(refusal);
  });

  it('shows the server limit refusal through the public stream without usage counters', async () => {
    const refusal = await serverRefusal(429, SERVER_LIMIT);

    expect(refusal.code).toBe('quota_exceeded');
    expect(refusal.message).toMatch(/upgrade/i);
    showsNoUsageDashboard(refusal);
  });
});
