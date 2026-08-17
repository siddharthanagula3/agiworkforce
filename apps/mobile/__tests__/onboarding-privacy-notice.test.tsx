import { render, fireEvent, within } from '@testing-library/react-native';

const mockOpenInAppBrowser = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: (...args: unknown[]) => mockOpenInAppBrowser(...args),
  isAllowedExternalUrl: () => true,
}));

import {
  FirstRunDisclosureModal,
  PRIVACY_POLICY_URL,
  INDIA_DPDP_NOTICE_URL,
} from '@/src/features/onboarding/components/FirstRunDisclosureModal';
import { composeFirstRunDisclosure } from '@agiworkforce/compliance';

const copy = composeFirstRunDisclosure({
  surface: 'mobile',
  offersManagedCloud: false,
  thirdPartyAiProviders: [],
});

function renderModal() {
  return render(
    <FirstRunDisclosureModal visible copy={copy} onAccept={jest.fn()} onDecline={jest.fn()} />,
  );
}

describe('onboarding first-run disclosure shows a privacy notice', () => {
  beforeEach(() => {
    mockOpenInAppBrowser.mockClear();
  });

  it('renders the privacy notice card before the user can accept', () => {
    const { getByTestId } = renderModal();
    expect(getByTestId('disclosure-privacy-card')).toBeTruthy();
    expect(getByTestId('disclosure-accept-btn')).toBeTruthy();
  });

  it('names what the cloud path uploads, not just email and name', () => {
    const { getByTestId } = renderModal();
    const card = within(getByTestId('disclosure-privacy-card'));
    for (const phrase of [
      /messages you send/,
      /photos or files you attach/,
      /device identifier/,
      /model provider/,
      /stay on this device/,
    ]) {
      expect(card.getByText(phrase)).toBeTruthy();
    }
  });

  it('opens the privacy policy in the in-app browser', () => {
    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('disclosure-privacy-policy-link'));
    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  });

  it('opens the India DPDP notice in the in-app browser', () => {
    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('disclosure-dpdp-notice-link'));
    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(INDIA_DPDP_NOTICE_URL);
  });
});
