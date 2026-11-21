import { ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';
import { ageSettingValue } from '../src/features/settings/ageSettingValue';

describe('ageSettingValue', () => {
  it('names the minimum for a device with a current adult result', () => {
    expect(ageSettingValue('confirmed', ACCOUNT_MINIMUM_AGE)).toBe('18 or older');
  });

  it('says Under the minimum for a refused device', () => {
    expect(ageSettingValue('refused', ACCOUNT_MINIMUM_AGE)).toBe('Under 18');
  });

  it('says Not set while the person still has to be asked, or without a usable threshold', () => {
    expect(ageSettingValue('required', ACCOUNT_MINIMUM_AGE)).toBe('Not set');
    expect(ageSettingValue('confirmed', Number.NaN)).toBe('Not set');
  });
});
