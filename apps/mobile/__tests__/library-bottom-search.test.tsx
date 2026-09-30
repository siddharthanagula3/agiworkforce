/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

const mockInsetBottom = 34;
let mockOwnerId = 'user_library_qa';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
  useAuthStore: (selector: (state: { clerkUserId: string }) => unknown) =>
    selector({ clerkUserId: mockOwnerId }),
}));

jest.mock('@/services/api', () => ({ api: { get: jest.fn(), delete: jest.fn() } }));

jest.mock('../src/features/auth/services/accountScopedUiState', () => ({
  captureAccountScopedUiState: (scope: 'local' | 'cloud') =>
    scope === 'local' ? { scope } : { scope, account: { ownerId: mockOwnerId } },
  isAccountScopedUiStateOwned: (state: { scope: string; account?: { ownerId: string } } | null) =>
    Boolean(state && (state.scope === 'local' || state.account?.ownerId === mockOwnerId)),
}));

jest.mock('../src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: () => ({ source: null, status: 'ready' }),
}));

jest.mock('../src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: () => null,
}));

import { api } from '@/services/api';
import { LibraryScreen } from '../src/features/library';

const mockApi = api as unknown as { get: jest.Mock; delete: jest.Mock };

const HOSTED_DOCUMENT = {
  id: '22222222-2222-4222-8222-222222222222',
  file_name: 'launch-plan.pdf',
  mime_type: 'application/pdf',
  kind: 'file',
  byte_count: 2048,
  uri: '/api/files/22222222-2222-4222-8222-222222222222',
  surface: 'file',
  previewable: false,
  origin: 'uploaded',
  source_surface: 'mobile',
  provider: null,
  model: null,
  prompt: null,
  created_at: '2026-07-30T10:04:00.000Z',
};

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
  beforeEach(() => {
    jest.clearAllMocks();
    mockOwnerId = 'user_library_qa';
    mockApi.delete.mockResolvedValue({ success: true });
    mockApi.get.mockImplementation(async (path: string) => {
      const query = new URL(`http://localhost${path}`).searchParams.get('q');
      return {
        items: !query || HOSTED_DOCUMENT.file_name.includes(query) ? [HOSTED_DOCUMENT] : [],
        has_more: false,
        next_offset: null,
      };
    });
  });

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
    expect(screen.getByTestId('library-search').props.style.marginBottom).toBe(
      mockInsetBottom + 10,
    );
  });

  it('still filters the grid and clears from the moved field', async () => {
    const screen = render(<LibraryScreen />);

    await waitFor(() => {
      expect(screen.getAllByText('launch-plan.pdf').length).toBeGreaterThan(0);
    });

    fireEvent.changeText(screen.getByLabelText('Search library'), 'nothing matches this');
    await waitFor(() => {
      expect(screen.queryByText('launch-plan.pdf')).toBeNull();
    });

    fireEvent.press(screen.getByLabelText('Clear library search'));
    await waitFor(() => {
      expect(screen.getAllByText('launch-plan.pdf').length).toBeGreaterThan(0);
    });
  });

  it('requests the selected sort order from hosted Library', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<LibraryScreen />);
    await waitFor(() =>
      expect(screen.getByTestId(`library-document-card-${HOSTED_DOCUMENT.id}`)).toBeTruthy(),
    );

    for (const [label, sort] of [
      ['Oldest first', 'oldest'],
      ['Type', 'type'],
    ]) {
      fireEvent.press(screen.getByLabelText('Library options'));
      const menu = alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>;
      act(() => menu.find((option) => option.text === 'Sort saved files')?.onPress?.());
      const sortOptions = alert.mock.calls.at(-1)?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      act(() => sortOptions.find((option) => option.text === label)?.onPress?.());
      await waitFor(() =>
        expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining(`sort=${sort}`)),
      );
    }

    alert.mockRestore();
  });

  it('selects loaded saved files and deletes only after server confirmation', async () => {
    const secondDocument = {
      ...HOSTED_DOCUMENT,
      id: '33333333-3333-4333-8333-333333333333',
      file_name: 'second-plan.pdf',
    };
    mockApi.get.mockResolvedValue({
      items: [HOSTED_DOCUMENT, secondDocument],
      has_more: false,
      next_offset: null,
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<LibraryScreen />);
    await waitFor(() =>
      expect(screen.getByTestId(`library-document-card-${HOSTED_DOCUMENT.id}`)).toBeTruthy(),
    );

    fireEvent.press(screen.getByLabelText('Library options'));
    const menu = alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>;
    act(() => menu.find((option) => option.text === 'Select saved files')?.onPress?.());
    fireEvent.press(screen.getByTestId('library-select-all-shown'));
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(screen.getByTestId('library-share-selected').props.accessibilityState.disabled).toBe(
      true,
    );
    fireEvent.press(screen.getByTestId('library-delete-selected'));
    expect(mockApi.delete).not.toHaveBeenCalled();
    const confirmation = alert.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    act(() => confirmation.find((option) => option.text === 'Delete')?.onPress?.());

    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('library-selection-actions')).toBeNull());
    expect(screen.queryByText('launch-plan.pdf')).toBeNull();
    expect(screen.queryByText('second-plan.pdf')).toBeNull();
    alert.mockRestore();
  });

  it('leaves a failed deletion selected for retry', async () => {
    mockApi.delete.mockResolvedValue({ success: false });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<LibraryScreen />);
    await waitFor(() =>
      expect(screen.getByTestId(`library-document-card-${HOSTED_DOCUMENT.id}`)).toBeTruthy(),
    );

    fireEvent.press(screen.getByLabelText('Library options'));
    const menu = alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>;
    act(() => menu.find((option) => option.text === 'Select saved files')?.onPress?.());
    fireEvent.press(screen.getByLabelText('Select launch-plan.pdf'));
    expect(screen.getByTestId('library-share-selected').props.accessibilityState.disabled).toBe(
      false,
    );
    fireEvent.press(screen.getByTestId('library-delete-selected'));
    const confirmation = alert.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    act(() => confirmation.find((option) => option.text === 'Delete')?.onPress?.());

    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('1 selected')).toBeTruthy());
    expect(screen.getByTestId(`library-document-card-${HOSTED_DOCUMENT.id}`)).toBeTruthy();
    expect(alert).toHaveBeenCalledWith('Some files could not be deleted', 'Try again.');
    alert.mockRestore();
  });

  it('closes selection when the signed-in account changes', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<LibraryScreen />);
    await waitFor(() =>
      expect(screen.getByTestId(`library-document-card-${HOSTED_DOCUMENT.id}`)).toBeTruthy(),
    );

    fireEvent.press(screen.getByLabelText('Library options'));
    const menu = alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>;
    act(() => menu.find((option) => option.text === 'Select saved files')?.onPress?.());
    fireEvent.press(screen.getByLabelText('Select launch-plan.pdf'));
    expect(screen.getByText('1 selected')).toBeTruthy();

    mockOwnerId = 'another-account';
    screen.rerender(<LibraryScreen />);
    expect(screen.queryByTestId('library-selection-actions')).toBeNull();
    expect(mockApi.delete).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
