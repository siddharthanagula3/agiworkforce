/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Alert, Dimensions, StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSwitchToCloud = jest.fn(() => true);
const mockAuth = { isClerkLoaded: true, isClerkSignedIn: false };
const mockMode = { appMode: 'local' as 'local' | 'cloud' };

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: jest.fn().mockResolvedValue(true),
  openExternalUrl: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/src/features/auth/store', () => {
  const useAuthStore = (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth);
  useAuthStore.getState = () => mockAuth;
  useAuthStore.subscribe = () => () => undefined;
  return { useAuthStore };
});

jest.mock('@/src/features/chat/hooks/useAppModeSwitch', () => ({
  useAppModeSwitch: () => ({
    appMode: mockMode.appMode,
    cloudUnlocked: true,
    switchToLocal: jest.fn(() => true),
    switchToCloud: mockSwitchToCloud,
  }),
}));

jest.mock('@/src/features/settings/cloud-privacy/TrainingPreferenceGroups', () => {
  const RN = require('react-native');
  return { TrainingPreferenceGroups: () => <RN.View testID="training-groups" /> };
});
jest.mock('@/src/features/settings/cloud-privacy/UsOnlyRoutingGroup', () => {
  const RN = require('react-native');
  return { UsOnlyRoutingGroup: () => <RN.View testID="us-only-group" /> };
});
jest.mock('@/src/features/settings/cloud-privacy/ChineseHqProviderConsentGroup', () => {
  const RN = require('react-native');
  return { ChineseHqProviderConsentGroup: () => <RN.View testID="chinese-hq-group" /> };
});
jest.mock('@/src/features/settings/cloud-privacy/ProductAnalyticsConsentGroup', () => {
  const RN = require('react-native');
  return { ProductAnalyticsConsentGroup: () => <RN.View testID="analytics-group" /> };
});

import { openInAppBrowser } from '@/lib/safeOpenURL';
import { beginCloudPostAuthIntentForDestination } from '@/src/features/auth/services/postAuthIntent';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import CloudPrivacyScreen from '@/src/features/settings/cloud-privacy';
import { CLOUD_CHAT_RETENTION } from '@/src/features/settings/cloud-privacy/ChatPrivacyScreen';
import { PRIVACY_ARTICLES } from '@/src/features/settings/cloud-privacy/PrivacyArticleCards';
import { helpArticleUrl, MOBILE_HELP_ARTICLE_IDS } from '@/src/features/support/HelpArticleLink';
import { webContentPageUrl } from '@/src/platform/webContentPage';
import { TextScaleBoundary } from '@/src/shared/components/TextScaleBoundary';
import { ROW_LABEL_TEXT_SCALE_LIMIT } from '@/src/ui/theme/tokens';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '@/test-utils/textScale';

const mockOpenInAppBrowser = openInAppBrowser as jest.Mock;

const ACCOUNT_GROUP_IDS = ['training-groups', 'us-only-group', 'analytics-group'];
const CLOUD_GROUP_IDS = [...ACCOUNT_GROUP_IDS, 'chinese-hq-group'];

function headings() {
  return screen.getAllByRole('header').map((node) => String(node.props.children));
}

