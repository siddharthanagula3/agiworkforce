const mockStorage = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  storage: {
    getString: (key: string) => mockStorage.get(key) ?? undefined,
    set: (key: string, value: string) => mockStorage.set(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
}));

let _mockTimezone = 'America/New_York';

const originalIntl = global.Intl;

beforeAll(() => {
  Object.defineProperty(global, 'Intl', {
    configurable: true,
    value: {
      ...originalIntl,
      DateTimeFormat: function () {
        return {
          resolvedOptions: () => ({ timeZone: _mockTimezone }),
          format: originalIntl.DateTimeFormat().format,
        };
      },
    },
  });
});

afterAll(() => {
  Object.defineProperty(global, 'Intl', { configurable: true, value: originalIntl });
});

import { ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';
import {
  detectRegionRule,
  getAgeThreshold,
  confirmAgeGate,
  isAgeGateConfirmed,
  isMinorMode,
  clearAgeGate,
} from '../src/features/auth/services/ageGate';

function setTimezone(tz: string) {
  _mockTimezone = tz;
}

describe('detectRegionRule, country thresholds', () => {
  afterEach(() => {
    mockStorage.clear();
    setTimezone('America/New_York');
  });

  it('returns 18 threshold for India (Asia/Kolkata)', () => {
    setTimezone('Asia/Kolkata');
    const rule = detectRegionRule();
    expect(rule.code).toBe('IN');
    expect(rule.threshold).toBe(18);
  });

  it('returns 18 threshold for Brazil (America/Sao_Paulo)', () => {
    setTimezone('America/Sao_Paulo');
    const rule = detectRegionRule();
    expect(rule.code).toBe('BR');
    expect(rule.threshold).toBe(18);
  });

  it('returns 18 threshold for Brazil (Manaus)', () => {
    setTimezone('America/Manaus');
    expect(detectRegionRule().threshold).toBe(18);
  });

  it('returns 16 threshold for Germany (Europe/Berlin)', () => {
    setTimezone('Europe/Berlin');
    const rule = detectRegionRule();
    expect(rule.code).toBe('DE');
    expect(rule.threshold).toBe(16);
  });

  it('returns 16 threshold for France (Europe/Paris)', () => {
    setTimezone('Europe/Paris');
    expect(detectRegionRule().threshold).toBe(16);
  });

  it('returns 16 threshold for Italy (Europe/Rome)', () => {
    setTimezone('Europe/Rome');
    expect(detectRegionRule().threshold).toBe(16);
  });

  it('returns 16 threshold for Spain (Europe/Madrid)', () => {
    setTimezone('Europe/Madrid');
    expect(detectRegionRule().threshold).toBe(16);
  });

  it('returns 13 threshold for UK (Europe/London)', () => {
    setTimezone('Europe/London');
    const rule = detectRegionRule();
    expect(rule.code).toBe('GB');
    expect(rule.threshold).toBe(13);
  });

  it('returns 13 threshold for US (America/New_York)', () => {
    setTimezone('America/New_York');
    const rule = detectRegionRule();
    expect(rule.code).toBe('DEFAULT');
    expect(rule.threshold).toBe(13);
  });

  it('returns 13 default for unrecognized timezone', () => {
    setTimezone('Antarctica/Troll');
    const rule = detectRegionRule();
    expect(rule.threshold).toBe(13);
  });
});

describe('getAgeThreshold', () => {
  afterEach(() => {
    setTimezone('America/New_York');
  });

  it('returns 18 for India timezone', () => {
    setTimezone('Asia/Kolkata');
    expect(getAgeThreshold()).toBe(18);
  });

  it('keeps the 16 regional age in the EU, above the account minimum', () => {
    setTimezone('Europe/Berlin');
    expect(getAgeThreshold()).toBe(16);
    expect(getAgeThreshold()).toBeGreaterThan(ACCOUNT_MINIMUM_AGE);
  });

  it('returns the account minimum where no regional age is higher', () => {
    setTimezone('America/New_York');
    expect(getAgeThreshold()).toBe(ACCOUNT_MINIMUM_AGE);
  });

  it('never asks for less than the account minimum in any zone', () => {
    for (const zone of ['Europe/London', 'Antarctica/Troll', 'Etc/UTC', 'Asia/Tokyo']) {
      setTimezone(zone);
      expect(getAgeThreshold()).toBeGreaterThanOrEqual(ACCOUNT_MINIMUM_AGE);
    }
  });
});

describe('confirmAgeGate', () => {
  beforeEach(() => {
    mockStorage.clear();
    setTimezone('America/New_York');
  });

  it('marks adult as confirmed and non-minor (US, age 20)', () => {
    const record = confirmAgeGate(20);
    expect(record.confirmed).toBe(true);
    expect(record.isMinor).toBe(false);
    expect(record.threshold).toBe(ACCOUNT_MINIMUM_AGE);
    expect(record.regionCode).toBe('DEFAULT');
    expect(isAgeGateConfirmed()).toBe(true);
    expect(isMinorMode()).toBe(false);
  });

  it('marks minor correctly (US, age 12)', () => {
    const record = confirmAgeGate(12);
    expect(record.confirmed).toBe(true);
    expect(record.isMinor).toBe(true);
    expect(isMinorMode()).toBe(true);
    expect(isAgeGateConfirmed()).toBe(false);
  });

  it.each([13, 16, 17])('admits a %i year old where no regional age is higher (US)', (age) => {
    const record = confirmAgeGate(age);
    expect(record.isMinor).toBe(false);
    expect(record.threshold).toBe(ACCOUNT_MINIMUM_AGE);
    expect(isAgeGateConfirmed()).toBe(true);
    expect(isMinorMode()).toBe(false);
  });

  it('refuses the year under the account minimum (US)', () => {
    const record = confirmAgeGate(ACCOUNT_MINIMUM_AGE - 1);
    expect(record.isMinor).toBe(true);
    expect(isAgeGateConfirmed()).toBe(false);
  });

  it('marks adult for India threshold (18), age 18', () => {
    setTimezone('Asia/Kolkata');
    const record = confirmAgeGate(18);
    expect(record.isMinor).toBe(false);
    expect(record.regionCode).toBe('IN');
  });

  it.each([13, 16, 17])('marks minor for India threshold (18), age %i', (age) => {
    setTimezone('Asia/Kolkata');
    const record = confirmAgeGate(age);
    expect(record.isMinor).toBe(true);
    expect(record.threshold).toBe(18);
    expect(isAgeGateConfirmed()).toBe(false);
  });

  it.each([13, 15])('marks minor for EU threshold (16), age %i', (age) => {
    setTimezone('Europe/Berlin');
    const record = confirmAgeGate(age);
    expect(record.isMinor).toBe(true);
    expect(record.regionCode).toBe('DE');
    expect(record.threshold).toBe(16);
    expect(isAgeGateConfirmed()).toBe(false);
  });

  it.each([16, 17])('admits a %i year old in the EU, at or over its regional age', (age) => {
    setTimezone('Europe/Berlin');
    const record = confirmAgeGate(age);
    expect(record.isMinor).toBe(false);
    expect(record.threshold).toBe(16);
    expect(isAgeGateConfirmed()).toBe(true);
  });

  it('stores a valid ISO timestamp in confirmedAt', () => {
    const record = confirmAgeGate(25);
    expect(() => new Date(record.confirmedAt)).not.toThrow();
    expect(new Date(record.confirmedAt).getTime()).toBeGreaterThan(0);
  });
});

describe('isAgeGateConfirmed', () => {
  beforeEach(() => mockStorage.clear());

  it('returns false when no record exists', () => {
    expect(isAgeGateConfirmed()).toBe(false);
  });

  it('returns true after confirmation', () => {
    confirmAgeGate(20);
    expect(isAgeGateConfirmed()).toBe(true);
  });

  it('returns false for a device refused an account', () => {
    confirmAgeGate(ACCOUNT_MINIMUM_AGE - 1);
    expect(isAgeGateConfirmed()).toBe(false);
  });
});

describe('clearAgeGate', () => {
  beforeEach(() => mockStorage.clear());

  it('removes the stored record', () => {
    confirmAgeGate(25);
    expect(isAgeGateConfirmed()).toBe(true);
    clearAgeGate();
    expect(isAgeGateConfirmed()).toBe(false);
    expect(isMinorMode()).toBe(false);
  });
});
