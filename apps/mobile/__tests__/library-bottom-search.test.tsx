/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * PAR-M31 — Library search is bottom-anchored, not wedged between the filter
 * chips and the grid.
 *
 * Both references float search as a pill under the thumb (IMG_0690, IMG_0753)
 * and the chats list already shipped that treatment, so the static field here
 * both cost ~56pt of first-screen grid and made two sibling list screens
 * contradict each other. Library now renders the shared `BottomSearchBar`.
 */
import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

const mockInsetBottom = 34;

jest.mock('expo-router', () => ({
  // `useNavigation`/`useFocusEffect` come from expo-router, NOT
  // @react-navigation/native: the monorepo resolves several copies of that
  // package and importing from it crashed the app at launch. The mock has to
  // follow the production import or every screen using them throws here.
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // Stands in for useFocusEffect's fire-once-on-focus behaviour. Adding `cb` to the
    // deps would re-run it on every render, which is the opposite of what it mocks.
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
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: mockInsetBottom, left: 0 }),
}));

jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: Record<string, unknown>) => <RN.View {...props} /> };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return { useThemeColors: () => actual.lightColors };
});

jest.mock('../src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

const mockConversation = {
  id: 'conversation-1',
  title: 'Design launch',
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:05:00.000Z',
  messageCount: 1,
  pinned: false,
  executionMode: 'local' as const,
};
const mockMessages = {
  'conversation-1': [
    {
      id: 'message-1',
      conversationId: 'conversation-1',
      role: 'user' as const,
      content: 'Here is the plan',
      createdAt: '2026-07-30T10:04:00.000Z',
      attachments: [
        {
          url: 'file:///documents/launch-plan.pdf',
          mimeType: 'application/pdf',
          fileName: 'launch-plan.pdf',
          fileSize: 2048,
        },
      ],
    },
  ],
};

jest.mock('../stores/chatStore', () => ({
  useChatStore: (selector: (state: { conversations: unknown[]; messages: object }) => unknown) =>
    selector({ conversations: [mockConversation], messages: mockMessages }),
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

/** testIDs in rendered document order — cheap proof of vertical placement. */
function testIDsInOrder(root: ReactTestInstance): string[] {
  const ids: string[] = [];
  const walk = (node: ReactTestInstance) => {
    const id: unknown = node.props?.testID;
    if (typeof id === 'string') ids.push(id);
    for (const child of node.children) {
      if (typeof child !== 'string') walk(child);
    }
  };
  walk(root);
  return ids;
}

describe('Library bottom-anchored search', () => {
  it('renders search below the grid, not between the chips and the grid', () => {
    const screen = render(<LibraryScreen />);

    const ids = testIDsInOrder(screen.UNSAFE_root);
    expect(ids.indexOf('library-filter-row')).toBeLessThan(ids.indexOf('library-grid'));
    expect(ids.indexOf('library-grid')).toBeLessThan(ids.indexOf('library-search'));
    expect(ids).toContain('library-search');
  });

  it('keeps the field out of the scrolling grid so it stays reachable', () => {
    const screen = render(<LibraryScreen />);

    expect(within(screen.getByTestId('library-grid')).queryByTestId('library-search')).toBeNull();
    // Same shared pill as Chats and Projects: it owns the home-indicator gap.
    expect(screen.getByTestId('library-search').props.style.marginBottom).toBe(
      mockInsetBottom + 10,
    );
  });

  it('still filters the grid and clears from the moved field', () => {
    const screen = render(<LibraryScreen />);

    expect(screen.getAllByText('launch-plan.pdf').length).toBeGreaterThan(0);

    fireEvent.changeText(screen.getByLabelText('Search library'), 'nothing matches this');
    expect(screen.queryByText('launch-plan.pdf')).toBeNull();

    fireEvent.press(screen.getByLabelText('Clear library search'));
    expect(screen.getAllByText('launch-plan.pdf').length).toBeGreaterThan(0);
  });
});
