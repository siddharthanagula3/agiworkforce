import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  DEFAULT_RESEARCH_MAX_QUERY_REWRITES,
  createQueryRewriteBudget,
  isQueryRewrite,
  queryRewriteBudgetExhaustedMessage,
} from '../research-loop';

const PLAN = [
  'EU AI Act enforcement timeline',
  'EU AI Act penalties for general purpose models',
  'EU AI Act national supervisory authorities',
];

describe('isQueryRewrite', () => {
  it('accepts a search that runs a planned query as written', () => {
    expect(isQueryRewrite('EU AI Act enforcement timeline', PLAN)).toBe(false);
  });

  it('accepts a reworded query that still covers a planned angle', () => {
    expect(isQueryRewrite('enforcement timeline of the EU AI Act', PLAN)).toBe(false);
  });

  it('counts a query that covers no planned angle as a rewrite', () => {
    expect(isQueryRewrite('best espresso machines under 500', PLAN)).toBe(true);
  });

  it('counts nothing as a rewrite when the run has no plan to deviate from', () => {
    expect(isQueryRewrite('best espresso machines under 500', [])).toBe(false);
  });

  it('ignores an empty query', () => {
    expect(isQueryRewrite('   ', PLAN)).toBe(false);
  });
});

describe('createQueryRewriteBudget', () => {
  it('caps rewrites at the configured bound and never at the plan size', () => {
    const budget = createQueryRewriteBudget(2);

    expect(budget.admit('off plan one', PLAN)).toBe(true);
    expect(budget.admit('off plan two', PLAN)).toBe(true);
    expect(budget.admit('off plan three', PLAN)).toBe(false);
    expect(budget.used).toBe(2);
  });

  it('spends nothing on searches that run the plan', () => {
    const budget = createQueryRewriteBudget(1);

    for (const planned of PLAN) expect(budget.admit(planned, PLAN)).toBe(true);
    expect(budget.used).toBe(0);
    expect(budget.admit('off plan', PLAN)).toBe(true);
    expect(budget.admit('off plan again', PLAN)).toBe(false);
  });

  it('refuses every rewrite when the bound is zero', () => {
    const budget = createQueryRewriteBudget(0);

    expect(budget.admit('off plan', PLAN)).toBe(false);
    expect(budget.admit(PLAN[0]!, PLAN)).toBe(true);
  });

  it('is bounded independently of the plan step cap', () => {
    expect(DEFAULT_RESEARCH_MAX_QUERY_REWRITES).toBeLessThan(PLAN.length * 2);
    const budget = createQueryRewriteBudget(DEFAULT_RESEARCH_MAX_QUERY_REWRITES);
    for (let i = 0; i < DEFAULT_RESEARCH_MAX_QUERY_REWRITES; i += 1) {
      expect(budget.admit(`unrelated topic ${i}`, PLAN)).toBe(true);
    }
    expect(budget.admit('one more unrelated topic', PLAN)).toBe(false);
  });
});

describe('queryRewriteBudgetExhaustedMessage', () => {
  it('names the bound and the way out', () => {
    const message = queryRewriteBudgetExhaustedMessage(4);
    expect(message).toContain('4');
    expect(message).toContain('DROP');
  });
});
