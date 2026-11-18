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

import { Alert, AppState, Platform, type AlertButton, type AppStateStatus } from 'react-native';
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
  hasCloudProviderConsentForCurrentAccount,
  hasCurrentCloudProviderConsent,
  readCloudProviderConsent,
  recordCloudProviderConsent,
} from '@/services/providerConsent';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

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
  __resetCloudAccountSessionForTests();
  activateCloudAccount('person-a');
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

    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(`${CLOUD_PROVIDER_LIST_URL}?from=mobile`);
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

describe('Cloud AI provider consent after leaving the app', () => {
  const originalOS = Platform.OS;
  const originalAppState = AppState.currentState;
  let appStateListeners: Array<(state: AppStateStatus) => void> = [];
  let addAppStateListener: jest.SpyInstance;

  function setPlatform(os: 'ios' | 'android'): void {
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
  }

  function moveApp(state: AppStateStatus): void {
    AppState.currentState = state;
    for (const listener of [...appStateListeners]) listener(state);
  }

  beforeEach(() => {
    appStateListeners = [];
    AppState.currentState = 'active';
    addAppStateListener = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        const handler = listener as (state: AppStateStatus) => void;
        appStateListeners.push(handler);
        return {
          remove: () => {
            appStateListeners = appStateListeners.filter((candidate) => candidate !== handler);
          },
        } as ReturnType<typeof AppState.addEventListener>;
      });
  });

  afterEach(() => {
    addAppStateListener.mockRestore();
    AppState.currentState = originalAppState;
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  });

  describe('on Android, where the provider list opens without waiting to be closed', () => {
    beforeEach(() => setPlatform('android'));

    it('asks again only once the person comes back from the provider list', async () => {
      const pending = ensureCloudProviderConsent();
      pressAlertButton(CLOUD_PROVIDER_CONSENT_DETAILS_LABEL);
      await flush();

      expect(mockOpenInAppBrowser).toHaveBeenCalledWith(`${CLOUD_PROVIDER_LIST_URL}?from=mobile`);
      expect(alertSpy).toHaveBeenCalledTimes(1);

      moveApp('background');
      await flush();
      expect(alertSpy).toHaveBeenCalledTimes(1);

      moveApp('active');
      await flush();
      expect(alertSpy).toHaveBeenCalledTimes(2);

      pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
      await expect(pending).resolves.toBe(true);
      expect(appStateListeners).toHaveLength(0);
    });

    it('does not swallow a second Send when the question was lost after leaving the app', async () => {
      const first = ensureCloudProviderConsent();
      pressAlertButton(CLOUD_PROVIDER_CONSENT_DETAILS_LABEL);
      await flush();
      moveApp('background');
      moveApp('active');
      await flush();
      expect(alertSpy).toHaveBeenCalledTimes(2);

      const second = ensureCloudProviderConsent();
      await expect(first).resolves.toBe(false);
      expect(alertSpy).toHaveBeenCalledTimes(3);

      pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
      await expect(second).resolves.toBe(true);
      expect(hasCurrentCloudProviderConsent()).toBe(true);
    });

    it('settles a question the person never came back to answer, so the next Send asks again', async () => {
      const first = ensureCloudProviderConsent();
      pressAlertButton(CLOUD_PROVIDER_CONSENT_DETAILS_LABEL);
      await flush();

      const second = ensureCloudProviderConsent();
      await expect(first).resolves.toBe(false);
      expect(alertSpy).toHaveBeenCalledTimes(2);

      pressAlertButton(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);
      await expect(second).resolves.toBe(false);
      expect(readCloudProviderConsent()).toBeNull();
      expect(appStateListeners).toHaveLength(0);
    });

    it('shows the question again when the app comes back, ignoring the dialog it replaced', async () => {
      const pending = ensureCloudProviderConsent();
      expect(alertSpy).toHaveBeenCalledTimes(1);
      moveApp('background');
      moveApp('active');
      expect(alertSpy).toHaveBeenCalledTimes(2);

      alertSpy.mock.calls[0]![3]?.onDismiss?.();
      await flush();
      let answered = false;
      void pending.then(() => {
        answered = true;
      });
      await flush();
      expect(answered).toBe(false);

      pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
      await expect(pending).resolves.toBe(true);
    });

    it('counts a dismissed question as Not now after the app came back', async () => {
      const pending = ensureCloudProviderConsent();
      moveApp('background');
      moveApp('active');

      alertSpy.mock.calls[1]![3]?.onDismiss?.();
      await expect(pending).resolves.toBe(false);
      expect(readCloudProviderConsent()).toBeNull();
    });

    it('waits for the app to be in front before asking', async () => {
      AppState.currentState = 'background';
      const pending = ensureCloudProviderConsent();
      await flush();
      expect(alertSpy).not.toHaveBeenCalled();

      moveApp('active');
      await flush();
      expect(alertSpy).toHaveBeenCalledTimes(1);

      pressAlertButton(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);
      await expect(pending).resolves.toBe(false);
    });

    it('still shares one question between sends that start together', async () => {
      const first = ensureCloudProviderConsent();
      const second = ensureCloudProviderConsent();
      expect(alertSpy).toHaveBeenCalledTimes(1);

      pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    });

    it('asks again at once when the provider list could not be opened', async () => {
      mockOpenInAppBrowser.mockResolvedValueOnce(false);
      const pending = ensureCloudProviderConsent();
      pressAlertButton(CLOUD_PROVIDER_CONSENT_DETAILS_LABEL);
      await flush();
      expect(alertSpy).toHaveBeenCalledTimes(2);

      pressAlertButton(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);
      await expect(pending).resolves.toBe(false);
    });
  });

  describe('on iOS, where the provider list is closed before the question returns', () => {
    beforeEach(() => setPlatform('ios'));

    it('asks again when the provider list closes, without watching the app state', async () => {
      let closeBrowser: (opened: boolean) => void = () => undefined;
      mockOpenInAppBrowser.mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            closeBrowser = resolve;
          }),
      );
      const pending = ensureCloudProviderConsent();
      pressAlertButton(CLOUD_PROVIDER_CONSENT_DETAILS_LABEL);
      await flush();
      expect(alertSpy).toHaveBeenCalledTimes(1);

      closeBrowser(true);
      await flush();
      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(addAppStateListener).not.toHaveBeenCalled();

      pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
      await expect(pending).resolves.toBe(true);
    });

    it('keeps one question for every Send while it is on screen', async () => {
      const first = ensureCloudProviderConsent();
      moveApp('background');
      moveApp('active');
      const second = ensureCloudProviderConsent();
      expect(alertSpy).toHaveBeenCalledTimes(1);

      pressAlertButton(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);
      await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
    });
  });
});

