const mockStorage = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    delete: (key: string) => {
      mockStorage.delete(key);
    },
  },
}));

import { DISCLOSURE_LEDGER_KEY, type DisclosureRecord } from '@agiworkforce/compliance';
import {
  clearNamedProviderConsent,
  mmkvConsentLedger,
  mmkvDisclosureLedger,
  recordNamedProviderConsent,
} from '../services/complianceLedger';

beforeEach(() => {
  mockStorage.clear();
});

function disclosureRecord(): DisclosureRecord {
  return {
    version: 1,
    acceptedAt: '2026-05-20T12:00:00.000Z',
    surface: 'mobile',
    disclosureCopyHash: 'hash-v1',
    managedCloudAccepted: false,
    chineseHqProvidersAccepted: [],
  };
}

describe('mobile compliance ledger', () => {
  it('persists disclosure acceptance in MMKV storage', () => {
    const record = disclosureRecord();

    mmkvDisclosureLedger.write(record);

    expect(mmkvDisclosureLedger.read()).toEqual(record);
    expect(JSON.parse(mockStorage.get(DISCLOSURE_LEDGER_KEY) ?? '{}')).toEqual(record);
  });

  it('fails closed and clears corrupt disclosure records', () => {
    mockStorage.set(DISCLOSURE_LEDGER_KEY, '{"version":2}');

    expect(mmkvDisclosureLedger.read()).toBeNull();
    expect(mockStorage.has(DISCLOSURE_LEDGER_KEY)).toBe(false);
  });

  it('persists named-provider consent by canonical provider id', () => {
    recordNamedProviderConsent({
      providerId: 'DeepSeek',
      accepted: true,
      acceptedAt: '2026-05-20T12:01:00.000Z',
      disclosureVersion: 'hash-v1',
      surface: 'mobile',
    });

    expect(mmkvConsentLedger.getNamedProviderConsent('deepseek')).toEqual({
      providerId: 'DeepSeek',
      accepted: true,
      acceptedAt: '2026-05-20T12:01:00.000Z',
      disclosureVersion: 'hash-v1',
      surface: 'mobile',
    });
  });

  it('clears named-provider consent', () => {
    recordNamedProviderConsent({
      providerId: 'qwen',
      accepted: true,
      acceptedAt: '2026-05-20T12:02:00.000Z',
      disclosureVersion: 'hash-v1',
      surface: 'mobile',
    });

    clearNamedProviderConsent('qwen');

    expect(mmkvConsentLedger.getNamedProviderConsent('qwen')).toBeNull();
  });
});
