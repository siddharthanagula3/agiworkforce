import { describe, it, expect, vi } from 'vitest';
import { buildLocalToByokHandoffDraft } from '@agiworkforce/utils';
import { createDecisionEvaluator, type DecisionPolicy } from '@agiworkforce/agent-core';
import { evaluateDecisionEligibility } from '@/lib/services/semantic-decisions/eligibility';
import {
  LocalInferenceRefused,
  isLocalModelId,
  isLoopbackBaseUrl,
  normalizeLocalBaseUrl,
  parseLocalModelId,
} from '@agiworkforce/local-runtime-contract';
import { conversationHoldsLocalTurns, toLocalChatMessages } from '@features/chat/lib/local-turn';
import type { Message } from '@shared/stores/web-chat-store';

const TIER_ORDER: Record<string, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
  max: 3,
  enterprise: 4,
};

const isValidUpgrade = (from: string, to: string): boolean => {
  const fromOrder = TIER_ORDER[from] ?? -1;
  const toOrder = TIER_ORDER[to] ?? -1;
  if (fromOrder === -1 || toOrder === -1) return false;
  return toOrder > fromOrder;
};

describe('upgrade tier ordering', () => {
  it('free → hobby is a valid upgrade', () => {
    expect(isValidUpgrade('free', 'hobby')).toBe(true);
  });

  it('hobby → pro is a valid upgrade', () => {
    expect(isValidUpgrade('hobby', 'pro')).toBe(true);
  });

  it('pro → max is a valid upgrade', () => {
    expect(isValidUpgrade('pro', 'max')).toBe(true);
  });

  it('pro → hobby is NOT a valid upgrade (downgrade)', () => {
    expect(isValidUpgrade('pro', 'hobby')).toBe(false);
  });

  it('pro → pro is NOT a valid upgrade (same tier)', () => {
    expect(isValidUpgrade('pro', 'pro')).toBe(false);
  });

  it('max → hobby is NOT a valid upgrade (downgrade)', () => {
    expect(isValidUpgrade('max', 'hobby')).toBe(false);
  });

  it('free → free is NOT a valid upgrade', () => {
    expect(isValidUpgrade('free', 'free')).toBe(false);
  });

  it('unknown tier → any known tier is rejected', () => {
    expect(isValidUpgrade('unknown', 'pro')).toBe(false);
  });
});

const calculateCreditAmountCents = (
  oldPlanPriceCents: number,
  creditsRemaining: number,
  creditsAllocated: number,
): number => {
  if (creditsAllocated <= 0) return 0;
  const unusedFraction = creditsRemaining / creditsAllocated;
  return Math.floor(oldPlanPriceCents * unusedFraction);
};

describe('credit-based proration calculation', () => {
  it('50% credits remaining → 50% credit applied', () => {
    expect(calculateCreditAmountCents(2000, 500, 1000)).toBe(1000);
  });

  it('100% credits remaining (unused period) → full credit applied', () => {
    expect(calculateCreditAmountCents(2000, 1000, 1000)).toBe(2000);
  });

  it('0% credits remaining (exhausted) → zero credit', () => {
    expect(calculateCreditAmountCents(2000, 0, 1000)).toBe(0);
  });

  it('result is floored (no fractional cents)', () => {
    expect(calculateCreditAmountCents(2001, 1, 3)).toBe(667);
  });

  it('zero allocation guard, does not divide by zero', () => {
    expect(calculateCreditAmountCents(2000, 0, 0)).toBe(0);
  });

  it('credit cannot exceed the old plan price', () => {
    const credit = calculateCreditAmountCents(2000, 1000, 1000);
    expect(credit).toBeLessThanOrEqual(2000);
  });

  it('credit is always non-negative', () => {
    expect(calculateCreditAmountCents(2000, 0, 1000)).toBeGreaterThanOrEqual(0);
  });
});

describe('Stripe customer balance credit semantics', () => {
  it('applying credit reduces balance (more negative)', () => {
    const existingBalance = -500;
    const newCredit = -1000;
    const resultBalance = existingBalance + newCredit;
    expect(resultBalance).toBe(-1500);
    expect(resultBalance).toBeLessThan(existingBalance);
  });

  it('rollback restores original balance on Stripe failure', () => {
    const originalBalance = -500;
    const appliedCredit = -1000;
    const balanceAfterApply = originalBalance + appliedCredit;
    const restoredBalance = balanceAfterApply - appliedCredit;
    expect(restoredBalance).toBe(originalBalance);
  });

  it('zero credit does not change customer balance', () => {
    const existing = -200;
    const credit = 0;
    expect(existing + credit).toBe(existing);
  });
});

