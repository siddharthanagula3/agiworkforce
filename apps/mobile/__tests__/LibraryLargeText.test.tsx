/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockIsDark = false;
const mockPush = jest.fn();
const mockPreview = [
  'export const parse',
  'return 1',
  'return 2',
  'return 3',
  'return 4',
  'return 5',
];
const mockArtifact = {
  id: 'artifact-tile',
  title: 'Parser script',
  kind: 'code',
  language: 'typescript',
  content: mockPreview.join('\n'),
  ageLabel: '2h ago',
  sourceLabel: 'Chat',
  accentColor: '#fff',
  previewLines: mockPreview,
  provenance: { scope: 'local' },
};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ openDrawer: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, style }: { children: React.ReactNode; style?: unknown }) => {
    const { View } = require('react-native');
    return <View style={style as never}>{children}</View>;
  },
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: Record<string, unknown>) => <RN.View {...props} /> };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <RN.View {...props} /> });
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return {
    useThemeColors: () => actual.lightColors,
    useTheme: () => ({ colors: actual.lightColors, isDark: mockIsDark }),
  };
});

jest.mock('../src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

jest.mock('../stores/chatStore', () => ({
  useChatStore: (selector: (state: { conversations: never[]; messages: object }) => unknown) =>
    selector({ conversations: [], messages: {} }),
}));

jest.mock('../stores/chat/chatCloudMessageStore', () => ({
  useChatCloudMessageStore: (
    selector: (state: { conversations: never[]; messages: object }) => unknown,
  ) => selector({ conversations: [], messages: {} }),
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (state: { appMode: 'local' }) => unknown) =>
    selector({ appMode: 'local' }),
}));

jest.mock('../src/features/artifacts/store', () => ({
  useArtifactStore: (
    selector: (state: {
      artifacts: never[];
      cloudArtifacts: never[];
      cloudArtifactsOwnerId: null;
    }) => unknown,
  ) => selector({ artifacts: [], cloudArtifacts: [], cloudArtifactsOwnerId: null }),
  mergeMobileArtifactsForGallery: () => [mockArtifact],
  accentColorForKind: () => '#fff',
}));

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (selector: (state: { clerkUserId: null }) => unknown) =>
    selector({ clerkUserId: null }),
}));

jest.mock('../src/features/auth/services/accountScopedUiState', () => ({
  captureAccountScopedUiState: () => ({ scope: 'local' }),
  isAccountScopedUiStateOwned: () => true,
}));

jest.mock('../src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: () => ({ source: null, status: 'ready' }),
}));

jest.mock('../src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: () => null,
}));

import { Dimensions, StyleSheet } from 'react-native';
import { LibraryScreen } from '../src/features/library';
import { HEADER_TEXT_SCALE_LIMIT } from '../src/features/chat/components/WorkModeSwitch';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '../test-utils/textScale';

describe('Library at large text sizes', () => {
  const startingScale = Dimensions.get('window').fontScale;

  afterEach(() => setTextScale(startingScale));

  describe.each([
    ['the default text size', 1],
    ['the largest text size', LARGEST_IOS_TEXT_SCALE],
  ])('at %s', (_name, scale) => {
    beforeEach(() => setTextScale(scale));

    it('gives the header a minimum height and a capped title so the title is never cut', () => {
      const screen = render(<LibraryScreen />);

      const header = screen.getByTestId('library-header');
      expect(String(header.props.className)).toMatch(/\bmin-h-12\b/);
      expect(String(header.props.className)).not.toMatch(/(^|\s)h-12\b/);
      const title = screen.getByRole('header', { name: 'Library' });
      expect(title.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
    });

    it('lays the artifact tile out as a column with the kind label in flow above the preview', () => {
      const screen = render(<LibraryScreen />);

      const labelRow = screen.getByTestId(`library-artifact-kind-row-${mockArtifact.id}`);
      const preview = screen.getByTestId(`library-artifact-preview-${mockArtifact.id}`);
      expect(String(labelRow.props.className)).not.toMatch(/\babsolute\b/);
      expect(String(preview.props.className)).not.toMatch(/\babsolute\b/);
      expect(String(preview.props.className)).toMatch(/\bflex-1\b/);
      expect(String(preview.props.className)).toMatch(/\boverflow-hidden\b/);
      const tileOrder = screen
        .getByTestId(`library-artifact-tile-${mockArtifact.id}`)
        .findAll((node) => typeof node.props.testID === 'string')
        .map((node) => node.props.testID);
      expect(
        tileOrder.indexOf(`library-artifact-kind-row-${mockArtifact.id}`),
      ).toBeGreaterThanOrEqual(0);
      expect(tileOrder.indexOf(`library-artifact-kind-row-${mockArtifact.id}`)).toBeLessThan(
        tileOrder.indexOf(`library-artifact-preview-${mockArtifact.id}`),
      );
    });

    it('caps the kind label like header text on one line, as plain text with no badge', () => {
      const screen = render(<LibraryScreen />);

      const kind = screen.getByTestId(`library-artifact-kind-${mockArtifact.id}`);
      expect(kind.props.children).toBe('typescript');
      expect(kind.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(kind.props.numberOfLines).toBe(1);
      expect(StyleSheet.flatten(kind.props.style).backgroundColor).toBeUndefined();
    });

    it('keeps the tile preview to the lines that fit under the label', () => {
      const screen = render(<LibraryScreen />);

      for (const line of mockPreview.slice(0, 4)) expect(screen.getByText(line)).toBeTruthy();
      expect(screen.queryByText('return 4')).toBeNull();
    });
  });
});
