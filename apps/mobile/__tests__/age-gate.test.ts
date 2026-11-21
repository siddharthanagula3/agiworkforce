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
  ageGateStatus,
  detectRegionRule,
  deviceAdultEvidence,
  getAgeThreshold,
  confirmAgeGate,
  confirmAgeGateFromRange,
  isAgeGateConfirmed,
  isMinorMode,
  clearAgeGate,
  readAgeGateRecord,
  type AgeGateRecord,
} from '../src/features/auth/services/ageGate';

function setTimezone(tz: string) {
  _mockTimezone = tz;
}

function storeRecord(overrides: Partial<AgeGateRecord>): void {
  mockStorage.set(
    'age-gate:v1',
    JSON.stringify({
      confirmed: true,
      isMinor: false,
      confirmedAt: '2026-06-01T00:00:00.000Z',
      regionCode: 'DEFAULT',
      threshold: ACCOUNT_MINIMUM_AGE,
      ...overrides,
    }),
  );
}

function storeOsRange(lowerBound: number | null, upperBound: number | null): void {
  mockStorage.set(
    'age-assurance:v1',
    JSON.stringify({
      checkedAt: '2026-06-01T00:00:00.000Z',
      platform: 'ios',
      outcome: 'range',
      regulated: true,
      lowerBound,
      upperBound,
      guardianManaged: false,
      installId: null,
      significantChangeStatus: null,
    }),
  );
}

afterEach(() => {
  mockStorage.clear();
  setTimezone('America/New_York');
});

describe('one minimum age', () => {
  it('is 18', () => {
    expect(ACCOUNT_MINIMUM_AGE).toBe(18);
  });

  it.each([
    'America/New_York',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Paris',
    'Asia/Kolkata',
    'America/Sao_Paulo',
    'Antarctica/Troll',
    'Etc/UTC',
  ])('never resolves below the account minimum in %s', (zone) => {
    setTimezone(zone);
    expect(getAgeThreshold()).toBe(ACCOUNT_MINIMUM_AGE);
    expect(detectRegionRule().threshold).toBeGreaterThanOrEqual(ACCOUNT_MINIMUM_AGE);
  });

  it('still names the region where a regional rule matches', () => {
    setTimezone('Asia/Kolkata');
    expect(detectRegionRule().code).toBe('IN');
    setTimezone('America/Manaus');
    expect(detectRegionRule().code).toBe('BR');
    setTimezone('Europe/Berlin');
    expect(detectRegionRule().code).toBe('DEFAULT');
  });
});

describe('a typed age', () => {
  it('refuses 17', () => {
    const record = confirmAgeGate(17);
    expect(record.isMinor).toBe(true);
    expect(record.threshold).toBe(ACCOUNT_MINIMUM_AGE);
    expect(ageGateStatus()).toBe('refused');
    expect(isAgeGateConfirmed()).toBe(false);
  });

  it('admits 18', () => {
    const record = confirmAgeGate(18);
    expect(record.isMinor).toBe(false);
    expect(record.threshold).toBe(ACCOUNT_MINIMUM_AGE);
    expect(ageGateStatus()).toBe('confirmed');
    expect(isMinorMode()).toBe(false);
  });

  it.each([12, 13, 15, 16, 17])('refuses %i in every region', (age) => {
    for (const zone of ['America/New_York', 'Europe/London', 'Europe/Berlin']) {
      mockStorage.clear();
      setTimezone(zone);
      expect(confirmAgeGate(age).isMinor).toBe(true);
      expect(isAgeGateConfirmed()).toBe(false);
    }
  });

  it('stores a valid ISO timestamp in confirmedAt', () => {
    const record = confirmAgeGate(25);
    expect(new Date(record.confirmedAt).getTime()).toBeGreaterThan(0);
  });
});

describe('a stored result', () => {
  it.each([13, 16])('asks again when the adult result was made against %i', (threshold) => {
    storeRecord({ threshold });

    expect(ageGateStatus()).toBe('required');
    expect(isAgeGateConfirmed()).toBe(false);
    expect(isMinorMode()).toBe(false);
    expect(deviceAdultEvidence()).toBeNull();
  });

  it('reuses an adult result made against 18 without asking', () => {
    storeRecord({ threshold: 18, regionCode: 'IN' });

    expect(ageGateStatus()).toBe('confirmed');
    expect(deviceAdultEvidence()).toEqual({ kind: 'age_checked_on_device', minimumAge: 18 });
  });

  it('reuses a stored OS range whose lower bound is 18, even over a 13-based result', () => {
    storeRecord({ threshold: 13 });
    storeOsRange(18, null);

    expect(ageGateStatus()).toBe('confirmed');
    expect(deviceAdultEvidence()).toEqual({
      kind: 'platform_age_signal',
      lowerBound: 18,
      upperBound: null,
    });
  });

  it.each([
    [13, 17],
    [16, 20],
    [null, null],
  ])('does not reuse a stored OS range from %p to %p', (lower, upper) => {
    storeOsRange(lower, upper);
    expect(ageGateStatus()).toBe('required');
  });

  it.each([13, 16, 18])('keeps an under-age result made against %i a refusal', (threshold) => {
    storeRecord({ threshold, isMinor: true });
    storeOsRange(18, null);

    expect(ageGateStatus()).toBe('refused');
    expect(deviceAdultEvidence()).toBeNull();
  });

  it('lets a person asked again record a new verdict over an old adult result', () => {
    storeRecord({ threshold: 13 });

    expect(confirmAgeGate(16).isMinor).toBe(true);
    expect(ageGateStatus()).toBe('refused');
  });

  it('is required on a device with nothing stored', () => {
    expect(ageGateStatus()).toBe('required');
  });
});

describe('confirmAgeGateFromRange', () => {
  it('confirms a range at or above 18', () => {
    expect(confirmAgeGateFromRange({ lowerBound: 18, upperBound: null })?.isMinor).toBe(false);
    expect(isAgeGateConfirmed()).toBe(true);
  });

  it('refuses a range wholly under 18', () => {
    expect(confirmAgeGateFromRange({ lowerBound: 13, upperBound: 17 })?.isMinor).toBe(true);
    expect(isMinorMode()).toBe(true);
  });

  it.each([
    [16, 20],
    [null, null],
    [13, null],
    [null, 21],
  ])('records nothing for %p to %p, which falls back to the typed age', (lower, upper) => {
    expect(confirmAgeGateFromRange({ lowerBound: lower, upperBound: upper })).toBeNull();
    expect(ageGateStatus()).toBe('required');
  });

  it('keeps a refused device refused when the OS later reports an adult', () => {
    confirmAgeGate(ACCOUNT_MINIMUM_AGE - 1);
    expect(confirmAgeGateFromRange({ lowerBound: 18, upperBound: null })?.isMinor).toBe(true);
  });
});

describe('readAgeGateRecord and clearAgeGate', () => {
  it('returns null before any age was recorded', () => {
    expect(readAgeGateRecord()).toBeNull();
  });

  it('returns the stored record with the threshold it was decided against', () => {
    const written = confirmAgeGate(40);
    expect(readAgeGateRecord()).toEqual(written);
    expect(readAgeGateRecord()).toMatchObject({ confirmed: true, isMinor: false, threshold: 18 });
  });

  it('only clearing the device lifts a refusal', () => {
    confirmAgeGate(ACCOUNT_MINIMUM_AGE - 1);
    expect(confirmAgeGate(30).isMinor).toBe(true);

    clearAgeGate();

    expect(readAgeGateRecord()).toBeNull();
    expect(ageGateStatus()).toBe('required');
  });
});
