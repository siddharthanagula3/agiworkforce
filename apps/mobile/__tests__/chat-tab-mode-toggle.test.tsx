/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockLoadConversations = jest.fn();
const mockCreateConversation = jest.fn(async () => 'conv-1');
const mockSendMessage = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({}),
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
    }),
}));

jest.mock('@/src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

jest.mock('@/src/features/chat/components/ChatInput', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ChatInput: React.forwardRef(function MockChatInput(_props: unknown, ref: React.Ref<unknown>) {
      React.useImperativeHandle(ref, () => ({ addAttachments: jest.fn() }));
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

jest.mock('@/src/features/cloud-bridge', () => {
  const { View } = require('react-native');
  return {
    InviteCodeModal: ({ open }: { open: boolean }) =>
      open ? <View testID="invite-code-modal" /> : null,
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
    Menu: Icon,
    Plus: Icon,
    SquarePen: Icon,
  };
});

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

describe('Chat tab mode toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWaitlistStore.setState({
      joined: false,
      email: undefined,
      country: undefined,
      rank: undefined,
      joinedAt: undefined,
      cloudUnlocked: true,
      inviteId: 'mobile-alpha-tester',
      inviteCode: 'ALPHATESTER',
      cloudUnlockedAt: new Date().toISOString(),
    });
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

  it('keeps Local selected and opens invite when mobile Cloud chat is disabled', async () => {
    const { getByTestId, queryByTestId } = render(<ChatTabScreen />);
    expect(queryByTestId('project-selector-bar')).toBeTruthy();

    fireEvent.press(getByTestId('chat.mode-toggle.cloud'));

    await waitFor(() => {
      expect(getByTestId('invite-code-modal')).toBeTruthy();
    });

    expect(getByTestId('chat.mode-toggle.local').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('chat.mode-toggle.cloud').props.accessibilityState.selected).toBe(false);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(queryByTestId('project-selector-bar')).toBeTruthy();
  });
});