describe('the Privacy page', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSwitchToCloud.mockClear();
    mockOpenInAppBrowser.mockClear();
    mockOpenInAppBrowser.mockResolvedValue(true);
    mockAuth.isClerkLoaded = true;
    mockAuth.isClerkSignedIn = false;
    mockMode.appMode = 'local';
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('opens in Local Mode without an account and says what is true in both modes', () => {
    render(<CloudPrivacyScreen />);

    expect(screen.getByText('Clear answers about privacy, and the controls for it.')).toBeTruthy();
    expect(screen.getByText('Data privacy')).toBeTruthy();
    expect(screen.getByText(/Local chats stay on this device unless you sync them\./)).toBeTruthy();
    expect(screen.queryByText('Cloud privacy controls')).toBeNull();
  });

  it('opens the Privacy Policy from the inline link in the first card', () => {
    render(<CloudPrivacyScreen />);

    fireEvent.press(screen.getAllByText('Privacy Policy')[0]!);

    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(webContentPageUrl('/privacy'));
  });

  it('keeps the sections in the order of the privacy center', () => {
    render(<CloudPrivacyScreen />);
    const order = headings().filter((title) =>
      [
        'Explore your options',
        'Data privacy',
        'Our approach to privacy',
        'Learn and act',
        'Helpful resources',
      ].includes(title),
    );

    expect(order).toEqual([
      'Explore your options',
      'Data privacy',
      'Our approach to privacy',
      'Learn and act',
      'Helpful resources',
    ]);
  });

  it.each(['local', 'cloud'] as const)(
    'in %s mode opens Personalization, Chat privacy and Data use & access without sign-in',
    (mode) => {
      mockMode.appMode = mode;
      render(<CloudPrivacyScreen />);

      fireEvent.press(screen.getByLabelText('Personalization'));
      expect(mockPush).toHaveBeenLastCalledWith('/(app)/settings/personalization');
      fireEvent.press(screen.getByLabelText('Chat privacy'));
      expect(mockPush).toHaveBeenLastCalledWith('/(app)/settings/chat-privacy');
      fireEvent.press(screen.getByLabelText('Data use & access'));
      expect(mockPush).toHaveBeenLastCalledWith('/(app)/settings/data-use');
      expect(mockPush).toHaveBeenCalledTimes(3);
    },
  );

  it('leaves the processing list to Data use & access', () => {
    render(<CloudPrivacyScreen />);

    expect(screen.queryByText('Where each feature processes your data')).toBeNull();
  });

  function approachCards() {
    return screen
      .getByTestId('privacy-approach-cards')
      .findAll(
        (node) => node.props.accessibilityRole === 'text' && (node.type as unknown) === 'View',
      );
  }

  it('shows each privacy promise as a card a screen reader reads whole', () => {
    mockMode.appMode = 'cloud';
    useChatAppModeStore.setState({ appMode: 'cloud' });
    render(<CloudPrivacyScreen />);

    const cards = approachCards();
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.props.accessibilityLabel)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Model training\. /),
        expect.stringMatching(/^Telemetry off by default\. /),
        expect.stringMatching(/^Data retention\. /),
      ]),
    );
    expect(screen.getByTestId('privacy-approach-cards').props.snapToInterval).toBeGreaterThan(0);
    expect(screen.getByTestId('privacy-approach-cards').props.horizontal).toBe(true);
  });

  it('leaves the Cloud retention promise out of Local Mode, where a delete is immediate', () => {
    render(<CloudPrivacyScreen />);

    expect(approachCards().map((card) => card.props.accessibilityLabel)).toEqual([
      expect.stringMatching(/^Model training\. /),
      expect.stringMatching(/^Telemetry off by default\. /),
    ]);
    expect(screen.queryByText(CLOUD_CHAT_RETENTION)).toBeNull();
  });

  it('shows an article card for every privacy help article and opens it', () => {
    render(<CloudPrivacyScreen />);

    expect(PRIVACY_ARTICLES.map((article) => article.docId)).toEqual([
      'privacy-controls',
      'temporary-chats',
      'export-your-data',
      'delete-your-account',
      'account-security',
    ]);
    for (const article of PRIVACY_ARTICLES) {
      expect(MOBILE_HELP_ARTICLE_IDS).toContain(article.docId);
      expect(screen.getByLabelText(`${article.title}. ${article.category}`)).toBeTruthy();
    }

    fireEvent.press(screen.getByLabelText('Export a copy of your data. Data'));
    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(helpArticleUrl('export-your-data'));
  });

  it('tells the person when an article cannot be opened', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockOpenInAppBrowser.mockResolvedValue(false);
    render(<CloudPrivacyScreen />);

    fireEvent.press(screen.getByLabelText('Temporary chats. Privacy'));
    await screen.findByText('Helpful resources');
    await Promise.resolve();

    expect(alert).toHaveBeenCalledWith('Error', 'Could not open the link. Please try again.');
    alert.mockRestore();
  });

  it('ends with the policy, data rights, terms and help links', () => {
    render(<CloudPrivacyScreen />);

    fireEvent.press(screen.getByLabelText('Data rights requests'));
    expect(mockOpenInAppBrowser).toHaveBeenLastCalledWith(webContentPageUrl('/privacy/requests'));
    fireEvent.press(screen.getByLabelText('Terms of Service'));
    expect(mockOpenInAppBrowser).toHaveBeenLastCalledWith(webContentPageUrl('/terms'));
    fireEvent.press(screen.getByLabelText('Help Center'));
    expect(mockOpenInAppBrowser).toHaveBeenLastCalledWith(webContentPageUrl('/help'));
  });

  describe('the AGI Cloud controls', () => {
    it('offer sign-in, with no switch, in Local Mode without an account', () => {
      render(<CloudPrivacyScreen />);

      for (const id of ACCOUNT_GROUP_IDS) expect(screen.queryByTestId(id)).toBeNull();
      expect(screen.queryByRole('switch')).toBeNull();
      fireEvent.press(screen.getByLabelText('AGI Cloud privacy controls. Sign in'));
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith(
        beginCloudPostAuthIntentForDestination('/(app)/settings/cloud-privacy'),
      );
      expect(mockSwitchToCloud).not.toHaveBeenCalled();
    });

    it('offer sign-in in Cloud Mode when signed out', () => {
      mockMode.appMode = 'cloud';
      render(<CloudPrivacyScreen />);

      for (const id of ACCOUNT_GROUP_IDS) expect(screen.queryByTestId(id)).toBeNull();
      expect(screen.getByLabelText('AGI Cloud privacy controls. Sign in')).toBeTruthy();
    });

    it('offer the switch to AGI Cloud in Local Mode when signed in', () => {
      mockAuth.isClerkSignedIn = true;
      render(<CloudPrivacyScreen />);

      for (const id of ACCOUNT_GROUP_IDS) expect(screen.queryByTestId(id)).toBeNull();
      fireEvent.press(screen.getByLabelText('AGI Cloud privacy controls. Switch to AGI Cloud'));
      expect(mockSwitchToCloud).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('show every group, and no sign-in row, in Cloud Mode when signed in', () => {
      mockAuth.isClerkSignedIn = true;
      mockMode.appMode = 'cloud';
      render(<CloudPrivacyScreen />);

      for (const id of CLOUD_GROUP_IDS) expect(screen.getByTestId(id)).toBeTruthy();
      expect(screen.queryByLabelText(/^AGI Cloud privacy controls/)).toBeNull();
    });

    it('keep the China-headquartered provider choices reachable in Local Mode without an account', () => {
      render(<CloudPrivacyScreen />);

      expect(screen.getByTestId('chinese-hq-group')).toBeTruthy();
      for (const id of ACCOUNT_GROUP_IDS) expect(screen.queryByTestId(id)).toBeNull();
    });

    it('keep the China-headquartered provider choices reachable in Cloud Mode when signed out', () => {
      mockMode.appMode = 'cloud';
      render(<CloudPrivacyScreen />);

      expect(screen.getByTestId('chinese-hq-group')).toBeTruthy();
    });

    it('show nothing until the account check has finished', () => {
      mockAuth.isClerkLoaded = false;
      render(<CloudPrivacyScreen />);

      for (const id of CLOUD_GROUP_IDS) expect(screen.queryByTestId(id)).toBeNull();
      expect(screen.queryByLabelText(/^AGI Cloud privacy controls/)).toBeNull();
    });
  });

  it.each([
    ['the default text size', 1],
    ['the largest text size', LARGEST_IOS_TEXT_SCALE],
  ])('keeps the Personalization row name whole at %s', (_size, scale) => {
    const startingScale = Dimensions.get('window').fontScale;
    setTextScale(scale);
    try {
      render(
        <TextScaleBoundary>
          <CloudPrivacyScreen />
        </TextScaleBoundary>,
      );
      const row = screen.getByRole('button', { name: 'Personalization' });
      const label = within(row).getByText('Personalization');
      const heading = screen.getByText('Clear answers about privacy, and the controls for it.');
      expect(heading.props.numberOfLines).toBeUndefined();
      expect(heading.props.maxFontSizeMultiplier).toBeUndefined();
      if (scale === 1) {
        expect(label.props.numberOfLines).toBe(2);
        expect(label.props.maxFontSizeMultiplier).toBeUndefined();
        return;
      }
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.maxFontSizeMultiplier).toBe(ROW_LABEL_TEXT_SCALE_LIMIT);
      expect(within(row).getByTestId('settings-row-text-Personalization')).toBeTruthy();
    } finally {
      setTextScale(startingScale);
    }
  });
});

describe('the Privacy article cards at large text sizes', () => {
  it.each([
    ['the default text size', 1],
    ['the largest text size', LARGEST_IOS_TEXT_SCALE],
  ])('give each title room to wrap between words at %s', (_size, scale) => {
    const startingScale = Dimensions.get('window').fontScale;
    const { width } = Dimensions.get('window');
    setTextScale(scale);
    try {
      render(
        <TextScaleBoundary>
          <CloudPrivacyScreen />
        </TextScaleBoundary>,
      );
      for (const article of PRIVACY_ARTICLES) {
        const card = screen.getByRole('button', { name: `${article.title}. ${article.category}` });
        const cardWidth = StyleSheet.flatten(card.props.style).width as number;
        const title = screen.getByTestId(`privacy-article-title-${article.docId}`);
        if (scale === 1) {
          expect(cardWidth).toBe(Math.round(width * 0.56));
          expect(title.props.numberOfLines).toBe(2);
        } else {
          expect(cardWidth).toBeGreaterThanOrEqual(Math.round(width * 0.8));
          expect(cardWidth).toBeLessThan(width);
          expect(title.props.numberOfLines).toBeUndefined();
        }
      }
    } finally {
      setTextScale(startingScale);
    }
  });
});
