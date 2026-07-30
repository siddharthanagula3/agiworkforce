/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

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
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ openDrawer: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
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

import { LibraryScreen } from '../src/features/library';

describe('Library global-search deep link', () => {
  it('opens the exact authorized generated image', async () => {
    const screen = render(<LibraryScreen initialImageId="image-message-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText('/api/files/11111111-1111-4111-8111-111111111111')).toBeTruthy();
    });
  });
});
