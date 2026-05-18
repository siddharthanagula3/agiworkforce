/**
 * ageGate service — unit tests
 *
 * Covers:
 *   - detectRegionRule: timezone → threshold mapping
 *   - getAgeThreshold: returns correct threshold per region
 *   - confirmAgeGate: persists record, sets isMinor correctly
 *   - isAgeGateConfirmed / isMinorMode: read persisted state
 *   - clearAgeGate: erasure path
 */

// ---------------------------------------------------------------------------
// Mocks — before imports
// ---------------------------------------------------------------------------

const mockStorage = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key) ?? undefined,
    set: (key: string, value: string) => mockStorage.set(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
}));

// Control Intl.DateTimeFormat to inject different timezones per test.
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

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  detectRegionRule,
  getAgeThreshold,
  confirmAgeGate,
  isAgeGateConfirmed,
  isMinorMode,
  clearAgeGate,
} from '../services/ageGate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setTimezone(tz: string) {
  _mockTimezone = tz;
}

// ---------------------------------------------------------------------------
// detectRegionRule
// ---------------------------------------------------------------------------

describe('detectRegionRule — country thresholds', () => {
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

// ---------------------------------------------------------------------------
// getAgeThreshold
// ---------------------------------------------------------------------------

describe('getAgeThreshold', () => {
  afterEach(() => {
    setTimezone('America/New_York');
  });

  it('returns 18 for India timezone', () => {
    setTimezone('Asia/Kolkata');
    expect(getAgeThreshold()).toBe(18);
  });

  it('returns 16 for EU timezone', () => {
    setTimezone('Europe/Berlin');
    expect(getAgeThreshold()).toBe(16);
  });

  it('returns 13 for default', () => {
    setTimezone('America/New_York');
    expect(getAgeThreshold()).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// confirmAgeGate + isAgeGateConfirmed + isMinorMode
// ---------------------------------------------------------------------------

describe('confirmAgeGate', () => {
  beforeEach(() => {
    mockStorage.clear();
    setTimezone('America/New_York');
  });

  it('marks adult as confirmed and non-minor (US, age 20)', () => {
    const record = confirmAgeGate(20);
    expect(record.confirmed).toBe(true);
    expect(record.isMinor).toBe(false);
    expect(record.threshold).toBe(13);
    expect(record.regionCode).toBe('DEFAULT');
    expect(isAgeGateConfirmed()).toBe(true);
    expect(isMinorMode()).toBe(false);
  });

  it('marks minor correctly (US, age 12)', () => {
    const record = confirmAgeGate(12);
    expect(record.confirmed).toBe(true);
    expect(record.isMinor).toBe(true);
    expect(isMinorMode()).toBe(true);
  });

  it('marks adult for India threshold (18), age 18', () => {
    setTimezone('Asia/Kolkata');
    const record = confirmAgeGate(18);
    expect(record.isMinor).toBe(false);
    expect(record.regionCode).toBe('IN');
  });

  it('marks minor for India threshold (18), age 17', () => {
    setTimezone('Asia/Kolkata');
    const record = confirmAgeGate(17);
    expect(record.isMinor).toBe(true);
  });

  it('marks minor for EU threshold (16), age 15', () => {
    setTimezone('Europe/Berlin');
    const record = confirmAgeGate(15);
    expect(record.isMinor).toBe(true);
    expect(record.regionCode).toBe('DE');
    expect(record.threshold).toBe(16);
  });

  it('marks adult for EU threshold (16), age 16', () => {
    setTimezone('Europe/Berlin');
    const record = confirmAgeGate(16);
    expect(record.isMinor).toBe(false);
  });

  it('stores a valid ISO timestamp in confirmedAt', () => {
    const record = confirmAgeGate(25);
    expect(() => new Date(record.confirmedAt)).not.toThrow();
    expect(new Date(record.confirmedAt).getTime()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isAgeGateConfirmed — without any record
// ---------------------------------------------------------------------------

describe('isAgeGateConfirmed', () => {
  beforeEach(() => mockStorage.clear());

  it('returns false when no record exists', () => {
    expect(isAgeGateConfirmed()).toBe(false);
  });

  it('returns true after confirmation', () => {
    confirmAgeGate(20);
    expect(isAgeGateConfirmed()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// clearAgeGate
// ---------------------------------------------------------------------------

describe('clearAgeGate', () => {
  it('removes the stored record', () => {
    confirmAgeGate(25);
    expect(isAgeGateConfirmed()).toBe(true);
    clearAgeGate();
    expect(isAgeGateConfirmed()).toBe(false);
    expect(isMinorMode()).toBe(false);
  });
});
