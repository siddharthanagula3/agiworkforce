import { beforeEach, describe, expect, it } from 'vitest';
import { buildFreeTrialPaywallSlot, useFreeTrialStore } from './freeTrialStore';

describe('free trial client state', () => {
  beforeEach(() => {
    useFreeTrialStore.getState().clearLimitReached();
  });

  it('stores only the server-reported exhausted state, never usage numbers', () => {
    const initial = useFreeTrialStore.getState();
    expect(initial.limitReached).toBe(false);
    expect(initial).not.toHaveProperty('tokensUsed');
    expect(initial).not.toHaveProperty('tokenBudget');
    expect(initial).not.toHaveProperty('promptsUsed');
    expect(initial).not.toHaveProperty('promptLimit');

    initial.markLimitReached();
    expect(useFreeTrialStore.getState().limitReached).toBe(true);

    useFreeTrialStore.getState().clearLimitReached();
    expect(useFreeTrialStore.getState().limitReached).toBe(false);
  });

  it('offers the shared Basic tier when free hosted usage is exhausted', () => {
    expect(buildFreeTrialPaywallSlot('free_trial_token_budget_reached').requiredTier).toBe('basic');
  });
});
