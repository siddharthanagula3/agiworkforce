const mockStorage = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  storage: {
    getString: (key: string) => mockStorage.get(key) ?? undefined,
    set: (key: string, value: string) => mockStorage.set(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
}));

jest.mock('expo-age-range', () => ({
  getRequiredRegulatoryFeaturesAsync: jest.fn(),
  isEligibleForAgeFeaturesAsync: jest.fn(),
  requestAgeRangeAsync: jest.fn(),
  requestAgeSignalsAccessAsync: jest.fn(),
  showSignificantUpdateAcknowledgmentAsync: jest.fn(),
  setFakeAgeSignals: jest.fn(),
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios', Version: '26.4' } }));

let mockTimezone = 'America/Chicago';
const originalIntl = global.Intl;

beforeAll(() => {
  Object.defineProperty(global, 'Intl', {
    configurable: true,
    value: {
      ...originalIntl,
      DateTimeFormat: function () {
        return { resolvedOptions: () => ({ timeZone: mockTimezone }) };
      },
    },
  });
});

afterAll(() => {
  Object.defineProperty(global, 'Intl', { configurable: true, value: originalIntl });
});

import {
  acknowledgeSignificantUpdate,
  ageRangeRequest,
  assureAgeWithOs,
  canPurchase,
  readAgeAssurance,
  runAgeAssurance,
} from '../ageAssurance';
import { isAgeGateConfirmed, isMinorMode } from '@/src/features/auth/services/ageGate';
import * as AgeRange from 'expo-age-range';
import { Platform } from 'react-native';

const mockAgeRange = jest.mocked(AgeRange);
const mockPlatform = Platform as { OS: string; Version: string | number };

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  mockStorage.clear();
  jest.resetAllMocks();
  mockPlatform.OS = 'ios';
  mockPlatform.Version = '26.4';
  mockTimezone = 'America/Chicago';
});

describe('ageRangeRequest', () => {
  it('asks for the account minimum and adulthood in the default region', () => {
    expect(ageRangeRequest()).toEqual({ threshold1: 13, threshold2: 18 });
  });

  it('uses the EU threshold of 16', () => {
    mockTimezone = 'Europe/Berlin';
    expect(ageRangeRequest()).toEqual({ threshold1: 16, threshold2: 18 });
  });

  it('asks only for 18 where the account minimum is 18', () => {
    mockTimezone = 'Asia/Kolkata';
    expect(ageRangeRequest()).toEqual({ threshold1: 18 });
  });
});

describe('iOS Declared Age Range', () => {
  it('skips the prompt when Apple says regulation does not apply', async () => {
    mockAgeRange.isEligibleForAgeFeaturesAsync.mockResolvedValue(false);

    const record = await runAgeAssurance();

    expect(record?.outcome).toBe('notRegulated');
    expect(mockAgeRange.requestAgeRangeAsync).not.toHaveBeenCalled();
    expect(await assureAgeWithOs()).toBeNull();
  });

  it('asks for the range when regulation applies or is unknown', async () => {
    mockAgeRange.isEligibleForAgeFeaturesAsync.mockRejectedValue(new Error('unavailable'));
    mockAgeRange.requestAgeRangeAsync.mockResolvedValue({ lowerBound: 18, upperBound: null });

    const gate = await assureAgeWithOs();

    expect(mockAgeRange.requestAgeRangeAsync).toHaveBeenCalledWith({
      threshold1: 13,
      threshold2: 18,
    });
    expect(gate?.isMinor).toBe(false);
    expect(isAgeGateConfirmed()).toBe(true);
  });

  it('sends a user under the account minimum to the refusal path', async () => {
    mockAgeRange.isEligibleForAgeFeaturesAsync.mockResolvedValue(true);
    mockAgeRange.requestAgeRangeAsync.mockResolvedValue({
      lowerBound: null,
      upperBound: 12,
      ageRangeDeclaration: 'guardianDeclared',
    });

    const gate = await assureAgeWithOs();

    expect(gate?.isMinor).toBe(true);
    expect(isMinorMode()).toBe(true);
  });

  it('never trusts the adult placeholder iOS returns before 26', async () => {
    mockPlatform.Version = '18.6';
    mockAgeRange.requestAgeRangeAsync.mockResolvedValue({ lowerBound: 18, upperBound: null });

    expect(await assureAgeWithOs()).toBeNull();
    expect(mockAgeRange.requestAgeRangeAsync).not.toHaveBeenCalled();
    expect(isAgeGateConfirmed()).toBe(false);
  });

  it('falls back to the typed gate when the user declines', async () => {
    mockAgeRange.isEligibleForAgeFeaturesAsync.mockResolvedValue(true);
    mockAgeRange.requestAgeRangeAsync.mockRejectedValue(codedError('ERR_AGE_RANGE_USER_DECLINED'));

    expect(await assureAgeWithOs()).toBeNull();
    expect(readAgeAssurance()?.outcome).toBe('declined');
    expect(isAgeGateConfirmed()).toBe(false);
  });
});

describe('Android Play Age Signals', () => {
  beforeEach(() => {
    mockPlatform.OS = 'android';
    mockPlatform.Version = 36;
  });

  it('reads the range only after the user shares it', async () => {
    mockAgeRange.requestAgeSignalsAccessAsync.mockResolvedValue('SHARED');
    mockAgeRange.requestAgeRangeAsync.mockResolvedValue({
      lowerBound: 13,
      upperBound: 15,
      ageRangeSource: 'TIER_B',
      installId: 'install-1',
      significantChangeStatus: null,
    });

    const gate = await assureAgeWithOs();

    expect(gate?.isMinor).toBe(false);
    expect(readAgeAssurance()).toMatchObject({
      regulated: true,
      guardianManaged: true,
      installId: 'install-1',
    });
  });

  it('does not ask for the range when sharing is declined', async () => {
    mockAgeRange.requestAgeSignalsAccessAsync.mockResolvedValue('NOT_SHARED');

    expect(await assureAgeWithOs()).toBeNull();
    expect(mockAgeRange.requestAgeRangeAsync).not.toHaveBeenCalled();
  });

  it('records verification required and blocks purchases', async () => {
    mockAgeRange.requestAgeSignalsAccessAsync.mockResolvedValue('VERIFICATION_REQUIRED');

    await runAgeAssurance();

    expect(canPurchase()).toEqual({ allowed: false, reason: 'ageUnconfirmed' });
  });

  it('treats a dismissed consent screen as declined', async () => {
    mockAgeRange.requestAgeSignalsAccessAsync.mockRejectedValue(
      codedError('ERR_AGE_RANGE_TASK_CANCELLED'),
    );

    expect((await runAgeAssurance())?.outcome).toBe('declined');
  });
});

describe('canPurchase', () => {
  it('allows purchases when no OS check has run', () => {
    expect(canPurchase()).toEqual({ allowed: true });
  });

  it('blocks a minor in a regulated region until a guardian consents', async () => {
    mockAgeRange.isEligibleForAgeFeaturesAsync.mockResolvedValue(true);
    mockAgeRange.requestAgeRangeAsync.mockResolvedValue({ lowerBound: 13, upperBound: 17 });

    await runAgeAssurance();

    expect(canPurchase()).toEqual({ allowed: false, reason: 'guardianConsentRequired' });
  });

  it('blocks a regulated user who declined to share an age', async () => {
    mockAgeRange.isEligibleForAgeFeaturesAsync.mockResolvedValue(true);
    mockAgeRange.requestAgeRangeAsync.mockRejectedValue(codedError('ERR_AGE_RANGE_USER_DECLINED'));

    await runAgeAssurance();

    expect(canPurchase()).toEqual({ allowed: false, reason: 'ageUnconfirmed' });
  });

  it('allows an adult in a regulated region', async () => {
    mockAgeRange.isEligibleForAgeFeaturesAsync.mockResolvedValue(true);
    mockAgeRange.requestAgeRangeAsync.mockResolvedValue({ lowerBound: 18, upperBound: null });

    await runAgeAssurance();

    expect(canPurchase()).toEqual({ allowed: true });
  });
});

describe('acknowledgeSignificantUpdate', () => {
  it('shows the system sheet when iOS requires adult notification', async () => {
    mockAgeRange.getRequiredRegulatoryFeaturesAsync.mockResolvedValue([
      'significantAppChangeRequiresAdultNotification',
    ]);
    mockAgeRange.showSignificantUpdateAcknowledgmentAsync.mockResolvedValue(undefined);

    expect(await acknowledgeSignificantUpdate('New agent tools')).toBe('acknowledged');
    expect(mockAgeRange.showSignificantUpdateAcknowledgmentAsync).toHaveBeenCalledWith(
      'New agent tools',
    );
  });

  it('reports parental consent when iOS requires it', async () => {
    mockAgeRange.getRequiredRegulatoryFeaturesAsync.mockResolvedValue([
      'significantAppChangeRequiresParentalConsent',
      'significantAppChangeRequiresAdultNotification',
    ]);

    expect(await acknowledgeSignificantUpdate('New agent tools')).toBe('parentalConsentRequired');
    expect(mockAgeRange.showSignificantUpdateAcknowledgmentAsync).not.toHaveBeenCalled();
  });

  it('shows nothing when iOS reports no requirement', async () => {
    mockAgeRange.getRequiredRegulatoryFeaturesAsync.mockResolvedValue(null);

    expect(await acknowledgeSignificantUpdate('New agent tools')).toBe('notRequired');
  });

  it('reads guardian approval of the change on Android', async () => {
    mockPlatform.OS = 'android';
    mockAgeRange.requestAgeSignalsAccessAsync.mockResolvedValue('SHARED');
    mockAgeRange.requestAgeRangeAsync.mockResolvedValue({ lowerBound: 13, upperBound: 15 });
    await runAgeAssurance();
    mockAgeRange.requestAgeRangeAsync.mockResolvedValue({
      lowerBound: 13,
      upperBound: 15,
      significantChangeStatus: 'PENDING',
    });

    expect(await acknowledgeSignificantUpdate('New agent tools')).toBe('parentalConsentRequired');
  });
});
