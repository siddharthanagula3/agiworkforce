import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Dimensions, ScrollView, StyleSheet, Text, type StyleProp } from 'react-native';
import { FileText } from 'lucide-react-native';

let mockLargeText = false;

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '0.0.1', ios: { buildNumber: '2' } },
    platform: { ios: { buildNumber: '42' } },
  },
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('@/lib/safeOpenURL', () => ({ openInAppBrowser: jest.fn().mockResolvedValue(true) }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/shared/hooks/useLargeTextRows', () => ({
  useLargeTextRows: () => mockLargeText,
}));

import AboutScreen from '../app/(app)/about';
import FeedbackScreen from '../src/features/feedback';
import { SettingsScreenShell } from '../src/features/settings/Common';
import { PrivacyApproachCards } from '../src/features/settings/cloud-privacy/PrivacyApproachCards';
import { PrivacyArticleCards } from '../src/features/settings/cloud-privacy/PrivacyArticleCards';
import { TraitLevelSheet } from '../src/features/settings/personalization/TraitLevelSheet';
import { READING_COLUMN_MAX_WIDTH } from '../src/shared/layout/contentColumn';

const IPHONE_WINDOW = 402;
const WIDEST_IPHONE_WINDOW = 440;
const ELEVEN_INCH_PORTRAIT = 820;
const THIRTEEN_INCH_PORTRAIT = 1032;
const THIRTEEN_INCH_LANDSCAPE = 1376;
const WINDOWS = [
  IPHONE_WINDOW,
  ELEVEN_INCH_PORTRAIT,
  THIRTEEN_INCH_PORTRAIT,
  THIRTEEN_INCH_LANDSCAPE,
] as const;

const startingWindow = Dimensions.get('window');
const startingScreen = Dimensions.get('screen');

function setWindowWidth(width: number) {
  const window = { ...startingWindow, width, height: 1376 };
  act(() => {
    Dimensions.set({ window, screen: { ...startingScreen, width, height: 1376 } });
  });
}

function flat(style: StyleProp<object> | undefined) {
  return StyleSheet.flatten(style) as Record<string, unknown>;
}

function scrollContent() {
  return flat(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle);
}

const APPROACH_ITEMS = [
  {
    key: 'one',
    label: 'Your chats are yours',
    body: 'Local chats never leave the device.',
    icon: FileText,
  },
  {
    key: 'two',
    label: 'You choose what is shared',
    body: 'Cloud chats use your account.',
    icon: FileText,
  },
];

afterEach(() => {
  mockLargeText = false;
  act(() => {
    Dimensions.set({ window: startingWindow, screen: startingScreen });
  });
});

describe('the settings shell on a tablet', () => {
  it.each(WINDOWS)('keeps its content in one centred reading column at %i points', (window) => {
    setWindowWidth(window);
    render(
      <SettingsScreenShell title="Storage">
        <Text>Row</Text>
      </SettingsScreenShell>,
    );

    const content = scrollContent();

    expect(content).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: 16,
    });
  });

  it.each([IPHONE_WINDOW, WIDEST_IPHONE_WINDOW])(
    'keeps the padding an iPhone shows at %i points',
    (window) => {
      setWindowWidth(window);
      render(
        <SettingsScreenShell title="Storage">
          <Text>Row</Text>
        </SettingsScreenShell>,
      );

      const content = scrollContent();

      expect(content).toMatchObject({
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 36,
      });
      expect(content.maxWidth as number).toBeGreaterThanOrEqual(window);
    },
  );
});

