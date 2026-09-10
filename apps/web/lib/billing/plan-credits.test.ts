import { describe, expect, it } from 'vitest';
import { PLAN_CREDIT_ALLOWANCES, getPlanCreditAllowance } from './plan-credits';

describe('PLAN_CREDIT_ALLOWANCES', () => {
  it('pins the public free-tier allowance', () => {
    expect(getPlanCreditAllowance('free')).toEqual({
      monthly: 5,
      weekly: 3.75,
      fiveHour: 1.25,
      flagshipWeekly: null,
      unlimited: false,
    });
  });

  it('pins the public basic allowance', () => {
    expect(getPlanCreditAllowance('basic')).toEqual({
      monthly: 100,
      weekly: 25,
      fiveHour: 5,
      flagshipWeekly: null,
      unlimited: false,
    });
  });

  it('pins the public pro allowance', () => {
    expect(getPlanCreditAllowance('pro')).toEqual({
      monthly: 500,
      weekly: 125,
      fiveHour: 25,
      flagshipWeekly: 37.5,
      unlimited: false,
    });
  });

  it('pins the public max allowance', () => {
    expect(getPlanCreditAllowance('max')).toEqual({
      monthly: 2_500,
      weekly: 625,
      fiveHour: 125,
      flagshipWeekly: 187.5,
      unlimited: false,
    });
  });

  it('pins the public max_15x allowance', () => {
    expect(getPlanCreditAllowance('max_15x')).toEqual({
      monthly: 7_500,
      weekly: 1_875,
      fiveHour: 375,
      flagshipWeekly: 562.5,
      unlimited: false,
    });
  });

  it('pins the public per-seat team allowance', () => {
    expect(getPlanCreditAllowance('team')).toEqual({
      monthly: 500,
      weekly: 125,
      fiveHour: 25,
      flagshipWeekly: 37.5,
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
      ['local-only', 'byok', 'free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'].sort(),
    );
  });
});
