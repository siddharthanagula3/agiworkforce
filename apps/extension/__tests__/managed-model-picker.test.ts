import { describe, expect, it } from 'vitest';
import { getRoutingSlotModel } from '@agiworkforce/types';
import {
  formatManagedTierLabel,
  getManagedModelBadgeLabel,
  getManagedModelPickerOptions,
  isFreeManagedTier,
  reconcileManagedModelSelection,
} from '../src/features/cloud-bridge/managedModelPicker';

const admittedModel = getRoutingSlotModel('general_fast');

describe('managed model picker', () => {
  it('shows only Auto before authenticated admission is loaded', () => {
    expect(getManagedModelPickerOptions(null)).toEqual([{ value: 'auto', label: 'Best (auto)' }]);
  });

  it('intersects server admission with the bundled capability catalog', () => {
    const options = getManagedModelPickerOptions({
      subscriptionTier: 'pro',
      modelIds: [admittedModel, 'provider/future-model-not-in-this-build'],
      allowedAutoModes: ['auto-economy', 'auto-balanced'],
    });

    expect(options.map((option) => option.value)).toEqual(['auto', admittedModel]);
    expect(options[1]).toMatchObject({ provider: expect.any(String), label: expect.any(String) });
  });

  it('resets stale manual and named Auto selections while preserving admitted choices', () => {
    const access = {
      subscriptionTier: 'pro',
      modelIds: [admittedModel],
      allowedAutoModes: ['auto-economy'],
    };

    expect(reconcileManagedModelSelection('auto', access)).toBe('auto');
    expect(reconcileManagedModelSelection(admittedModel, access)).toBe(admittedModel);
    expect(reconcileManagedModelSelection('auto-economy', access)).toBe('auto-economy');
    expect(reconcileManagedModelSelection('auto-premium', access)).toBe('auto');
    expect(reconcileManagedModelSelection('provider/removed', access)).toBe('auto');
    expect(reconcileManagedModelSelection(admittedModel, null)).toBe('auto');
  });

  it('derives labels and free-tier behavior without UI hardcoding', () => {
    expect(getManagedModelBadgeLabel(admittedModel)).not.toBe(admittedModel);
    expect(isFreeManagedTier('FREE')).toBe(true);
    expect(isFreeManagedTier('hobby')).toBe(true);
    expect(isFreeManagedTier('pro')).toBe(false);
    expect(formatManagedTierLabel('enterprise')).toBe('Enterprise plan');
  });
});
