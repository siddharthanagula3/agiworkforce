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

import { render, fireEvent } from '@testing-library/react-native';
import {
  CHINESE_HQ_PROVIDER_IDS,
  composeFirstRunDisclosure,
  isProviderRoutingAllowed,
  type ChineseHqProviderId,
} from '@agiworkforce/compliance';
import {
  FirstRunDisclosureModal,
  PROVIDER_TOGGLE_TEST_ID_PREFIX,
} from '@/src/features/onboarding/components/FirstRunDisclosureModal';
import CloudPrivacyScreen from '@/src/features/settings/cloud-privacy';
import { PROVIDER_CONSENT_TEST_ID_PREFIX } from '@/src/features/settings/cloud-privacy/ChineseHqProviderConsentGroup';
import { mmkvDisclosureLedger, mmkvConsentLedger } from '@/services/complianceLedger';
import { applyChineseHqProviderConsent } from '@/services/providerConsent';
import { ensureLlmGateOpen } from '@/services/llmGate';
import { providerConsentErrorStateFromError } from '@/src/features/chat/utils/providerConsentRecovery';

const copy = composeFirstRunDisclosure({
  surface: 'mobile',
  offersManagedCloud: true,
  thirdPartyAiProviders: ['OpenAI'],
});

const GATED_PROVIDER: ChineseHqProviderId = 'deepseek';

function routingAllowed(providerId: string): boolean {
  return isProviderRoutingAllowed(providerId, mmkvConsentLedger);
}

beforeEach(() => {
  mockStorage.clear();
});

describe('first-run disclosure: per-provider China-HQ opt-in', () => {
  it('renders a toggle for every China-HQ provider, all OFF by default', () => {
    const { getByTestId } = render(
      <FirstRunDisclosureModal visible copy={copy} onAccept={jest.fn()} onDecline={jest.fn()} />,
    );

    for (const id of CHINESE_HQ_PROVIDER_IDS) {
      expect(getByTestId(`${PROVIDER_TOGGLE_TEST_ID_PREFIX}${id}`).props.value).toBe(false);
    }
  });

  it('accepting with a provider toggled ON writes a consent record that unblocks routing', () => {
    const onAccept = jest.fn();
    const { getByTestId } = render(
      <FirstRunDisclosureModal visible copy={copy} onAccept={onAccept} onDecline={jest.fn()} />,
    );

    fireEvent(
      getByTestId(`${PROVIDER_TOGGLE_TEST_ID_PREFIX}${GATED_PROVIDER}`),
      'valueChange',
      true,
    );
    fireEvent.press(getByTestId('disclosure-accept-btn'));

    expect(onAccept).toHaveBeenCalledWith([GATED_PROVIDER]);
    applyChineseHqProviderConsent(onAccept.mock.calls[0][0]);

    expect(routingAllowed(GATED_PROVIDER)).toBe(true);
    expect(mmkvConsentLedger.getNamedProviderConsent(GATED_PROVIDER)).toMatchObject({
      providerId: GATED_PROVIDER,
      accepted: true,
      surface: 'mobile',
    });
  });

  it('accepting with every toggle left OFF leaves all China-HQ routing blocked', () => {
    const onAccept = jest.fn();
    const { getByTestId } = render(
      <FirstRunDisclosureModal visible copy={copy} onAccept={onAccept} onDecline={jest.fn()} />,
    );

    fireEvent.press(getByTestId('disclosure-accept-btn'));

    expect(onAccept).toHaveBeenCalledWith([]);
    applyChineseHqProviderConsent(onAccept.mock.calls[0][0]);

    for (const id of CHINESE_HQ_PROVIDER_IDS) {
      expect(routingAllowed(id)).toBe(false);
    }
  });

  it('declining never records consent for any provider', () => {
    const onDecline = jest.fn();
    const { getByTestId } = render(
      <FirstRunDisclosureModal visible copy={copy} onAccept={jest.fn()} onDecline={onDecline} />,
    );

    fireEvent(
      getByTestId(`${PROVIDER_TOGGLE_TEST_ID_PREFIX}${GATED_PROVIDER}`),
      'valueChange',
      true,
    );
    fireEvent.press(getByTestId('disclosure-decline-btn'));

    expect(onDecline).toHaveBeenCalled();
    for (const id of CHINESE_HQ_PROVIDER_IDS) {
      expect(mmkvConsentLedger.getNamedProviderConsent(id)).toBeNull();
      expect(routingAllowed(id)).toBe(false);
    }
  });

  it('leaves non-China-HQ routing allowed regardless of the toggles', () => {
    expect(routingAllowed('openai')).toBe(true);
    expect(routingAllowed('anthropic')).toBe(true);
  });
});

