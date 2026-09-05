import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@agiworkforce/routing', () => ({
  classifyTaskLocally: vi.fn(() => ({ type: 'general', confidence: 0.8 })),
  resolveAutoRoute: vi.fn(),
}));
vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  return {
    ...actual,
    getSlotForModel: vi.fn(() => 'general_balanced_pro'),
  };
});
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn() },
}));
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  UPGRADE_HREF: '/pricing',
  fingerprintManagedUsageRequest: vi.fn(() => 'request-hash'),
  reserveManagedUsageRequest: vi.fn(),
  markManagedUsageProviderStarted: vi.fn(),
  finalizeManagedUsageRequest: vi.fn(),
  MANAGED_CHAT_CONTRACT_VERSION: '2026-07-15',
  ManagedUsageRequestError: class ManagedUsageRequestError extends Error {},
  createManagedUsageErrorBody: vi.fn(),
  markManagedUsageClientDelivered: vi.fn(),
  parseManagedUsageIdempotencyKey: vi.fn(),
  reserveManagedUsageProviderStep: vi.fn(async () => ({
    operationResult: 'covered',
    estimatedCostCents: 2,
  })),
  resolveManagedQuotaRecovery: vi.fn(),
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    estimateCost: vi.fn(() => 2),
    calculateCost: vi.fn(() => 3),
  },
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: vi.fn(),
  toGenericUpstreamError: vi.fn(),
  buildProtocolRouteAdapter: vi.fn(),
  listAvailableManagedProviderIds: vi.fn(() => new Set()),
  resolveProviderFromModel: vi.fn(() => 'anthropic'),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: vi.fn(),
}));
vi.mock('@agiworkforce/provider-protocol', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/provider-protocol')>();
  return {
    ...actual,
    openAIWireRequestToChatRequest: vi.fn((value) => value),
  };
});

import { resolveAutoRoute } from '@agiworkforce/routing';
import { getSlotForModel } from '@agiworkforce/types';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { executeScheduledAgent } from './scheduled-agent-executor';
import type { ScheduleTask } from './schedule-service';

