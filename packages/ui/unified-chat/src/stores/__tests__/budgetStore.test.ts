import { beforeEach, describe, expect, it } from 'vitest';

import {
  useBudgetStore,
  selectBudget,
  selectBudgetPercentage,
  selectActiveActions,
  selectVisibleAlerts,
  formatTokens,
} from '../budgetStore';

function reset() {
  useBudgetStore.setState({
    budget: { enabled: false, currentUsage: 0, limit: 0, periodEnd: 0 },
    budgetAlerts: [],
    actionTrail: [],
  });
}

describe('budgetStore', () => {
  beforeEach(reset);

  describe('setBudget / addTokenUsage', () => {
    it('patches partial snapshot fields', () => {
      useBudgetStore.getState().setBudget({ enabled: true, limit: 1_000_000 });
      const b = selectBudget(useBudgetStore.getState());
      expect(b.enabled).toBe(true);
      expect(b.limit).toBe(1_000_000);
      expect(b.currentUsage).toBe(0);
    });

    it('addTokenUsage no-ops when disabled', () => {
      useBudgetStore.getState().setBudget({ enabled: false, limit: 1000 });
      useBudgetStore.getState().addTokenUsage(500);
      expect(selectBudget(useBudgetStore.getState()).currentUsage).toBe(0);
    });

    it('addTokenUsage accumulates when enabled', () => {
      useBudgetStore.getState().setBudget({ enabled: true, limit: 1000 });
      useBudgetStore.getState().addTokenUsage(250);
      useBudgetStore.getState().addTokenUsage(750);
      expect(selectBudget(useBudgetStore.getState()).currentUsage).toBe(1000);
    });
  });

  describe('selectBudgetPercentage', () => {
    it('returns 0 when limit is 0 (unlimited)', () => {
      useBudgetStore.getState().setBudget({ enabled: true, currentUsage: 500, limit: 0 });
      expect(selectBudgetPercentage(useBudgetStore.getState())).toBe(0);
    });

    it('clamps to 100 when over budget', () => {
      useBudgetStore.getState().setBudget({ enabled: true, currentUsage: 1500, limit: 1000 });
      expect(selectBudgetPercentage(useBudgetStore.getState())).toBe(100);
    });

    it('returns the correct percentage', () => {
      useBudgetStore.getState().setBudget({ enabled: true, currentUsage: 750, limit: 1000 });
      expect(selectBudgetPercentage(useBudgetStore.getState())).toBe(75);
    });
  });

  describe('alerts', () => {
    it('pushes + dismisses alerts', () => {
      useBudgetStore.getState().pushAlert({ type: 'warning', message: 'Almost out' });
      const visible1 = selectVisibleAlerts(useBudgetStore.getState());
      expect(visible1).toHaveLength(1);
      const id = visible1[0]!.id;
      useBudgetStore.getState().dismissAlert(id);
      expect(selectVisibleAlerts(useBudgetStore.getState())).toHaveLength(0);
    });

    it('clearAlerts wipes the list', () => {
      useBudgetStore.getState().pushAlert({ type: 'warning', message: 'one' });
      useBudgetStore.getState().pushAlert({ type: 'danger', message: 'two' });
      useBudgetStore.getState().clearAlerts();
      expect(useBudgetStore.getState().budgetAlerts).toHaveLength(0);
    });
  });

  describe('action trail', () => {
    it('selects only active types (thinking/searching/coding/running)', () => {
      const s = useBudgetStore.getState();
      s.pushAction({ type: 'thinking', message: 't' });
      s.pushAction({ type: 'completed', message: 'done' });
      s.pushAction({ type: 'running', message: 'r' });
      s.pushAction({ type: 'error', message: 'oops' });
      const active = selectActiveActions(useBudgetStore.getState());
      expect(active.map((a) => a.type)).toEqual(['thinking', 'running']);
    });

    it('clearActionTrail wipes the list', () => {
      useBudgetStore.getState().pushAction({ type: 'thinking', message: 't' });
      useBudgetStore.getState().clearActionTrail();
      expect(useBudgetStore.getState().actionTrail).toHaveLength(0);
    });
  });
});

describe('formatTokens', () => {
  it('formats <1k as raw count', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('formats k range', () => {
    expect(formatTokens(1000)).toBe('1.0K');
    expect(formatTokens(1500)).toBe('1.5K');
    expect(formatTokens(999_999)).toBe('1000.0K');
  });

  it('formats m range', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(2_500_000)).toBe('2.5M');
  });
});