describe('settings privacy screen: China-HQ provider consent', () => {
  it('reflects the stored ledger state and flips a declined provider on later', () => {
    applyChineseHqProviderConsent([]);
    expect(routingAllowed(GATED_PROVIDER)).toBe(false);

    const { getByTestId } = render(<CloudPrivacyScreen />);
    const toggle = getByTestId(`${PROVIDER_CONSENT_TEST_ID_PREFIX}${GATED_PROVIDER}`);
    expect(toggle.props.value).toBe(false);

    fireEvent(toggle, 'valueChange', true);

    expect(routingAllowed(GATED_PROVIDER)).toBe(true);
    expect(getByTestId(`${PROVIDER_CONSENT_TEST_ID_PREFIX}${GATED_PROVIDER}`).props.value).toBe(
      true,
    );
  });

  it('revokes a previously accepted provider, re-blocking routing', () => {
    applyChineseHqProviderConsent([GATED_PROVIDER]);
    expect(routingAllowed(GATED_PROVIDER)).toBe(true);

    const { getByTestId } = render(<CloudPrivacyScreen />);
    fireEvent(
      getByTestId(`${PROVIDER_CONSENT_TEST_ID_PREFIX}${GATED_PROVIDER}`),
      'valueChange',
      false,
    );

    expect(routingAllowed(GATED_PROVIDER)).toBe(false);
  });

  it('shows a row for every China-HQ provider so the article 50 promise is satisfiable', () => {
    const { getByTestId } = render(<CloudPrivacyScreen />);
    for (const id of CHINESE_HQ_PROVIDER_IDS) {
      expect(getByTestId(`${PROVIDER_CONSENT_TEST_ID_PREFIX}${id}`)).toBeTruthy();
    }
  });
});

describe('the real send-time gate follows the consent the UI wrote', () => {
  function acceptDisclosureOnly() {
    mmkvDisclosureLedger.write({
      version: 1,
      acceptedAt: new Date().toISOString(),
      surface: 'mobile',
      disclosureCopyHash: 'test-copy-hash',
      managedCloudAccepted: true,
      chineseHqProvidersAccepted: [],
    });
  }

  it('throws a provider-named gate error when the toggle was left OFF', () => {
    acceptDisclosureOnly();
    applyChineseHqProviderConsent([]);

    let thrown: unknown;
    try {
      ensureLlmGateOpen(GATED_PROVIDER);
    } catch (err) {
      thrown = err;
    }

    expect(providerConsentErrorStateFromError(thrown)).toEqual({
      providerId: GATED_PROVIDER,
      displayName: 'DeepSeek (China)',
      code: 'cn_hq_provider_not_opted_in',
    });
  });

  it('opens once the settings toggle flips the provider on', () => {
    acceptDisclosureOnly();
    applyChineseHqProviderConsent([]);

    const { getByTestId } = render(<CloudPrivacyScreen />);
    fireEvent(
      getByTestId(`${PROVIDER_CONSENT_TEST_ID_PREFIX}${GATED_PROVIDER}`),
      'valueChange',
      true,
    );

    expect(() => ensureLlmGateOpen(GATED_PROVIDER)).not.toThrow();
  });

  it('never gates a non-China-HQ provider', () => {
    acceptDisclosureOnly();
    applyChineseHqProviderConsent([]);

    expect(() => ensureLlmGateOpen('openai')).not.toThrow();
  });
});
