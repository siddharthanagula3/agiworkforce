import { usageWarningFromSnapshot } from '@/src/features/chat/components/UsageLimitBanner';
import type { UsageSnapshot } from '@/services/usage';

function snapshot(planTier: string): UsageSnapshot {
  return {
    planTier,
    usagePercentage: 0,
    usageResetAt: null,
    hasUsageRemaining: false,
    periodStart: null,
    periodEnd: null,
    subscriptionStatus: 'active',
    sessionUsagePercentage: 100,
    sessionResetAt: null,
    weeklyUsagePercentage: 0,
    weeklyResetAt: null,
    flagshipWeeklyUsagePercentage: 0,
    flagshipWeeklyResetAt: null,
    credits: {
      five_hour: { allowance: 2, used: 2, remaining: 0 },
    } as UsageSnapshot['credits'],
    limitPromotions: null,
  };
}

describe('usage warning from a usage snapshot', () => {
  it('tells a Free account it reached the Free limit, with no credit figure', () => {
    expect(usageWarningFromSnapshot(snapshot('free'))?.headline).toBe(
      "You've reached the Free limit for now",
    );
  });

  it('keeps stating a paid limit in credits', () => {
    expect(usageWarningFromSnapshot(snapshot('pro'))?.headline).toMatch(/credits/);
  });
});
