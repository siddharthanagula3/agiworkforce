/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import {
  actionMenuLabels,
  actionMenuMessage,
  actionMenuTitle,
  chooseActionMenuItem,
  selectedActionMenuLabels,
} from '@/test-utils/actionMenu';

let mockIsDark = false;

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => cb(), [cb]);
  },
  useRouter: () => ({ push: jest.fn() }),
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
  mergeMobileArtifactsForGallery: () => [],
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

import { LibraryScreen } from '../src/features/library';
import { lightColors, spacing } from '../src/ui/theme/tokens';

function pageBackground(screen: ReturnType<typeof render>) {
  const tree = screen.toJSON();
  const root = Array.isArray(tree) ? tree[0] : tree;
  return StyleSheet.flatten(root?.props.style).backgroundColor;
}

describe('Library filter chips', () => {
  it('centres a semibold Library title in the header', () => {
    const screen = render(<LibraryScreen />);

    const title = StyleSheet.flatten(screen.getByText('Library').props.style);
    expect(title).toMatchObject({ textAlign: 'center', fontWeight: '600' });
  });

  it('renders every chip inside a horizontal ScrollView', () => {
    const screen = render(<LibraryScreen />);

    const rows = screen.UNSAFE_getAllByType(ScrollView).filter((node) => node.props.horizontal);
    expect(rows).toHaveLength(1);

    const [row] = rows;
    expect(row.props.showsHorizontalScrollIndicator).toBe(false);
    expect(row.props.style).toMatchObject({ flexGrow: 0 });
    expect(row.props.contentContainerStyle).toMatchObject({ paddingHorizontal: 16, gap: 8 });

    const chips = within(screen.getByTestId('library-filter-row'));
    for (const label of ['All', 'Images', 'Documents', 'Artifacts', 'Code', 'Charts', 'Research']) {
      expect(chips.getByLabelText(`${label} filter`)).toBeTruthy();
    }
  });

  it('keeps the chip row at full height with theme spacing above and below', () => {
    const screen = render(<LibraryScreen />);

    const row = screen.UNSAFE_getAllByType(ScrollView).find((node) => node.props.horizontal);
    expect(row?.props.style).toMatchObject({ flexGrow: 0, flexShrink: 0 });
    expect(row?.props.contentContainerStyle).toMatchObject({
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    });
  });

  it('keeps the last chip selectable', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByLabelText('Artifacts filter'));

    expect(screen.getByLabelText('Artifacts filter').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('All filter').props.accessibilityState.selected).toBe(false);
  });

  it.each([
    ['images', 'Images filter'],
    ['documents', 'Documents filter'],
    ['artifacts', 'Artifacts filter'],
    ['code', 'Code filter'],
  ])('opens on the %s chip when the route asks for it', (initialFilter, label) => {
    const screen = render(<LibraryScreen initialFilter={initialFilter} />);

    expect(screen.getByLabelText(label).props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('All filter').props.accessibilityState.selected).toBe(false);
  });

  it('applies a changed route filter while the screen stays mounted', () => {
    const screen = render(<LibraryScreen />);
    expect(screen.getByLabelText('All filter').props.accessibilityState.selected).toBe(true);

    screen.rerender(<LibraryScreen initialFilter="images" />);

    expect(screen.getByLabelText('Images filter').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('All filter').props.accessibilityState.selected).toBe(false);
  });

  it('returns to All when the route filter is removed while mounted', () => {
    const screen = render(<LibraryScreen initialFilter="images" />);

    screen.rerender(<LibraryScreen />);

    expect(screen.getByLabelText('All filter').props.accessibilityState.selected).toBe(true);
  });

  it.each([undefined, '', 'everything', 'IMAGES'])(
    'opens on All when the route filter is %p',
    (initialFilter) => {
      const screen = render(<LibraryScreen initialFilter={initialFilter} />);

      expect(screen.getByLabelText('All filter').props.accessibilityState.selected).toBe(true);
    },
  );

  it('opens the saved-files sort options from the Library header', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByLabelText('Library options'));
    expect(actionMenuTitle()).toBe('Library');
    expect(actionMenuMessage()).toBeNull();
    chooseActionMenuItem('Sort saved files');
    expect(actionMenuTitle()).toBe('Sort saved files');
    expect(actionMenuMessage()).toBe('Artifacts keep their own order.');
    expect(actionMenuLabels()).toEqual(['Recently added', 'Oldest first', 'Type', 'Name', 'Size']);
    expect(selectedActionMenuLabels()).toEqual(['Recently added']);
    chooseActionMenuItem('Name');
    fireEvent.press(screen.getByLabelText('Library options'));
    chooseActionMenuItem('Sort saved files');
    expect(selectedActionMenuLabels()).toEqual(['Name']);
  });

  it.each([
    [true, lightColors.background],
    [false, lightColors.surfaceBase],
  ])('paints the page root for dark mode %s with the right surface', (isDark, expected) => {
    mockIsDark = isDark;
    try {
      expect(pageBackground(render(<LibraryScreen />))).toBe(expected);
    } finally {
      mockIsDark = false;
    }
  });
});
