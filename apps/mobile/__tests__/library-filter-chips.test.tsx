/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ openDrawer: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
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
  return { useThemeColors: () => actual.lightColors };
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

describe('Library filter chips', () => {
  it('renders every chip inside a horizontal ScrollView', () => {
    const screen = render(<LibraryScreen />);

    const rows = screen.UNSAFE_getAllByType(ScrollView).filter((node) => node.props.horizontal);
    expect(rows).toHaveLength(1);

    const [row] = rows;
    expect(row.props.showsHorizontalScrollIndicator).toBe(false);
    expect(row.props.style).toMatchObject({ flexGrow: 0 });
    expect(row.props.contentContainerStyle).toMatchObject({ paddingHorizontal: 16, gap: 8 });

    const chips = within(screen.getByTestId('library-filter-row'));
    for (const label of ['All', 'Images', 'Documents', 'Artifacts']) {
      expect(chips.getByLabelText(`${label} filter`)).toBeTruthy();
    }
  });

  it('keeps the last chip selectable', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByLabelText('Artifacts filter'));

    expect(screen.getByLabelText('Artifacts filter').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('All filter').props.accessibilityState.selected).toBe(false);
  });
});
