import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  ledgerCentsFromMicrousd,
  microusdFromLedgerCents,
  resolveSettlementMicrousd,
} from '@/lib/services/credit-service';
import {
  getPlanFlagshipWeeklyUsageCapMicrousd,
  getPlanSessionUsageCapMicrousd,
  getPlanSessionUsageCapCents,
  getPlanWeeklyUsageCapMicrousd,
  getPlanWeeklyUsageCapCents,
  getPlanFlagshipWeeklyUsageCapCents,
  MICROUSD_PER_LEDGER_CENT,
} from '@/lib/server/managed-usage-policy';
import { LLMCostCalculator, type TokenUsage } from '@/lib/services/llm-cost-calculator';

const PLANS = ['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'] as const;

/** A cheap real catalog model, so the arithmetic runs against published prices. */
const MODEL = LLMCostCalculator.getAvailableModels()[0] as string;

function usageOf(promptTokens: number, completionTokens: number): TokenUsage {
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

describe('microUSD unit conversion', () => {
  it('scales cents by exactly ten thousand', () => {
    expect(microusdFromLedgerCents(1)).toBe(10_000);
    expect(microusdFromLedgerCents(1000)).toBe(10_000_000);
    expect(microusdFromLedgerCents(-3)).toBe(-30_000);
  });

  it('rounds the cents mirror half-up in both directions, as the SQL helper does', () => {
    expect(ledgerCentsFromMicrousd(0)).toBe(0);
    expect(ledgerCentsFromMicrousd(4_999)).toBe(0);
    expect(ledgerCentsFromMicrousd(5_000)).toBe(1);
    expect(ledgerCentsFromMicrousd(9_000)).toBe(1);
    expect(ledgerCentsFromMicrousd(90_000)).toBe(9);
    expect(ledgerCentsFromMicrousd(-14_000)).toBe(-1);
    expect(ledgerCentsFromMicrousd(-15_000)).toBe(-1);
    expect(ledgerCentsFromMicrousd(-16_000)).toBe(-2);
  });

  it('reads a settlement in whichever unit the caller supplied', () => {
    expect(
      resolveSettlementMicrousd({ userId: 'u', idempotencyKey: 'k', amountMicrousd: 900 }),
    ).toBe(900);
    expect(resolveSettlementMicrousd({ userId: 'u', idempotencyKey: 'k', amountCents: 7 })).toBe(
      70_000,
    );
  });
});

describe('anti-arbitrage', () => {
  it('charges the same for split work as for one call of the same size', () => {
    const SPLIT_CALLS = 100;
    const perCall = 900;
    const split = perCall * SPLIT_CALLS;
    const bulk = 90_000;
    expect(Math.abs(split - bulk)).toBeLessThanOrEqual(100);
  });

  it('rounds each charge up by at most one microUSD, so splitting cannot pay less', () => {
    const oneCall = LLMCostCalculator.calculateCostMicrousd(
      'anthropic',
      MODEL,
      usageOf(100_000, 10_000),
    );
    const hundredCalls =
      LLMCostCalculator.calculateCostMicrousd('anthropic', MODEL, usageOf(1_000, 100)) * 100;
    expect(hundredCalls).toBeGreaterThanOrEqual(oneCall);
    expect(hundredCalls - oneCall).toBeLessThanOrEqual(100);
  });

  it('charges nothing for zero tokens and at least one microUSD for any token', () => {
    expect(LLMCostCalculator.calculateCostMicrousd('anthropic', MODEL, usageOf(0, 0))).toBe(0);
    expect(
      LLMCostCalculator.calculateCostMicrousd('anthropic', MODEL, usageOf(1, 0)),
    ).toBeGreaterThanOrEqual(1);
    expect(
      LLMCostCalculator.calculateCostMicrousd('anthropic', MODEL, usageOf(0, 1)),
    ).toBeGreaterThanOrEqual(1);
  });

  it('no longer floors a sub-cent turn at a whole cent', () => {
    const microusd = LLMCostCalculator.calculateCostMicrousd('anthropic', MODEL, usageOf(1, 0));
    expect(microusd).toBeLessThan(MICROUSD_PER_LEDGER_CENT);
    expect(LLMCostCalculator.calculateCost('anthropic', MODEL, usageOf(1, 0))).toBe(1);
  });

  it('prices a list-route turn in microUSD wherever it prices one in cents', () => {
    const usage = usageOf(50_000, 5_000);
    const cents = LLMCostCalculator.calculateListCost(MODEL, usage);
    const microusd = LLMCostCalculator.calculateListCostMicrousd(MODEL, usage);
    if (cents === null) {
      expect(microusd).toBeNull();
      return;
    }
    expect(microusd).not.toBeNull();
    expect(ledgerCentsFromMicrousd(microusd as number)).toBeLessThanOrEqual(cents);
  });
});

describe('plan ceilings are unchanged by the unit', () => {
  it('scales every cap by exactly ten thousand, null staying null', () => {
    for (const plan of PLANS) {
      const pairs = [
        [getPlanSessionUsageCapCents(plan), getPlanSessionUsageCapMicrousd(plan)],
        [getPlanWeeklyUsageCapCents(plan), getPlanWeeklyUsageCapMicrousd(plan)],
        [getPlanFlagshipWeeklyUsageCapCents(plan), getPlanFlagshipWeeklyUsageCapMicrousd(plan)],
      ] as const;
      for (const [cents, microusd] of pairs) {
        if (cents === null) {
          expect(microusd).toBeNull();
          continue;
        }
        expect(microusd).toBe(cents * MICROUSD_PER_LEDGER_CENT);
      }
    }
  });

  it('holds the Pro ceilings the rolling windows are measured against', () => {
    expect(getPlanSessionUsageCapMicrousd('pro')).toBe(500_000);
    expect(getPlanWeeklyUsageCapMicrousd('pro')).toBe(2_500_000);
    expect(getPlanFlagshipWeeklyUsageCapMicrousd('pro')).toBe(750_000);
  });

  it('keeps an uncapped tier uncapped and a zero-budget tier at zero', () => {
    expect(getPlanSessionUsageCapMicrousd('enterprise')).toBeNull();
    expect(getPlanWeeklyUsageCapMicrousd('enterprise')).toBeNull();
    expect(getPlanSessionUsageCapMicrousd('free')).toBe(0);
    expect(getPlanWeeklyUsageCapMicrousd('free')).toBe(0);
  });

  it('grants a ten dollar top-up as ten million microUSD and a thousand cents', () => {
    const TOP_UP_CENTS = 1_000;
    expect(microusdFromLedgerCents(TOP_UP_CENTS)).toBe(10_000_000);
    expect(ledgerCentsFromMicrousd(microusdFromLedgerCents(TOP_UP_CENTS))).toBe(TOP_UP_CENTS);
  });
});

describe('overage headroom', () => {
  const requestService = fs.readFileSync(
    path.resolve(import.meta.dirname, '..', 'managed-usage-request-service.ts'),
    'utf8',
  );

  it('is the lesser of what is left and what was purchased, never more, in microUSD', () => {
    expect(requestService).toContain('greatest(');
    expect(requestService).toContain(
      'least(\n                  credits.credits_allocated_microusd - credits.credits_used_microusd,\n                  credits.top_up_allocated_microusd\n                ), 0) as headroom_microusd',
    );
    // A plan allowance the customer did not buy must never fund overage.
    expect(requestService).not.toContain('credits_allocated_microusd as headroom_microusd');
  });

  it('treats an unreadable headroom as none rather than as unlimited', () => {
    expect(requestService).toContain('Overage headroom lookup failed; treating as no headroom');
    expect(requestService).toMatch(/catch \(error\) \{[\s\S]{0,220}return 0;/);
  });
});
