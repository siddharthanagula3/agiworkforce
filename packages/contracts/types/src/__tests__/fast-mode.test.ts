import { describe, expect, it } from 'vitest';
import {
  FAST_MODE_BLOCK_MESSAGES,
  fastModeNeedsUsageCreditsCheck,
  resolveFastModeAvailability,
  type FastModeConditions,
} from '../fast-mode';

const open: FastModeConditions = {
  offersFast: true,
  paidPlan: true,
  workspaceBlocks: false,
  usageCreditsOn: true,
};

describe('resolveFastModeAvailability', () => {
  it('allows a paid plan with usage credits on', () => {
    expect(resolveFastModeAvailability(open)).toEqual({ allowed: true, block: null });
  });

  it('offers nothing for a model without a fast tier', () => {
    expect(resolveFastModeAvailability({ ...open, offersFast: false })).toEqual({
      allowed: false,
      block: null,
    });
  });

  it('blocks a free plan before anything else', () => {
    expect(
      resolveFastModeAvailability({
        ...open,
        paidPlan: false,
        workspaceBlocks: true,
        usageCreditsOn: false,
      }),
    ).toEqual({ allowed: false, block: 'paid_plan' });
  });

  it('blocks a workspace that turned fast mode off', () => {
    expect(resolveFastModeAvailability({ ...open, workspaceBlocks: true })).toEqual({
      allowed: false,
      block: 'workspace',
    });
  });

  it('blocks when usage credits are off and lets the server decide when unknown', () => {
    expect(resolveFastModeAvailability({ ...open, usageCreditsOn: false }).block).toBe(
      'usage_credits',
    );
    expect(resolveFastModeAvailability({ ...open, usageCreditsOn: null }).allowed).toBe(true);
  });

  it('never allows an unresolved plan and gives no reason for it', () => {
    expect(resolveFastModeAvailability({ ...open, paidPlan: null })).toEqual({
      allowed: false,
      block: null,
    });
  });

  it('checks usage credits only once the plan and workspace allow fast mode', () => {
    expect(fastModeNeedsUsageCreditsCheck(open)).toBe(true);
    expect(fastModeNeedsUsageCreditsCheck({ ...open, paidPlan: null })).toBe(false);
    expect(fastModeNeedsUsageCreditsCheck({ ...open, workspaceBlocks: true })).toBe(false);
    expect(fastModeNeedsUsageCreditsCheck({ ...open, offersFast: false })).toBe(false);
  });

  it('keeps one message per block', () => {
    expect(Object.keys(FAST_MODE_BLOCK_MESSAGES).sort()).toEqual([
      'paid_plan',
      'usage_credits',
      'workspace',
    ]);
  });
});