describe('the Privacy carousels beside the permanent drawer', () => {
  const approachWidths = () =>
    screen
      .getAllByRole('text')
      .map((card) => flat(card.props.style).width as number)
      .filter((width) => typeof width === 'number');
  const articleWidths = () =>
    screen
      .getAllByRole('button')
      .map((card) => flat(card.props.style).width as number)
      .filter((width) => typeof width === 'number');

  it.each([
    [IPHONE_WINDOW, 322, 225],
    [ELEVEN_INCH_PORTRAIT, 576, 403],
    [THIRTEEN_INCH_PORTRAIT, 576, 403],
    [THIRTEEN_INCH_LANDSCAPE, 576, 403],
  ])('sizes the cards to the column at %i points', (window, approach, article) => {
    setWindowWidth(window);
    render(
      <>
        <PrivacyApproachCards items={APPROACH_ITEMS} />
        <PrivacyArticleCards />
      </>,
    );

    expect(new Set(approachWidths())).toEqual(new Set([approach]));
    expect(new Set(articleWidths())).toEqual(new Set([article]));
  });

  it.each([
    [IPHONE_WINDOW, 342],
    [THIRTEEN_INCH_PORTRAIT, 612],
    [THIRTEEN_INCH_LANDSCAPE, 612],
  ])('keeps the large text article cards inside the column at %i points', (window, expected) => {
    mockLargeText = true;
    setWindowWidth(window);
    render(<PrivacyArticleCards />);

    expect(new Set(articleWidths())).toEqual(new Set([expected]));
  });

  it('never makes a card wider than the pane it sits in', () => {
    for (const window of WINDOWS) {
      setWindowWidth(window);
      const { unmount } = render(<PrivacyApproachCards items={APPROACH_ITEMS} />);
      const pane = window >= 1000 ? window - 280 : window;
      for (const width of approachWidths()) {
        expect(width).toBeLessThanOrEqual(pane - 2 * 16);
      }
      unmount();
    }
  });
});

describe('About and Report App Issue on a tablet', () => {
  it.each(WINDOWS)('hold About in a reading column at %i points', (window) => {
    setWindowWidth(window);
    render(<AboutScreen />);

    expect(scrollContent()).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: 16,
    });
  });

  it.each(WINDOWS)('hold Report App Issue in a reading column at %i points', (window) => {
    setWindowWidth(window);
    render(<FeedbackScreen />);

    expect(scrollContent()).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: 16,
    });
  });

  it('says the app runs on the device, not on a phone', () => {
    render(<AboutScreen />);

    expect(screen.getByText('Private Local Mode and AGI Cloud, on your device.')).toBeTruthy();
  });
});

describe('the trait level sheet on a tablet', () => {
  it('holds the sheet in a reading column so the scrim shows either side of it', () => {
    render(
      <TraitLevelSheet
        trait={{ key: 'warmth', label: 'Warm' }}
        level="default"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    const sheet = screen.UNSAFE_root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityViewIsModal === true,
    )[0];
    let holder = sheet?.parent ?? null;
    let capped: Record<string, unknown> | null = null;
    while (holder && !capped) {
      const style = flat(holder.props.style);
      if (style?.maxWidth) capped = style;
      holder = holder.parent;
    }

    expect(capped).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
    });
  });
});

const MOBILE_ROOT = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(MOBILE_ROOT, relative), 'utf8');

describe('every settings screen and sheet holds its content in a column', () => {
  const SCROLLING_SCREENS = [
    'src/features/settings/personalization/index.tsx',
    'src/features/settings/permissions/Detail.tsx',
    'src/features/settings/account-security/PasskeysSection.tsx',
    'app/(app)/settings/memory.tsx',
    'app/(app)/settings/archived-chats.tsx',
    'app/(app)/settings/workspace.tsx',
    'app/(app)/settings/reflect.tsx',
    'app/(app)/settings/integrations.tsx',
    'app/(app)/settings/memory-import.tsx',
    'app/(app)/settings/performance.tsx',
  ];
  const BOTTOM_SHEETS = [
    'src/features/settings/components/AddMemorySheet.tsx',
    'src/features/settings/account-security/TwoFactorSection.tsx',
    'src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx',
    'src/features/settings/cloud-connectors/ConnectorApiKeySheet.tsx',
    'src/features/settings/media/index.tsx',
    'src/features/settings/voice/index.tsx',
  ];

  it.each(SCROLLING_SCREENS)('%s caps its scrolling content', (file) => {
    expect(read(file)).toMatch(
      /contentContainerStyle=\{\{[^}]*\.\.\.contentColumn\('reading'\)[^}]*\}\}/,
    );
  });

  it.each(BOTTOM_SHEETS)('%s caps its sheet', (file) => {
    expect(read(file)).toMatch(/contentColumn\('reading'\)/);
  });

  it('caps the provider consent dialog at the form width', () => {
    expect(read('src/features/settings/cloud-privacy/NamedProviderConsentModal.tsx')).toMatch(
      /contentColumn\('form'\)/,
    );
  });
});
