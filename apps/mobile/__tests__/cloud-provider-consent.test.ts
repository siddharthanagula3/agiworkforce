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

const mockOpenInAppBrowser = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: (...args: unknown[]) => mockOpenInAppBrowser(...args),
  openExternalUrl: jest.fn().mockResolvedValue(true),
  isAllowedExternalUrl: () => true,
}));

import { Alert, type AlertButton } from 'react-native';
import { getProviderOfferings, providerLabels } from '@agiworkforce/types';
import { PROVIDERS } from '@/lib/models';
import { mmkvDisclosureLedger } from '@/services/complianceLedger';
import {
  CloudProviderConsentRequiredError,
  ensureCloudSendConsent,
  ensureLlmGateOpen,
  isLlmGateOpen,
} from '@/services/llmGate';
import {
  CLOUD_PROVIDER_CONSENT_ALLOW_LABEL,
  CLOUD_PROVIDER_CONSENT_DECLINE_LABEL,
  CLOUD_PROVIDER_CONSENT_DETAILS_LABEL,
  CLOUD_PROVIDER_CONSENT_KEY,
  CLOUD_PROVIDER_LIST_URL,
  cloudAiProviders,
  ensureCloudProviderConsent,
  hasCurrentCloudProviderConsent,
  readCloudProviderConsent,
} from '@/services/providerConsent';

const alertSpy = jest.spyOn(Alert, 'alert');

function pressAlertButton(label: string, call = alertSpy.mock.calls.length - 1): void {
  const buttons = (alertSpy.mock.calls[call]?.[2] ?? []) as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === label);
  if (!button?.onPress) throw new Error(`No "${label}" button in the consent prompt`);
  button.onPress();
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
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
  mockOpenInAppBrowser.mockClear();
  acceptFirstRunDisclosure();
});

describe('Cloud AI provider consent', () => {
  it('names every provider the catalog can route Cloud content to', () => {
    const expected = new Set<string>(PROVIDERS.map((provider) => provider.id));
    for (const offering of Object.values(getProviderOfferings())) expected.add(offering.provider);

    const providers = cloudAiProviders();
    expect(providers.map((provider) => provider.id).sort()).toEqual([...expected].sort());
    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      expect(provider.name).toBe(
        providerLabels[provider.id as keyof typeof providerLabels] ?? provider.id,
      );
    }
  });

  it('blocks the Cloud send gate until consent exists', () => {
    expect(() => ensureLlmGateOpen('openai')).toThrow(CloudProviderConsentRequiredError);
    expect(isLlmGateOpen('openai')).toBe(false);
  });

  it('asks before the first Cloud send with one sentence, the provider names and three buttons', async () => {
    const pending = ensureCloudProviderConsent();
    expect(alertSpy).toHaveBeenCalledTimes(1);

    const [, message, buttons] = alertSpy.mock.calls[0]!;
    for (const provider of cloudAiProviders()) expect(message).toContain(provider.name);
    expect(message?.match(/[.!?](\s|$)/g)).toHaveLength(1);
    expect((buttons as AlertButton[]).map((button) => button.text)).toEqual([
      CLOUD_PROVIDER_CONSENT_DETAILS_LABEL,
      CLOUD_PROVIDER_CONSENT_DECLINE_LABEL,
      CLOUD_PROVIDER_CONSENT_ALLOW_LABEL,
    ]);

    pressAlertButton(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);
    await pending;
  });

  it('Not now stops the send and records nothing', async () => {
    const pending = ensureCloudProviderConsent();
    pressAlertButton(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);

    await expect(pending).resolves.toBe(false);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
    expect(() => ensureLlmGateOpen('openai')).toThrow(CloudProviderConsentRequiredError);
  });

  it('the send-site gate rejects with the consent error on Not now', async () => {
    const pending = ensureCloudSendConsent();
    pressAlertButton(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);
    await expect(pending).rejects.toBeInstanceOf(CloudProviderConsentRequiredError);
  });

  it('dismissing the prompt counts as Not now', async () => {
    const pending = ensureCloudProviderConsent();
    const options = alertSpy.mock.calls[0]![3];
    options?.onDismiss?.();

    await expect(pending).resolves.toBe(false);
    expect(readCloudProviderConsent()).toBeNull();
  });

  it('Details opens the provider list and asks again', async () => {
    const pending = ensureCloudProviderConsent();
    pressAlertButton(CLOUD_PROVIDER_CONSENT_DETAILS_LABEL);
    await flush();

    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(CLOUD_PROVIDER_LIST_URL);
    expect(alertSpy).toHaveBeenCalledTimes(2);
    expect(readCloudProviderConsent()).toBeNull();

    pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    await expect(pending).resolves.toBe(true);
  });

  it('Allow persists the consent with the providers it covered and opens the gate', async () => {
    const pending = ensureCloudProviderConsent();
    pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    await expect(pending).resolves.toBe(true);

    expect(readCloudProviderConsent()?.providerIds).toEqual(
      cloudAiProviders().map((provider) => provider.id),
    );
    expect(mmkvDisclosureLedger.read()?.managedCloudAccepted).toBe(true);
    expect(() => ensureLlmGateOpen('openai')).not.toThrow();

    await expect(ensureCloudProviderConsent()).resolves.toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('shares one prompt between sends that start together', async () => {
    const first = ensureCloudProviderConsent();
    const second = ensureCloudProviderConsent();
    expect(alertSpy).toHaveBeenCalledTimes(1);

    pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('asks again when the catalog gains a provider the stored consent did not cover', async () => {
    const providers = cloudAiProviders();
    const covered = providers.slice(0, -1).map((provider) => provider.id);
    mockStorage.set(
      CLOUD_PROVIDER_CONSENT_KEY,
      JSON.stringify({
        accepted: true,
        acceptedAt: new Date().toISOString(),
        providerIds: covered,
        surface: 'mobile',
      }),
    );

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(() => ensureLlmGateOpen('openai')).toThrow(CloudProviderConsentRequiredError);

    const pending = ensureCloudProviderConsent();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]![1]).toContain(providers[providers.length - 1]!.name);
    pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    await expect(pending).resolves.toBe(true);
    expect(hasCurrentCloudProviderConsent()).toBe(true);
  });

  it('ignores a malformed stored consent', () => {
    mockStorage.set(CLOUD_PROVIDER_CONSENT_KEY, JSON.stringify({ accepted: 'yes' }));
    expect(readCloudProviderConsent()).toBeNull();
    expect(hasCurrentCloudProviderConsent()).toBe(false);
  });
});
