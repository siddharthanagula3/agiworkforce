import type { AgeGateRecord } from '../src/features/auth/services/ageGate';
import { ageSettingValue } from '../src/features/settings/ageSettingValue';

const record = (overrides: Partial<AgeGateRecord>): AgeGateRecord => ({
  confirmed: true,
  isMinor: false,
  confirmedAt: '2026-11-01T00:00:00.000Z',
  regionCode: 'DEFAULT',
  threshold: 13,
  ...overrides,
});

describe('ageSettingValue', () => {
  it('names the stored threshold for a confirmed adult', () => {
    expect(ageSettingValue(record({ threshold: 13 }))).toBe('13 or older');
    expect(ageSettingValue(record({ threshold: 16 }))).toBe('16 or older');
    expect(ageSettingValue(record({ threshold: 18 }))).toBe('18 or older');
  });

  it('says Under the stored threshold for a minor', () => {
    expect(ageSettingValue(record({ isMinor: true, threshold: 16 }))).toBe('Under 16');
  });

  it('says Not set without a confirmed record or a usable threshold', () => {
    expect(ageSettingValue(null)).toBe('Not set');
    expect(ageSettingValue(record({ confirmed: false }))).toBe('Not set');
    expect(ageSettingValue(record({ threshold: Number.NaN }))).toBe('Not set');
  });
});
