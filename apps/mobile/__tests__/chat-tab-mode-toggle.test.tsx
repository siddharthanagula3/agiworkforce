/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockLoadConversations = jest.fn();
const mockCreateConversation = jest.fn(async () => 'conv-1');
const mockSendMessage = jest.fn();
const mockBeginImageGeneration = jest.fn(() => 'assistant-msg-1');
const mockCompleteImageGeneration = jest.fn();
const mockFailImageGeneration = jest.fn();
let mockChatInputOnSend: ((text: string) => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({}),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(effect, []);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      loadConversations: mockLoadConversations,
      createConversation: mockCreateConversation,
      sendMessage: mockSendMessage,
      beginImageGeneration: mockBeginImageGeneration,
      completeImageGeneration: mockCompleteImageGeneration,
      failImageGeneration: mockFailImageGeneration,
      deleteMessage: jest.fn(),
      setPaywallError: jest.fn(),
      clearError: jest.fn(),
    }),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReconnecting: false, queueSize: 0 }),
}));

jest.mock('@/src/features/image/services/imagegen', () => ({
  generateImage: jest.fn(),
  getGeneratedImageUri: jest.fn(),
}));

jest.mock('@/src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

jest.mock('@/src/features/chat/components/ChatInput', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ChatInput: React.forwardRef(function MockChatInput(
      props: { onSend?: (text: string) => void },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ addAttachments: jest.fn() }));
      mockChatInputOnSend = props.onSend;
      return <View testID="chat-input" />;
    }),
  };
});

jest.mock('@/src/features/chat/components/AddToChatSheet', () => {
  const { View } = require('react-native');
  return {
    AddToChatSheet: () => <View testID="add-to-chat-sheet" />,
  };
});

jest.mock('@/src/features/chat/components/ConversationStarters', () => {
  const { View } = require('react-native');
  return {
    ConversationStarters: () => <View testID="conversation-starters" />,
  };
});

jest.mock('@/src/features/chat/components/ProjectSelectorBar', () => {
  const { View } = require('react-native');
  return {
    ProjectSelectorBar: () => <View testID="project-selector-bar" />,
  };
});

jest.mock('@/src/features/chat/components/StyleSelector', () => {
  const { View } = require('react-native');
  return {
    StyleSelector: () => <View testID="style-selector" />,
  };
});

jest.mock('@/src/features/model-picker/components/ModelPickerSheet', () => {
  const { View } = require('react-native');
  return {
    ModelPickerSheet: () => <View testID="model-picker-sheet" />,
  };
});

jest.mock('@/src/features/voice/components/VoiceConversationScreen', () => {
  const { View } = require('react-native');
  return {
    VoiceConversationScreen: () => <View testID="voice-conversation-screen" />,
  };
});

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return {
    Cloud: Icon,
    Cpu: Icon,
    Download: Icon,
    EyeOff: Icon,
    Menu: Icon,
    Plus: Icon,
  };
});

jest.mock('@/src/features/model-picker/installStore', () => ({
  useModelInstallStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ installedModelIds: [], readySystemModelIds: [], jobs: {} }),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import ChatTabScreen from '../app/(app)/(tabs)/chat';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useModelStore } from '../src/features/model-picker/store';
import { DEFAULT_LOCAL_MODEL_ID } from '../src/features/model-picker/service';
import { generateImage, getGeneratedImageUri } from '../src/features/image/services/imagegen';

const mockGenerateImage = generateImage as jest.Mock;
const mockGetGeneratedImageUri = getGeneratedImageUri as jest.Mock;

