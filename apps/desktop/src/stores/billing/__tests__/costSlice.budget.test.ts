import { CREDITS_PER_USD } from '@agiworkforce/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke,
}));

import { cloudAccountAuth } from '../../../services/cloudAccountAuth';
import { createCostSlice, type CostSlice } from '../costSlice';

type TauriMockModule = typeof import('../../../lib/tauri-mock');

function costStore(): CostSlice {
  let state = {} as CostSlice;
  const set = (partial: Partial<CostSlice> | ((s: CostSlice) => Partial<CostSlice>)) => {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
  };
  state = createCostSlice(set, () => state);
  return state;
}

describe('cost slice monthly budget', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    vi.spyOn(cloudAccountAuth, 'getUser').mockReturnValue({ id: 'user-1' } as never);
  });

  it('sends the native command the one argument it takes', async () => {
    await costStore().setMonthlyBudget(25 * CREDITS_PER_USD);

    expect(invoke).toHaveBeenCalledWith('chat_set_monthly_budget', { amount: 25 });
    expect(invoke).toHaveBeenCalledWith('chat_get_cost_overview', { userId: 'user-1' });
  });

  it('clears the budget with an explicit null', async () => {
    await costStore().setMonthlyBudget(undefined);

    expect(invoke).toHaveBeenCalledWith('chat_set_monthly_budget', { amount: null });
  });
});
