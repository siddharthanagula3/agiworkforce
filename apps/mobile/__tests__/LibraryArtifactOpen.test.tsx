/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockIsDark = false;
const mockPush = jest.fn();
const mockArtifact = {
  id: 'artifact-1',
  title: 'Quarterly plan',
  kind: 'document',
  content: 'Quarterly plan\nSecond page of the full plan',
  ageLabel: '2h ago',
  sourceLabel: 'Chat',
  accentColor: '#fff',
  previewLines: ['Quarterly plan'],
  provenance: { scope: 'local' },
};

const mockCodeArtifact = {
  ...mockArtifact,
  id: 'artifact-2',
  title: 'Parser script',
  kind: 'code',
  language: 'typescript',
  content: 'export const parse = () => 1;',
  previewLines: ['export const parse'],
};

const mockChartArtifact = {
  ...mockArtifact,
  id: 'artifact-3',
  title: 'Revenue chart',
  kind: 'chart',
  content: '{}',
  previewLines: ['Revenue'],
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
  mergeMobileArtifactsForGallery: () => [mockArtifact, mockCodeArtifact, mockChartArtifact],
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

describe('Library artifact rows', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('opens the full artifact from a Library result through the artifact viewer route', () => {
    const screen = render(<LibraryScreen />);

    const card = screen.getByLabelText('Open artifact Quarterly plan, 2h ago');
    expect(card.props.accessibilityRole).toBe('button');
    fireEvent.press(card);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/artifacts',
      params: { artifactId: 'artifact-1' },
    });
  });

  it('finds the artifact by content search and still opens it', () => {
    const screen = render(<LibraryScreen />);
    fireEvent.press(screen.getByLabelText('Artifacts filter'));

    fireEvent.press(screen.getByLabelText('Open artifact Quarterly plan, 2h ago'));

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('narrows artifacts to the kind picked in the filter row', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByLabelText('Code filter'));
    expect(screen.getByLabelText(/Open artifact Parser script/)).toBeTruthy();
    expect(screen.queryByLabelText(/Open artifact Quarterly plan/)).toBeNull();
    expect(screen.queryByLabelText(/Open artifact Revenue chart/)).toBeNull();

    fireEvent.press(screen.getByLabelText('Charts filter'));
    expect(screen.getByLabelText(/Open artifact Revenue chart/)).toBeTruthy();
    expect(screen.queryByLabelText(/Open artifact Parser script/)).toBeNull();

    fireEvent.press(screen.getByLabelText('Research filter'));
    expect(screen.queryByLabelText(/Open artifact/)).toBeNull();
  });
});