describe('Chat tab mode toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatInputOnSend = undefined;
    useChatAppModeStore.setState({ appMode: 'local' });
    useModelStore.setState({
      selectedModel: DEFAULT_LOCAL_MODEL_ID,
      selectedProvider: 'local',
      recentModels: [],
      favorites: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},
    });
  });

  it('switches to Cloud and hides project bar when cloud is unlocked', async () => {
    // Set up cloud-unlocked state (invite accepted).
    useWaitlistStore.setState({
      joined: true,
      email: 'tester@example.com',
      country: 'US',
      rank: 1,
      joinedAt: new Date().toISOString(),
      cloudUnlocked: true,
      inviteId: 'mobile-alpha-tester',
      inviteCode: 'ALPHATESTER',
      cloudUnlockedAt: new Date().toISOString(),
    });

    const { getByTestId, queryByTestId } = render(<ChatTabScreen />);

    // ProjectSelectorBar is visible in Local mode.
    expect(queryByTestId('project-selector-bar')).toBeTruthy();
    expect(getByTestId('chat.mode-toggle.local').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('chat.mode-toggle.cloud').props.accessibilityState.selected).toBe(false);

    // Tap Cloud — cloud is unlocked so it should switch (no invite modal).
    fireEvent.press(getByTestId('chat.mode-toggle.cloud'));

    await waitFor(() => {
      expect(getByTestId('chat.mode-toggle.cloud').props.accessibilityState.selected).toBe(true);
    });

    expect(getByTestId('chat.mode-toggle.local').props.accessibilityState.selected).toBe(false);
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    // ProjectSelectorBar is mode-aware and now stays visible in Cloud mode too
    // (it shows CLOUD projects so a cloud chat can be assigned to a project).
    expect(queryByTestId('project-selector-bar')).toBeTruthy();
    // No sign-in redirect needed since cloud is already unlocked.
    expect(mockPush).not.toHaveBeenCalledWith('/(auth)/login');
  });

  it('keeps Local selected and routes to sign-in when cloud is not unlocked (public alpha, no invite/waitlist gate)', async () => {
    // Cloud not unlocked — sign-in gate should open (fix 0fe0598c3).
    useWaitlistStore.setState({
      joined: false,
      email: undefined,
      country: undefined,
      rank: undefined,
      joinedAt: undefined,
      cloudUnlocked: false,
      inviteId: undefined,
      inviteCode: undefined,
      cloudUnlockedAt: undefined,
    });

    const { getByTestId, queryByTestId } = render(<ChatTabScreen />);
    expect(queryByTestId('project-selector-bar')).toBeTruthy();

    fireEvent.press(getByTestId('chat.mode-toggle.cloud'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
    });

    expect(getByTestId('chat.mode-toggle.local').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('chat.mode-toggle.cloud').props.accessibilityState.selected).toBe(false);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(queryByTestId('project-selector-bar')).toBeTruthy();
  });

  it('routes /image as the first message of a new chat to image generation, not a normal chat message', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({
      joined: true,
      email: 'tester@example.com',
      country: 'US',
      rank: 1,
      joinedAt: new Date().toISOString(),
      cloudUnlocked: true,
      inviteId: 'mobile-alpha-tester',
      inviteCode: 'ALPHATESTER',
      cloudUnlockedAt: new Date().toISOString(),
    });

    mockGenerateImage.mockResolvedValue({
      success: true,
      images: [{ url: 'https://example.com/generated.png' }],
      model: 'cloud-image-model',
    });
    mockGetGeneratedImageUri.mockReturnValue('https://example.com/generated.png');

    render(<ChatTabScreen />);

    expect(mockChatInputOnSend).toBeTruthy();
    await mockChatInputOnSend?.('/image a red circle on a white background');

    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalled();
    });
    expect(mockBeginImageGeneration).toHaveBeenCalledWith(
      'conv-1',
      '/image a red circle on a white background',
      'a red circle on a white background',
      expect.any(String),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');

    await waitFor(() => {
      expect(mockGenerateImage).toHaveBeenCalledWith({
        prompt: 'a red circle on a white background',
      });
    });
    await waitFor(() => {
      expect(mockCompleteImageGeneration).toHaveBeenCalledWith(
        'conv-1',
        'assistant-msg-1',
        expect.objectContaining({ imageUrl: 'https://example.com/generated.png' }),
      );
    });
    expect(mockFailImageGeneration).not.toHaveBeenCalled();
  });
});
