
import { describe, expect, it } from 'vitest';
import { getDefaultModelFor, getRoutingSlotModel } from '@agiworkforce/types';
import {
  COMPUTER_USE_MODEL,
  resolveComputerUseModel,
} from '../src/features/computer-use/cloudAgentClient';

describe('resolveComputerUseModel', () => {
  it('uses the tier-agnostic computer_use slot when the tier is unknown', () => {
    expect(COMPUTER_USE_MODEL).toBe(getRoutingSlotModel('computer_use'));
    expect(resolveComputerUseModel(null)).toBe(COMPUTER_USE_MODEL);
    expect(resolveComputerUseModel(undefined)).toBe(COMPUTER_USE_MODEL);
    expect(resolveComputerUseModel('')).toBe(COMPUTER_USE_MODEL);
  });

  it('gives a tier entitled to the premium slot the premium automation model', () => {
    expect(resolveComputerUseModel('max')).toBe(getRoutingSlotModel('computer_use_premium'));
    expect(resolveComputerUseModel('max')).not.toBe(COMPUTER_USE_MODEL);
  });

  it('defers to the canonical catalog helper for every tier it is given', () => {
    for (const tier of ['free', 'pro', 'max', 'enterprise']) {
      expect(resolveComputerUseModel(tier)).toBe(getDefaultModelFor(tier, 'computer-use'));
    }
  });

  it('degrades to the default rather than throwing on an unrecognized tier', () => {
    expect(() => resolveComputerUseModel('not-a-real-tier')).not.toThrow();
    expect(typeof resolveComputerUseModel('not-a-real-tier')).toBe('string');
  });
});
