import { beforeEach, describe, expect, it } from 'vitest';
import { isPaidCloudPlan, useAuthStore } from '../auth';

describe('desktop cloud plan entitlements', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
  });

  it.each(['local-only', 'byok', 'free'] as const)(
    'keeps the non-paid %s plan outside paid cloud entitlements',
    (plan) => {
      expect(isPaidCloudPlan(plan)).toBe(false);

      useAuthStore.getState().setPlan(plan);

      expect(useAuthStore.getState().isPro).toBe(false);
    },
  );

  it.each(['basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'] as const)(
    'recognizes the shared paid %s plan',
    (plan) => {
      expect(isPaidCloudPlan(plan)).toBe(true);

      useAuthStore.getState().setPlan(plan);

      expect(useAuthStore.getState().isPro).toBe(true);
    },
  );

  it('derives Max 15x and Team account updates from the same shared rule', () => {
    useAuthStore.getState().setAccount({ plan: 'max_15x' });
    expect(useAuthStore.getState().isPro).toBe(true);

    useAuthStore.getState().setAccount({ plan: 'team' });
    expect(useAuthStore.getState().isPro).toBe(true);
  });
});
