import { describe, expect, it } from 'vitest';

import { modelRegistry } from '@agiworkforce/model-registry';

import { resolveAutoRoute, type AutoRoutingRequest } from '../auto';

const policy = modelRegistry.policies.auto;
const TIERS = ['free', 'basic', 'hobby', 'pro', 'max', 'enterprise', 'byok', 'nonsense'] as const;
const TASKS = ['simple_chat', 'general', 'coding', 'reasoning', 'multimodal', 'research'] as const;

/** Slots admitted for the free ceiling but for no paid tier. */
const FREE_ONLY_SLOTS = Object.entries(policy.tierAllowedSlots)
  .filter(([tier]) => tier !== 'free')
  .reduce(
    (freeOnly, [, slots]) => freeOnly.filter((slot) => !(slots as string[]).includes(slot)),
    [...(policy.tierAllowedSlots.free as string[])],
  );

function ask(overrides: Partial<AutoRoutingRequest> = {}): AutoRoutingRequest {
  return {
    selection: 'auto-economy',
    taskType: 'simple_chat',
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
    ...overrides,
  };
}

function decide(request: AutoRoutingRequest): string {
  const decision = resolveAutoRoute(request);
  return decision.status === 'selected'
    ? `${decision.routeId}|${decision.reason}|${decision.fallbacks.map((f) => f.routeId).join(',')}`
    : `unavailable:${decision.code}`;
}

describe('the free-only slots exist and are genuinely free-only', () => {
  it('names at least one slot no paid tier admits', () => {
    expect(FREE_ONLY_SLOTS.length).toBeGreaterThan(0);
  });
});

/**
 * Requirement: absent, the input changes nothing for anyone. This is what keeps
 * the TS/Rust conformance fixture at its committed values and lets the Rust
 * resolver stay untouched — it has no counterpart because the default path is
 * the only path it ever replays.
 */
describe('absent preference is a no-op', () => {
  it.each(TIERS)('resolves identically with and without an empty preference for %s', (tier) => {
    for (const taskType of TASKS) {
      const base = decide(ask({ subscriptionTier: tier, taskType }));
      expect(decide(ask({ subscriptionTier: tier, taskType, preferSlots: [] }))).toBe(base);
      expect(decide(ask({ subscriptionTier: tier, taskType, preferSlots: undefined }))).toBe(base);
    }
  });

  it('resolves identically for an absent tier', () => {
    for (const taskType of TASKS) {
      const base = decide(ask({ taskType }));
      expect(decide(ask({ taskType, preferSlots: [] }))).toBe(base);
    }
  });
});

/**
 * Requirement: reorder-only. The preference is intersected with the tier's own
 * `tierAllowedSlots` entry, so there is no input that can make a tier reach a
 * slot it could not already reach.
 */
describe('preference can never widen admission', () => {
  it('cannot grant a paid tier a slot only the free ceiling admits', () => {
    for (const tier of ['pro', 'max', 'enterprise', 'byok'] as const) {
      for (const taskType of TASKS) {
        const base = decide(ask({ subscriptionTier: tier, taskType }));
        expect(
          decide(ask({ subscriptionTier: tier, taskType, preferSlots: FREE_ONLY_SLOTS })),
          `${tier}/${taskType}`,
        ).toBe(base);
      }
    }
  });

  it('cannot grant the free ceiling a slot only paid tiers admit', () => {
    const paidOnly = (policy.tierAllowedSlots.max as string[]).filter(
      (slot) => !(policy.tierAllowedSlots.free as string[]).includes(slot),
    );
    expect(paidOnly.length).toBeGreaterThan(0);
    for (const taskType of TASKS) {
      const base = decide(ask({ subscriptionTier: 'free', taskType }));
      expect(decide(ask({ subscriptionTier: 'free', taskType, preferSlots: paidOnly }))).toBe(base);
    }
  });

  it('ignores a slot id that does not exist at all', () => {
    const base = decide(ask({ subscriptionTier: 'free' }));
    expect(decide(ask({ subscriptionTier: 'free', preferSlots: ['no_such_slot'] }))).toBe(base);
  });

  it('still refuses a preferred slot whose model lacks an intrinsic capability', () => {
    // Multimodal needs vision, which the free workhorse slots lack. Preferring
    // them changes nothing: preference orders the candidates, admission still
    // decides which may serve, so the request lands where it always did.
    //
    // Deliberately an INTRINSIC capability. A harness-feature requirement is
    // not a counterexample: with a `runtimeProfileId` set, `evaluateEligibility`
    // reads the feature off the runtime profile rather than the harness, so the
    // web surface's own server-side search satisfies `research` for any model.
    expect(
      decide(
        ask({ subscriptionTier: 'free', taskType: 'multimodal', preferSlots: FREE_ONLY_SLOTS }),
      ),
    ).toBe(decide(ask({ subscriptionTier: 'free', taskType: 'multimodal' })));
  });
});

/**
 * Requirement: the intended effect. With the preference supplied, a free-ceiling
 * request heads its plan with the free slot — which is the whole mechanism.
 */
describe('preference reorders within the admitted set', () => {
  it('heads a free-ceiling plan with the preferred free slot', () => {
    const head = FREE_ONLY_SLOTS[0]!;
    const modelKey = policy.slots[head as keyof typeof policy.slots]!.modelKey;
    const decision = resolveAutoRoute(
      ask({ subscriptionTier: 'free', taskType: 'simple_chat', preferSlots: [head] }),
    );
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.modelKey).toBe(modelKey);
  });

  it('keeps the previously-preferred model reachable behind it', () => {
    const before = resolveAutoRoute(ask({ subscriptionTier: 'free' }));
    const after = resolveAutoRoute(ask({ subscriptionTier: 'free', preferSlots: FREE_ONLY_SLOTS }));
    expect(before.status === 'selected' && after.status === 'selected').toBe(true);
    if (before.status !== 'selected' || after.status !== 'selected') return;
    expect(after.modelKey).not.toBe(before.modelKey);
    expect(after.fallbacks.map((route) => route.modelKey)).toContain(before.modelKey);
  });

  it('does not reorder anything for a tier that does not admit the preferred slot', () => {
    const base = decide(ask({ subscriptionTier: 'pro' }));
    expect(decide(ask({ subscriptionTier: 'pro', preferSlots: FREE_ONLY_SLOTS }))).toBe(base);
  });
});