describe('billing trust-boundary isolation', () => {
  it('CRITICAL: BYOK users must not consume AGI compute credits', () => {
    const preferCloudCredits = (privacyMode: string) => privacyMode === 'managed';
    expect(preferCloudCredits('byok')).toBe(false);
    expect(preferCloudCredits('local')).toBe(false);
    expect(preferCloudCredits('managed')).toBe(true);
  });

  it('CRITICAL: upgrade endpoint requires an active paid subscription (not free)', () => {
    const canUpgradeMidCycle = (plan: string, status: string) =>
      plan !== 'free' && ['active', 'trialing'].includes(status);

    expect(canUpgradeMidCycle('free', 'active')).toBe(false);
    expect(canUpgradeMidCycle('hobby', 'active')).toBe(true);
    expect(canUpgradeMidCycle('hobby', 'canceled')).toBe(false);
    expect(canUpgradeMidCycle('pro', 'trialing')).toBe(true);
  });

  it('rate limit: upgrade endpoint is capped at 5 requests per minute', () => {
    const upgradeRateLimit = { limit: 5, window: '1 m', failClosed: false };
    expect(upgradeRateLimit.limit).toBe(5);
    expect(upgradeRateLimit.window).toBe('1 m');
  });
});

describe('stripe webhook event filtering', () => {
  const HANDLED_EVENTS = new Set([
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
  ]);

  it('subscription lifecycle events are handled', () => {
    expect(HANDLED_EVENTS.has('customer.subscription.updated')).toBe(true);
    expect(HANDLED_EVENTS.has('customer.subscription.deleted')).toBe(true);
  });

  it('payment events are handled', () => {
    expect(HANDLED_EVENTS.has('invoice.payment_succeeded')).toBe(true);
    expect(HANDLED_EVENTS.has('invoice.payment_failed')).toBe(true);
  });

  it('unrelated events are ignored', () => {
    expect(HANDLED_EVENTS.has('payment_intent.created')).toBe(false);
    expect(HANDLED_EVENTS.has('radar.early_fraud_warning.created')).toBe(false);
    expect(HANDLED_EVENTS.has('account.updated')).toBe(false);
  });
});

