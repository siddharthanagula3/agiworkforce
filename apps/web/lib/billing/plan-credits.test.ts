import { describe, expect, it } from 'vitest';
import { PLAN_CREDIT_ALLOWANCES, getPlanCreditAllowance } from '@agiworkforce/types';

describe('PLAN_CREDIT_ALLOWANCES', () => {
  it('pins the public free-tier allowance', () => {
    expect(getPlanCreditAllowance('free')).toEqual({
      monthly: 20,
      weekly: 15,
      fiveHour: 2,
      flagshipWeekly: null,
      unlimited: false,
    });
  });

  it('pins the public basic allowance', () => {
    expect(getPlanCreditAllowance('basic')).toEqual({
      monthly: 400,
      weekly: 100,
      fiveHour: 10,
      flagshipWeekly: null,
      unlimited: false,
    });
  });

  it('pins the public pro allowance', () => {
    expect(getPlanCreditAllowance('pro')).toEqual({
      monthly: 2_000,
      weekly: 500,
      fiveHour: 50,
      flagshipWeekly: 150,
      unlimited: false,
    });
  });

  it('pins the public max allowance', () => {
    expect(getPlanCreditAllowance('max')).toEqual({
      monthly: 10_000,
      weekly: 2_500,
      fiveHour: 250,
      flagshipWeekly: 750,
      unlimited: false,
    });
  });

  it('pins the public max_15x allowance', () => {
    expect(getPlanCreditAllowance('max_15x')).toEqual({
      monthly: 20_000,
      weekly: 5_000,
      fiveHour: 1_000,
      flagshipWeekly: 1_500,
      unlimited: false,
    });
  });

  it('pins the public per-seat team allowance', () => {
    expect(getPlanCreditAllowance('team')).toEqual({
      monthly: 2_000,
      weekly: 500,
      fiveHour: 50,
      flagshipWeekly: 150,
      unlimited: false,
    });
  });

  it('grants nothing for local-only and byok', () => {
    expect(getPlanCreditAllowance('local-only')).toEqual({
      monthly: 0,
      weekly: 0,
      fiveHour: 0,
      flagshipWeekly: null,
      unlimited: false,
    });
    expect(getPlanCreditAllowance('byok')).toEqual({
      monthly: 0,
      weekly: 0,
      fiveHour: 0,
      flagshipWeekly: null,
      unlimited: false,
    });
  });

  it('marks enterprise unlimited without a flagship split', () => {
    const enterprise = getPlanCreditAllowance('enterprise');
    expect(enterprise.unlimited).toBe(true);
    expect(enterprise.monthly).toBe(Infinity);
    expect(enterprise.flagshipWeekly).toBeNull();
  });

  it('covers every plan tier exactly once', () => {
    expect(Object.keys(PLAN_CREDIT_ALLOWANCES).sort()).toEqual(
      [
        'local-only',
        'byok',
        'free',
        'basic',
        'pro',
        'max',
        'max_15x',
        'team',
        'team_premium',
        'enterprise',
      ].sort(),
    );
  });
});
