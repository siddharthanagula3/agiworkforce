/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();

const mockConversation = {
  id: 'conversation-1',
  title: 'Design launch',
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:05:00.000Z',
  messageCount: 1,
  pinned: false,
  executionMode: 'local' as const,
};
const mockImageMessage = {
  id: 'image-message-1',
  conversationId: mockConversation.id,
  role: 'assistant' as const,
  content: 'Generated image',
  createdAt: '2026-07-30T10:04:00.000Z',
  type: 'image' as const,
  imageUrl: '/api/files/11111111-1111-4111-8111-111111111111',
  imageGenPersisted: true,
  imageGenStatus: 'completed' as const,
  imageGenPrompt: 'Launch poster',
  attachments: [
    {
      url: 'file:///documents/launch-plan.pdf',
      mimeType: 'application/pdf',
      fileName: 'launch-plan.pdf',
      fileSize: 2048,
    },
  ],
};

jest.mock('expo-router', () => ({
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
  useChatStore: (
    selector: (state: {
      conversations: (typeof mockConversation)[];
      messages: Record<string, (typeof mockImageMessage)[]>;
    }) => unknown,
  ) =>
    selector({
      conversations: [mockConversation],
      messages: { [mockConversation.id]: [mockImageMessage] },
    }),
}));

jest.mock('../stores/chat/chatCloudMessageStore', () => ({
  useChatCloudMessageStore: (
    selector: (state: { conversations: never[]; messages: Record<string, never[]> }) => unknown,
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
    selector({ clerkUserId: 'user_library_qa' }),
}));

jest.mock('@/services/api', () => ({ api: { get: jest.fn(), delete: jest.fn() } }));

jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: jest.fn(async () => 'file:///exports/launch-plan.pdf'),
  shareFile: jest.fn(async () => undefined),
}));

jest.mock('../src/features/auth/services/accountScopedUiState', () => ({
  captureAccountScopedUiState: () => ({ scope: 'local' }),
  isAccountScopedUiStateOwned: () => true,
}));

jest.mock('../src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: () => ({ source: null, status: 'ready' }),
}));

jest.mock('../src/features/image/services/imagegen', () => ({
  getDurableGeneratedImagePath: ({ url }: { url: string }) => url,
}));

jest.mock('../src/features/chat/components/ImageFullScreen', () => {
  const RN = require('react-native');
  return {
    ImageFullScreen: ({ visible, imageUrl }: { visible: boolean; imageUrl: string | null }) =>
      visible ? (
        <RN.View testID="library-image-preview" accessibilityLabel={imageUrl ?? undefined} />
      ) : null,
  };
});

import { api } from '@/services/api';
import { downloadGeneratedFile, shareFile } from '@/services/fileCreation';
import { LibraryScreen } from '../src/features/library';

const mockApi = api as unknown as { get: jest.Mock };

const HOSTED_IMAGE = {
  id: '11111111-1111-4111-8111-111111111111',
  file_name: 'poster.png',
  mime_type: 'image/png',
  kind: 'image',
  byte_count: 1024,
  uri: '/api/files/11111111-1111-4111-8111-111111111111',
  surface: 'file',
  previewable: true,
  origin: 'generated',
  source_surface: 'web',
  provider: null,
  model: null,
  prompt: 'Launch poster',
  created_at: '2026-07-30T10:04:00.000Z',
};

const HOSTED_DOCUMENT = {
  ...HOSTED_IMAGE,
  id: '22222222-2222-4222-8222-222222222222',
  file_name: 'launch-plan.pdf',
  mime_type: 'application/pdf',
  kind: 'file',
  uri: '/api/files/22222222-2222-4222-8222-222222222222',
  previewable: false,
  origin: 'uploaded',
  prompt: null,
};

describe('Library reads the account library, not the local transcript', () => {
  beforeEach(() => {
    mockPush.mockClear();
    jest.clearAllMocks();
    mockApi.get.mockImplementation(async (path: string) => {
      const query = new URL(`http://localhost${path}`).searchParams.get('q');
      const items = [HOSTED_IMAGE, HOSTED_DOCUMENT].filter(
        (entry) => !query || entry.file_name.includes(query),
      );
      return { items, has_more: false, next_offset: null };
    });
  });

  it('opens the exact authorized generated image from the hosted library', async () => {
    const screen = render(<LibraryScreen initialImageId={HOSTED_IMAGE.id} />);

    await waitFor(() => {
      expect(screen.getByLabelText(HOSTED_IMAGE.uri)).toBeTruthy();
    });
  });

  it('renders a hosted document, filters it by the search field, and shares it on press', async () => {
    const screen = render(<LibraryScreen />);

    await waitFor(() => {
      expect(screen.getAllByText('launch-plan.pdf').length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByText('Documents'));
    fireEvent.changeText(screen.getByLabelText('Search library'), 'missing');
    await waitFor(() => {
      expect(screen.queryByText('launch-plan.pdf')).toBeNull();
    });
    expect(screen.getByText(/Nothing in documents matches/)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Search library'), 'launch');
    await waitFor(() => {
      expect(screen.getAllByText('launch-plan.pdf').length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByLabelText('Open launch-plan.pdf'));
    await waitFor(() => {
      expect(downloadGeneratedFile).toHaveBeenCalled();
      expect(shareFile).toHaveBeenCalledWith('file:///exports/launch-plan.pdf');
    });
  });
});
