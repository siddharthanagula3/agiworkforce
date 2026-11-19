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
  whenMmkvReady: (cb: () => void) => cb(),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: () => null,
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: jest.fn().mockResolvedValue(true),
  openExternalUrl: jest.fn().mockResolvedValue(true),
  isAllowedExternalUrl: () => true,
}));

import { Alert, type AlertButton } from 'react-native';
import { isDisclosureSatisfied } from '@agiworkforce/compliance';
import { mmkvDisclosureLedger, mmkvRoutingConsentLedger } from '@/services/complianceLedger';
import {
  CloudProviderConsentRequiredError,
  ensureCloudSendConsent,
  ensureLlmGateOpen,
  isLlmGateOpen,
} from '@/services/llmGate';
import {
  CLOUD_PROVIDER_CONSENT_ALLOW_LABEL,
  CLOUD_PROVIDER_CONSENT_DECLINE_LABEL,
  CLOUD_PROVIDER_CONSENT_KEY,
  CLOUD_PROVIDER_SHARING_LABEL,
  ensureCloudProviderConsent,
  hasCurrentCloudProviderConsent,
  readCloudProviderConsent,
  recordCloudProviderConsent,
  setChineseHqProviderConsent,
  withdrawCloudProviderConsent,
} from '@/services/providerConsent';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

const alertSpy = jest.spyOn(Alert, 'alert');

function pressAlertButton(label: string): void {
  const buttons = (alertSpy.mock.calls[alertSpy.mock.calls.length - 1]?.[2] ?? []) as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === label);
  if (!button?.onPress) throw new Error(`No "${label}" button in the consent prompt`);
  button.onPress();
}

function acceptFirstRunDisclosure(): void {
  mmkvDisclosureLedger.write({
    version: 1,
    acceptedAt: new Date().toISOString(),
    surface: 'mobile',
    disclosureCopyHash: 'test-copy-hash',
    managedCloudAccepted: false,
    chineseHqProvidersAccepted: [],
  });
}

beforeEach(() => {
  mockStorage.clear();
  alertSpy.mockReset();
  acceptFirstRunDisclosure();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('person-a');
});

describe('withdrawing the permission to share with AI providers', () => {
  it('closes the send gate so the next Cloud send asks the question again', async () => {
    recordCloudProviderConsent();
    expect(hasCurrentCloudProviderConsent()).toBe(true);
    expect(isLlmGateOpen('openai')).toBe(true);

    withdrawCloudProviderConsent();

    expect(readCloudProviderConsent()).toBeNull();
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(isLlmGateOpen('openai')).toBe(false);
    expect(() => ensureLlmGateOpen('openai')).toThrow(CloudProviderConsentRequiredError);

    const send = ensureCloudSendConsent();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]![0]).toBe(`${CLOUD_PROVIDER_SHARING_LABEL}?`);
    pressAlertButton(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);
    await expect(send).rejects.toBeInstanceOf(CloudProviderConsentRequiredError);
    expect(readCloudProviderConsent()).toBeNull();
  });

  it('can be allowed again through the same question', async () => {
    recordCloudProviderConsent();
    withdrawCloudProviderConsent();

    const pending = ensureCloudProviderConsent();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);

    await expect(pending).resolves.toBe(true);
    expect(hasCurrentCloudProviderConsent()).toBe(true);
    expect(mmkvDisclosureLedger.read()?.managedCloudAccepted).toBe(true);
  });

  it('records in the disclosure ledger that AGI Cloud sharing is no longer accepted', () => {
    recordCloudProviderConsent();
    expect(mmkvDisclosureLedger.read()?.managedCloudAccepted).toBe(true);

    withdrawCloudProviderConsent();

    const disclosure = mmkvDisclosureLedger.read();
    expect(disclosure?.managedCloudAccepted).toBe(false);
    expect(disclosure?.disclosureCopyHash).toBe('test-copy-hash');
    expect(isDisclosureSatisfied(mmkvDisclosureLedger, false)).toBe(true);
  });

  it('leaves the China-headquartered provider choices as they were', () => {
    setChineseHqProviderConsent('deepseek', true);
    recordCloudProviderConsent();

    withdrawCloudProviderConsent();

    expect(mmkvRoutingConsentLedger.getNamedProviderConsent('deepseek')?.accepted).toBe(true);
  });

  it('is harmless when nothing was allowed', () => {
    const before = mmkvDisclosureLedger.read();

    expect(() => withdrawCloudProviderConsent()).not.toThrow();

    expect(readCloudProviderConsent()).toBeNull();
    expect(mmkvDisclosureLedger.read()).toEqual(before);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('is harmless before the first-run disclosure exists', () => {
    mockStorage.clear();

    expect(() => withdrawCloudProviderConsent()).not.toThrow();

    expect(mmkvDisclosureLedger.read()).toBeNull();
    expect(readCloudProviderConsent()).toBeNull();
  });
});
