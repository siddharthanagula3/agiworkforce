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
  TERMS_OF_USE_URL,
} from '@/src/features/onboarding/components/FirstRunDisclosureModal';
import {
  SHORT_DISCLOSURE_DETAILS_LABEL,
  SHORT_DISCLOSURE_SUMMARY,
  composeShortFirstRunDisclosure,
} from '@agiworkforce/compliance';
import { API_URL } from '@/lib/constants';

const copy = composeShortFirstRunDisclosure({
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

  it('leads with the one-sentence AI disclosure and keeps the legal text behind its label', () => {
    const { getByText, queryByText } = renderModal();
    expect(getByText(SHORT_DISCLOSURE_SUMMARY)).toBeTruthy();
    expect(queryByText(/Responses can be inaccurate/)).toBeNull();
    fireEvent.press(getByText(SHORT_DISCLOSURE_DETAILS_LABEL));
    expect(getByText(copy.article50_1)).toBeTruthy();
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

  it('offers the Terms beside the privacy policy, at the address sign-in uses', () => {
    const { getByTestId } = renderModal();
    const card = within(getByTestId('disclosure-privacy-card'));
    expect(card.getByRole('link', { name: 'Read the AGI terms of use' })).toBeTruthy();
    expect(card.getByText('Terms of Use')).toBeTruthy();
    fireEvent.press(getByTestId('disclosure-terms-link'));
    expect(TERMS_OF_USE_URL).toBe(new URL('/terms', API_URL).toString());
    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(TERMS_OF_USE_URL);
  });

  it('shows one short line that the assistant can make mistakes, outside the privacy card', () => {
    const { getByTestId } = renderModal();
    expect(getByTestId('disclosure-check-answers-note')).toHaveTextContent(
      'AI can make mistakes. Check important answers.',
    );
    expect(
      within(getByTestId('disclosure-privacy-card')).queryByText(/Check important/),
    ).toBeNull();
  });

  it('opens the India DPDP notice in the in-app browser', () => {
    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('disclosure-dpdp-notice-link'));
    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(INDIA_DPDP_NOTICE_URL);
  });
});