describe('the permission belongs to the account that gave it', () => {
  it('records the account that allowed it and is current only for that account', () => {
    expect(recordCloudProviderConsent()).toBe(true);

    expect(readCloudProviderConsent()?.ownerId).toBe('person-a');
    expect(hasCurrentCloudProviderConsent()).toBe(true);
    expect(hasCloudProviderConsentForCurrentAccount()).toBe(true);
  });

  it('is not current for another account on the same phone', () => {
    recordCloudProviderConsent();
    activateCloudAccount('person-b');

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(hasCloudProviderConsentForCurrentAccount()).toBe(false);
    expect(isLlmGateOpen('openai')).toBe(false);
  });

  it('is not current once signed out, and records nothing while signed out', () => {
    recordCloudProviderConsent();
    invalidateCloudAccount();

    expect(hasCurrentCloudProviderConsent()).toBe(false);
    mockStorage.delete(CLOUD_PROVIDER_CONSENT_KEY);
    expect(recordCloudProviderConsent()).toBe(false);
    expect(mockStorage.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
  });

  it('does not ask while signed out', async () => {
    invalidateCloudAccount();

    await expect(ensureCloudProviderConsent()).resolves.toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('is not current when a stored answer has no account', () => {
    const { ownerId: _ownerId, ...withoutOwner } = (() => {
      recordCloudProviderConsent();
      return readCloudProviderConsent()!;
    })();
    mockStorage.set(CLOUD_PROVIDER_CONSENT_KEY, JSON.stringify(withoutOwner));

    expect(readCloudProviderConsent()).toBeNull();
    expect(hasCurrentCloudProviderConsent()).toBe(false);
  });

  it('does not carry an Allow given while the account changes over to the next account', async () => {
    const answer = ensureCloudProviderConsent();
    expect(alertSpy).toHaveBeenCalledTimes(1);

    activateCloudAccount('person-b');
    pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);

    await expect(answer).resolves.toBe(false);
    expect(readCloudProviderConsent()).toBeNull();
    expect(hasCurrentCloudProviderConsent()).toBe(false);
  });

  it('asks the next account its own question instead of reusing the open one', async () => {
    const first = ensureCloudProviderConsent();
    activateCloudAccount('person-b');

    const second = ensureCloudProviderConsent();
    expect(alertSpy).toHaveBeenCalledTimes(2);
    await expect(first).resolves.toBe(false);

    pressAlertButton(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL, 1);
    await expect(second).resolves.toBe(true);
    expect(readCloudProviderConsent()?.ownerId).toBe('person-b');
  });
});
