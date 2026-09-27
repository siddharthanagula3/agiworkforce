import { describe, expect, it } from 'vitest';
import {
  getNextUpgradeTier,
  managedUsageBucketLabel,
  parseManagedUsageSummaryResponse,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';

import {
  blockingUsageWindow,
  describeUsageNotice,
  planQuotaRecovery,
  purchasedCreditsView,
  quotaBlockWindow,
  quotaWarningFromSignal,
  usageLimitNotice,
  usageWarning,
  usageWindowViews,
} from '../src/features/side-panel/usageWindows';

const NOW = Date.parse('2026-09-27T12:00:00.000Z');
const FIVE_HOUR_RESET = '2026-09-27T14:00:00.000Z';
const WEEKLY_RESET = '2026-09-30T12:00:00.000Z';
const PERIOD_RESET = '2026-10-01T00:00:00.000Z';

interface WindowFixture {
  allowance: number;
  used: number;
  remaining: number;
  reset_at: string | null;
}

function creditWindow(allowance: number, used: number, resetAt: string | null): WindowFixture {
  return { allowance, used, remaining: Math.max(0, allowance - used), reset_at: resetAt };
}

function summary(
  overrides: {
    fiveHour?: WindowFixture;
    weekly?: WindowFixture;
    monthly?: WindowFixture;
    flagshipWeekly?: WindowFixture | null;
    purchased?: { remaining: number | null; overage_enabled: boolean };
    credits?: false;
    percentages?: { session: number; weekly: number; period: number };
  } = {},
): ManagedUsageSummaryResponse {
  const percentages = overrides.percentages ?? { session: 12, weekly: 30, period: 20 };
  return parseManagedUsageSummaryResponse({
    plan_tier: 'pro',
    usage_percentage: percentages.period,
    usage_reset_at: PERIOD_RESET,
    has_usage_remaining: true,
    period_start: '2026-09-01T00:00:00.000Z',
    period_end: PERIOD_RESET,
    subscription_status: 'active',
    session_usage_percentage: percentages.session,
    session_reset_at: FIVE_HOUR_RESET,
    weekly_usage_percentage: percentages.weekly,
    weekly_reset_at: WEEKLY_RESET,
    flagship_weekly_usage_percentage: 0,
    flagship_weekly_reset_at: WEEKLY_RESET,
    ...(overrides.credits === false
      ? {}
      : {
          credits: {
            five_hour: overrides.fiveHour ?? creditWindow(50, 6, FIVE_HOUR_RESET),
            weekly: overrides.weekly ?? creditWindow(500, 150, WEEKLY_RESET),
            monthly: overrides.monthly ?? creditWindow(2_000, 400, PERIOD_RESET),
            flagship_weekly:
              overrides.flagshipWeekly === undefined
                ? creditWindow(100, 10, WEEKLY_RESET)
                : overrides.flagshipWeekly,
            purchased: overrides.purchased ?? { remaining: 1_200, overage_enabled: true },
          },
        }),
  });
}

describe('usage windows in credits', () => {
  it('states every window the server sends in credits, flagship after the week', () => {
    const views = usageWindowViews(summary());

    expect(views.map((view) => view.bucket)).toEqual([
      'session',
      'weekly',
      'weeklyFlagship',
      'period',
    ]);
    expect(views.map((view) => view.label)).toEqual(
      views.map((view) => managedUsageBucketLabel(view.bucket)),
    );
    expect(views[0]).toMatchObject({
      detail: 'Used 6 of 50 credits · 44 left',
      usedPercent: 12,
      resetAt: FIVE_HOUR_RESET,
      exhausted: false,
      reading: { allowanceCredits: 50, usedCredits: 6, percentRemaining: 88 },
    });
    expect(views[3]?.detail).toBe('Used 400 of 2,000 credits · 1,600 left');
    for (const view of views) expect(view.detail).not.toMatch(/\$|%/u);
  });

  it('keeps fractional credits instead of rounding small usage away', () => {
    const [session] = usageWindowViews(
      summary({ fiveHour: creditWindow(50, 0.4, FIVE_HOUR_RESET) }),
    );

    expect(session?.detail).toBe('Used 0.4 of 50 credits · 49.6 left');
  });

  it('omits the flagship window for a plan that has none', () => {
    const views = usageWindowViews(summary({ flagshipWeekly: null }));

    expect(views.map((view) => view.bucket)).toEqual(['session', 'weekly', 'period']);
  });

  it('marks a window exhausted only when a real allowance is used up', () => {
    const views = usageWindowViews(
      summary({
        fiveHour: creditWindow(50, 50, FIVE_HOUR_RESET),
        weekly: creditWindow(500, 499.5, WEEKLY_RESET),
        monthly: creditWindow(0, 0, PERIOD_RESET),
      }),
    );

    expect(views.find((view) => view.bucket === 'session')).toMatchObject({
      exhausted: true,
      usedPercent: 100,
    });
    expect(views.find((view) => view.bucket === 'weekly')?.exhausted).toBe(false);
    expect(views.find((view) => view.bucket === 'period')).toMatchObject({
      exhausted: false,
      usedPercent: 0,
    });
  });

  it('falls back to the percentages when the server states no credits', () => {
    const views = usageWindowViews(
      summary({ credits: false, percentages: { session: 100, weekly: 64, period: 20 } }),
    );

    expect(views.map((view) => [view.bucket, view.detail, view.exhausted])).toEqual([
      ['session', 'None left', true],
      ['weekly', '36% left', false],
      ['period', '80% left', false],
    ]);
    expect(views[0]?.resetAt).toBe(FIVE_HOUR_RESET);
    expect(views[0]?.reading.allowanceCredits).toBeUndefined();
  });
});

describe('purchased credits', () => {
  it('shows the balance in credits and says whether it can be spent', () => {
    expect(purchasedCreditsView(summary())).toEqual({
      balance: '1,200 credits',
      overageEnabled: true,
      spendable: true,
    });
    expect(
      purchasedCreditsView(summary({ purchased: { remaining: 1_200, overage_enabled: false } })),
    ).toMatchObject({ overageEnabled: false, spendable: false });
    expect(
      purchasedCreditsView(summary({ purchased: { remaining: 0, overage_enabled: true } })),
    ).toMatchObject({ balance: '0 credits', spendable: false });
  });

  it('says nothing is known rather than zero when the balance could not be read', () => {
    expect(
      purchasedCreditsView(summary({ purchased: { remaining: null, overage_enabled: true } })),
    ).toEqual({ balance: null, overageEnabled: true, spendable: false });
  });

  it('claims no purchased balance when the server states no credits', () => {
    expect(purchasedCreditsView(summary({ credits: false }))).toBeNull();
  });
});

describe('the limit that stops a send', () => {
  const exhaustedSessionAndWeek = () =>
    usageWindowViews(
      summary({
        fiveHour: creditWindow(50, 50, FIVE_HOUR_RESET),
        weekly: creditWindow(500, 500, WEEKLY_RESET),
        flagshipWeekly: creditWindow(100, 100, '2026-10-04T12:00:00.000Z'),
      }),
    );

  it('binds on the exhausted window that reopens last, never the flagship share', () => {
    expect(blockingUsageWindow(exhaustedSessionAndWeek())?.bucket).toBe('weekly');
    expect(blockingUsageWindow(usageWindowViews(summary()))).toBeNull();
  });

  it('says which allowance was used and when it resets', () => {
    const [session] = usageWindowViews(
      summary({ fiveHour: creditWindow(50, 50, FIVE_HOUR_RESET) }),
    );
    const notice = usageLimitNotice(session!, NOW);

    expect(notice).toMatchObject({ bucket: 'session', severity: 'critical' });
    expect(describeUsageNotice(notice!)).toBe(
      'You have used your 50 credits for this 5-hour window. Resets in 2 hours.',
    );
  });

  it('points a plan-limit code at the window it names, else at the binding window', () => {
    const views = exhaustedSessionAndWeek();

    expect(quotaBlockWindow(views, 'rolling_five_hour_limit_reached')?.bucket).toBe('session');
    expect(quotaBlockWindow(views, 'flagship_weekly_limit_reached')?.bucket).toBe('weeklyFlagship');
    expect(quotaBlockWindow(views, 'monthly_credit_limit_reached')?.bucket).toBe('period');
    expect(quotaBlockWindow(views, 'free_trial_token_budget_reached')?.bucket).toBe('weekly');
  });
});

describe('usage warnings before a limit', () => {
  it('warns from the credit windows once one runs low', () => {
    const warning = usageWarning(
      usageWindowViews(summary({ fiveHour: creditWindow(50, 40, FIVE_HOUR_RESET) })),
      NOW,
    );

    expect(warning).toMatchObject({ bucket: 'session', severity: 'warning' });
    expect(describeUsageNotice(warning!)).toBe(
      'You have used 40 of your 50 credits for this 5-hour window. Resets in 2 hours.',
    );
    expect(usageWarning(usageWindowViews(summary()), NOW)).toBeNull();
  });

  it('turns the gateway quota header into a warning on the window it names', () => {
    const views = usageWindowViews(summary());

    const weekly = quotaWarningFromSignal(views, { scope: 'rolling_weekly', usedPercent: 92 }, NOW);
    expect(weekly).toMatchObject({ bucket: 'weekly', severity: 'critical' });
    expect(describeUsageNotice(weekly!)).toBe(
      'You have used 460 of your 500 credits for this week. Resets in 3 days.',
    );

    expect(
      quotaWarningFromSignal(views, { scope: 'billing_period', usedPercent: 80 }, NOW),
    ).toMatchObject({ bucket: 'period', severity: 'warning' });
    expect(
      quotaWarningFromSignal(views, { scope: 'rolling_five_hour', usedPercent: 50 }, NOW),
    ).toBeNull();
  });
});

describe('limit recovery by plan', () => {
  it('sends individual self-serve plans to buy credits', () => {
    for (const plan of SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER) {
      expect(planQuotaRecovery(plan), plan).toEqual({
        action: 'top_up',
        href: '/settings/billing',
      });
    }
  });

  it('sends Free to plans, and a plan with no self-serve step to its usage', () => {
    expect(getNextUpgradeTier('free')).not.toBeNull();
    expect(planQuotaRecovery('free')).toEqual({ action: 'upgrade', href: '/pricing' });
    for (const plan of ['team', 'enterprise']) {
      expect(getNextUpgradeTier(plan), plan).toBeNull();
      expect(planQuotaRecovery(plan), plan).toEqual({
        action: 'view_usage',
        href: '/settings/usage',
      });
    }
  });
});