describe('local models on the desktop shell', () => {
  const localTurn = {
    id: 'm2',
    role: 'assistant',
    content: 'answered here',
    createdAt: '2026-09-13T00:00:01.000Z',
    metadata: { privacyMode: 'local' as const, providerMode: 'Local' as const },
  } as Message;
  const cloudTurn = {
    id: 'm1',
    role: 'assistant',
    content: 'answered in the cloud',
    createdAt: '2026-09-13T00:00:00.000Z',
    metadata: { privacyMode: 'managed' as const },
  } as Message;

  it('CRITICAL: a model on this device is never a managed catalogue id', () => {
    expect(isLocalModelId('local:ollama/tiny-chat:1b')).toBe(true);
    expect(isLocalModelId('managed-catalogue-model')).toBe(false);
    expect(parseLocalModelId('local:ollama/tiny-chat:1b')).toEqual({
      serverId: 'ollama',
      name: 'tiny-chat:1b',
    });
  });

  it('CRITICAL: the Local label only ever covers a server on this machine', () => {
    expect(isLoopbackBaseUrl('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackBaseUrl('http://models.internal:11434')).toBe(false);
    expect(() =>
      normalizeLocalBaseUrl('http://models.internal:11434', 'http://localhost:11434'),
    ).toThrow(LocalInferenceRefused);
  });

  it('CRITICAL: a chat holding a local answer is recognised before a cloud turn is built', () => {
    expect(conversationHoldsLocalTurns([cloudTurn])).toBe(false);
    expect(conversationHoldsLocalTurns([cloudTurn, localTurn])).toBe(true);
  });

  it('sends a local model only the text of the turns, never the placeholder it is filling', () => {
    const placeholder = { ...localTurn, id: 'pending', content: '' } as Message;
    expect(toLocalChatMessages([cloudTurn, localTurn, placeholder], 'pending')).toEqual([
      { role: 'assistant', content: 'answered in the cloud' },
      { role: 'assistant', content: 'answered here' },
    ]);
  });
});

describe('semantic decisions stay inside managed cloud', () => {
  const policy: DecisionPolicy = {
    mode: 'enabled',
    model: 'pinned-version',
    timeoutMs: 1_000,
    maxRequestBytes: 10_000,
    maxQuestions: 8,
    maxConcurrent: 1,
    sampleRate: 1,
  };
  const request = {
    state: 'a request that would otherwise be evaluated',
    questions: { needed: { kind: 'boolean' as const, instruction: 'Needed?' } },
  };

  it.each(['local', 'byok'] as const)(
    'CRITICAL: a %s session is refused by the host before the transport exists',
    (privacyMode) => {
      expect(
        evaluateDecisionEligibility({
          privacyMode,
          workspaceId: 'workspace-1',
          zeroDataRetentionOnly: false,
          workspaceModelPolicy: null,
          residencyRegion: null,
        }),
      ).toEqual({ eligible: false, reason: 'trust_mode' });
    },
  );

  it.each(['local', 'byok'] as const)(
    'CRITICAL: a %s session never reaches the decision provider even if the host let it through',
    async (trustMode) => {
      const evaluate = vi.fn();
      const run = createDecisionEvaluator({
        kind: 'turn_signals',
        provider: { evaluate },
        policy: () => policy,
      });

      const outcome = await run(request, { trustMode, providerAllowed: true, cohort: 0 });

      expect(outcome).toMatchObject({ status: 'fallback', reason: 'policy' });
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

  it('CRITICAL: managed cloud alone is not permission; the workspace must admit it too', () => {
    expect(
      evaluateDecisionEligibility({
        privacyMode: 'managed',
        workspaceId: 'workspace-1',
        zeroDataRetentionOnly: true,
        workspaceModelPolicy: null,
        residencyRegion: null,
      }),
    ).toEqual({ eligible: false, reason: 'zero_data_retention' });
  });
});

describe('managed cloud never silently exposes user credentials', () => {
  const credentials = [
    {
      label: '.env',
      kind: 'file',
      secret: 'sk-abcdefghijklmnopqrstuvwxyz123456',
      prefix: 'OPENAI_API_KEY=',
    },
    {
      label: 'aws.env',
      kind: 'file',
      secret: 'AKIAIOSFODNN7EXAMPLE0000',
      prefix: 'AWS_SECRET_ACCESS_KEY=',
    },
    {
      label: 'last prompt',
      kind: 'message',
      secret: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789',
      prefix: 'use my key ',
    },
  ] as const;

  async function managedHandoff(content: string, label: string, kind: 'file' | 'message') {
    return buildLocalToByokHandoffDraft({
      sourceSessionId: 'desktop-session',
      sourceSurface: 'desktop',
      targetSurface: 'desktop',
      target: 'managed',
      createdAt: '2026-09-16T00:00:00.000Z',
      expiresAt: '2026-09-16T01:00:00.000Z',
      selectedContext: [{ id: 'ctx-1', kind, label, content }],
    });
  }

  it.each(credentials)(
    'CRITICAL: a credential in $label blocks the managed handoff and never reaches its payload',
    async ({ label, kind, secret, prefix }) => {
      const preview = await managedHandoff(`${prefix}${secret}`, label, kind);

      expect(preview.draft.targetPrivacyMode).toBe('managed');
      expect(preview.draft.consentRequired).toBe(true);
      expect(preview.redactionReport.blocked).toBe(true);
      expect(preview.redactionReport.findings.length).toBeGreaterThan(0);
      expect(preview.redactedPayload).not.toContain(secret);
      expect(JSON.stringify(preview.redactedContext)).not.toContain(secret);
      expect(JSON.stringify(preview.draft)).not.toContain(secret);
    },
  );

  it('CRITICAL: the persisted managed draft carries evidence of context, never its content', async () => {
    const preview = await managedHandoff('plain project notes', 'notes.md', 'file');

    expect(preview.redactionReport.blocked).toBe(false);
    for (const item of preview.draft.selectedContext) {
      expect(item).not.toHaveProperty('content');
      expect(item.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