const task: ScheduleTask = {
  id: 'task-1',
  userId: 'user-1',
  name: 'Briefing',
  description: null,
  scheduleType: 'cron',
  cronExpression: '0 9 * * *',
  executeAt: null,
  intervalMs: null,
  timezone: 'UTC',
  isEnabled: true,
  expiresAt: null,
  maxExecutions: null,
  executionCount: 1,
  actionType: 'agent',
  actionConfig: null,
  prompt: 'Write my briefing',
  model: 'auto-balanced',
  status: 'active',
  lastExecutedAt: null,
  nextExecutionAt: null,
  lastError: null,
  metadata: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const scopedDb = { query: vi.fn() } as never;
const executionScope = {
  db: scopedDb,
  userId: 'user-1',
  organizationId: '11111111-1111-4111-8111-111111111111',
};

describe('scheduled managed agent executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(SubscriptionService.getSubscription).mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
    } as never);
    vi.mocked(getSlotForModel).mockReturnValue('general_balanced_pro');
    vi.mocked(resolveAutoRoute).mockReturnValue({
      status: 'selected',
      requestedSelection: 'auto-balanced',
      requestedProfile: 'balanced',
      effectiveProfile: 'balanced',
      taskType: 'general',
      modelKey: 'model-key',
      provider: 'openai',
      providerModelId: 'provider-model-id',
      routeId: 'route-1',
      harnessId: 'managed/chat',
      fallbacks: [],
      reason: 'preferred_slot',
    });
    vi.mocked(reserveManagedUsageRequest).mockResolvedValue({
      db: { query: vi.fn() },
      userId: 'user-1',
      idempotencyKey: 'schedule-run:run-1',
      requestHash: 'request-hash',
      leaseToken: 'lease-1',
      estimatedCostCents: 2,
    } as never);
    vi.mocked(markManagedUsageProviderStarted).mockResolvedValue();
    vi.mocked(finalizeManagedUsageRequest).mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 3,
    });
    vi.mocked(buildServerProviderAdapter).mockReturnValue({
      stream: vi.fn(() => ({}) as never),
    } as never);
    vi.mocked(drainToLlmResponse).mockResolvedValue({
      model: 'model-key',
      content: 'Completed result',
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
    });
  });

  it('rejects unsupported action types instead of pretending they ran', async () => {
    await expect(
      executeScheduledAgent(
        { ...task, actionType: 'workflow' },
        new AbortController().signal,
        'run-1',
        executionScope,
      ),
    ).rejects.toThrow(/unsupported scheduled action/i);
    expect(buildServerProviderAdapter).not.toHaveBeenCalled();
  });

  it('rejects a claimed scope whose owner does not match the task', async () => {
    await expect(
      executeScheduledAgent(task, new AbortController().signal, 'run-1', {
        ...executionScope,
        userId: 'other-user',
      }),
    ).rejects.toThrow(/scope does not match/i);
    expect(SubscriptionService.getSubscription).not.toHaveBeenCalled();
  });

  it('fails closed when the requested model route is unavailable', async () => {
    vi.mocked(resolveAutoRoute).mockReturnValueOnce({
      status: 'unavailable',
      code: 'no_eligible_route',
      requestedSelection: 'auto-balanced',
      requestedProfile: 'balanced',
      effectiveProfile: 'balanced',
      taskType: 'general',
      reasons: ['no eligible route'],
    });

    await expect(
      executeScheduledAgent(task, new AbortController().signal, 'run-1', executionScope),
    ).rejects.toThrow(/not available/i);
  });

  it('blocks the provider call when the account has no available usage budget', async () => {
    vi.mocked(reserveManagedUsageRequest).mockRejectedValueOnce(
      new Error('Usage budget exhausted'),
    );

    await expect(
      executeScheduledAgent(task, new AbortController().signal, 'run-1', executionScope),
    ).rejects.toThrow(/budget/i);
    expect(buildServerProviderAdapter).not.toHaveBeenCalled();
  });

  it('skips, rather than crashes, a run for a delinquent enterprise subscription', async () => {
    vi.mocked(SubscriptionService.getSubscription).mockResolvedValueOnce({
      plan_tier: 'enterprise',
      status: 'canceled',
    } as never);

    const result = await executeScheduledAgent(
      task,
      new AbortController().signal,
      'run-skip',
      executionScope,
    );

    expect(result.billingStatus).toBe('subscription_inactive');
    expect(result.text).toContain('Scheduled execution skipped');
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
    expect(buildServerProviderAdapter).not.toHaveBeenCalled();
  });

  it('treats an inactive free record as free access, matching the managed chat gate', async () => {
    vi.mocked(SubscriptionService.getSubscription).mockResolvedValueOnce({
      plan_tier: 'free',
      status: 'canceled',
    } as never);

    await expect(
      executeScheduledAgent(task, new AbortController().signal, 'run-1', executionScope),
    ).resolves.toMatchObject({ text: 'Completed result' });
  });

  it('routes, executes, and durably settles actual usage under the run id', async () => {
    const signal = new AbortController().signal;
    const result = await executeScheduledAgent(task, signal, 'run-1', executionScope);

    expect(resolveAutoRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: 'auto-balanced',
        subscriptionTier: 'pro',
        trustMode: 'managed_cloud',
        runtimeProfileId: 'web/cloud-chat',
      }),
    );
    expect(buildServerProviderAdapter).toHaveBeenCalledWith('openai');
    expect(SubscriptionService.getSubscription).toHaveBeenCalledWith(scopedDb, 'user-1');
    expect(fingerprintManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: executionScope.organizationId }),
    );
    expect(reserveManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        db: scopedDb,
        userId: 'user-1',
        idempotencyKey: 'schedule-run:run-1',
        estimatedCostCents: 2,
        planTier: 'pro',
        isFlagship: false,
      }),
    );
    expect(markManagedUsageProviderStarted).toHaveBeenCalledOnce();
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'completed', actualCostCents: 3 }),
    );
    expect(result).toMatchObject({
      text: 'Completed result',
      model: 'model-key',
      provider: 'openai',
      billingStatus: 'succeeded',
    });
  });

  it('classifies a scheduled flagship route for the rolling flagship ceiling', async () => {
    vi.mocked(getSlotForModel).mockReturnValueOnce('flagship_general_pro_plus');

    await executeScheduledAgent(task, new AbortController().signal, 'run-flagship', executionScope);

    expect(reserveManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ isFlagship: true }),
    );
  });

  it('does not invent a one-cent minimum when catalog pricing rounds usage to zero', async () => {
    vi.mocked(LLMCostCalculator.calculateCost).mockReturnValueOnce(0);

    await executeScheduledAgent(task, new AbortController().signal, 'run-zero', executionScope);

    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ actualCostCents: 0, outcome: 'completed' }),
    );
  });

  it('releases a reservation when provider execution fails', async () => {
    vi.mocked(drainToLlmResponse).mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(
      executeScheduledAgent(task, new AbortController().signal, 'run-failed', executionScope),
    ).rejects.toThrow(/provider unavailable/i);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
    );
  });
});
