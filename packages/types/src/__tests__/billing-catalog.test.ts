import { describe, expect, it } from 'vitest';
import {
  getPlanPriceCents,
  getPlanUsageBudgetCents,
  getUsageBudgetCentsFromPriceCents,
  INCLUDED_USAGE_BUDGET_RATIO,
} from '../billing-catalog';

describe('billing catalog', () => {
  it('derives monthly included usage budget at 35% of plan price', () => {
    expect(getPlanPriceCents('pro')).toBe(2000);
    expect(getPlanUsageBudgetCents('pro')).toBe(700);

    expect(getPlanPriceCents('max')).toBe(10000);
    expect(getPlanUsageBudgetCents('max')).toBe(3500);
  });

  it('derives yearly included usage budget from yearly billed amount', () => {
    expect(getPlanPriceCents('pro', 'yearly')).toBe(20400);
    expect(getPlanUsageBudgetCents('pro', 'yearly')).toBe(7140);
  });

  it('returns zero for free and invalid plans', () => {
    expect(getPlanUsageBudgetCents('free')).toBe(0);
    expect(getPlanUsageBudgetCents('unknown-plan')).toBe(0);
  });

  it('rounds arbitrary price cents with the same ratio', () => {
    expect(INCLUDED_USAGE_BUDGET_RATIO).toBe(0.35);
    expect(getUsageBudgetCentsFromPriceCents(2999)).toBe(1050);
    expect(getUsageBudgetCentsFromPriceCents(5988)).toBe(2096);
  });
});
