import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { CREDITS_PER_USD, formatCredits } from '@agiworkforce/types';
type ScanModule0 = typeof import('../../../lib/tauri-mock');
type ScanModule1 = typeof import('../../../services/cloudAccountAuth');

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  invoke: mocks.invoke,
}));

vi.mock('../../../services/cloudAccountAuth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  cloudAccountAuth: { getUser: mocks.getUser },
}));

import { createBudgetSlice, type BudgetSlice } from '../budgetSlice';
import {
  createCostSlice,
  creditsFromProviderUsd,
  formatProviderCostCredits,
  providerUsdFromCredits,
  type CostSlice,
} from '../costSlice';

function costStore() {
  return create<CostSlice>()((set, get) =>
    createCostSlice(set as Parameters<typeof createCostSlice>[0], get),
  );
}

function budgetStore() {
  const store = create<BudgetSlice>()((set, get) =>
    createBudgetSlice(set as Parameters<typeof createBudgetSlice>[0], get),
  );
  store.getState().setBudgetLimit(1_000);
  store.getState().setWarningThreshold(80);
  store.getState().setBudgetEnabled(true);
  return store;
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.getUser.mockReset();
  mocks.getUser.mockReturnValue({ id: 'fixture-user' });
});

describe('provider cost in credits', () => {
  it('converts provider dollars at the shared credit rate', () => {
    expect(creditsFromProviderUsd(1)).toBe(CREDITS_PER_USD);
    expect(creditsFromProviderUsd(1 / CREDITS_PER_USD)).toBeCloseTo(1, 10);
    for (const unreadable of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(creditsFromProviderUsd(unreadable)).toBe(0);
    }
  });

  it('labels a cost in credits and never in dollars', () => {
    const providerUsd = 0.0123;

    expect(formatProviderCostCredits(providerUsd)).toBe(
      formatCredits(providerUsd * CREDITS_PER_USD, { maximumFractionDigits: 2 }),
    );
    expect(formatProviderCostCredits(providerUsd)).not.toContain('$');
    expect(formatProviderCostCredits(null)).toBe(formatCredits(0));
  });

  it('stores a credit limit as provider dollars to the cent', () => {
    const credits = 5 * CREDITS_PER_USD;

    expect(providerUsdFromCredits(credits)).toBe(5);
    expect(creditsFromProviderUsd(providerUsdFromCredits(credits))).toBe(credits);
    expect(String(providerUsdFromCredits(credits + 1))).toMatch(/^\d+(\.\d{1,2})?$/);
  });
});

describe('monthly credit limit', () => {
  it('sends the limit to the desktop ledger in provider dollars, then reloads the overview', async () => {
    const store = costStore();
    const overview = { today_total: 0, month_total: 0, monthly_budget: 10, remaining_budget: 10 };
    mocks.invoke.mockImplementation(async (command: string) =>
      command === 'chat_get_cost_overview' ? overview : undefined,
    );

    await store.getState().setMonthlyBudget(2 * CREDITS_PER_USD);

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'chat_set_monthly_budget', {
      userId: 'fixture-user',
      amount: 2,
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'chat_get_cost_overview', {
      userId: 'fixture-user',
    });
    expect(store.getState().costOverview).toEqual(overview);
  });

  it('clears the limit when no credit amount is given', async () => {
    const store = costStore();
    mocks.invoke.mockResolvedValue(undefined);

    await store.getState().setMonthlyBudget(undefined);

    expect(mocks.invoke).toHaveBeenCalledWith('chat_set_monthly_budget', {
      userId: 'fixture-user',
      amount: null,
    });
  });

  it('reports a refused limit instead of dropping it', async () => {
    const store = costStore();
    mocks.invoke.mockRejectedValue(new Error('Invalid budget amount'));

    await expect(store.getState().setMonthlyBudget(CREDITS_PER_USD)).rejects.toThrow(
      'Invalid budget amount',
    );
    expect(store.getState().costError).toContain('Invalid budget amount');
  });
});

describe('token budget alerts', () => {
  it.each([
    { tokens: 850, type: 'warning' },
    { tokens: 950, type: 'danger' },
    { tokens: 1_200, type: 'exceeded' },
  ] as const)('states the estimated spend of a $type alert in credits', ({ tokens, type }) => {
    const store = budgetStore();
    const costUsd = 0.25;

    store.getState().addDetailedTokenUsage({
      inputTokens: tokens - 100,
      outputTokens: 100,
      costUsd,
    });

    const alert = store.getState().budgetAlerts.find((candidate) => candidate.type === type);
    expect(alert?.message).toContain(`About ${formatProviderCostCredits(costUsd)}`);
    expect(alert?.message).toContain(formatCredits(costUsd * CREDITS_PER_USD));
    expect(alert?.message).not.toContain('$');
  });
});
