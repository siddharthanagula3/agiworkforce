/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: true,
}));

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockCreateConversation = jest.fn(async () => 'conv-1');
const mockSendMessage = jest.fn();
const mockRunVideoGenerationTurn = jest.fn(async () => ({ assistantMessageId: null }));
const mockResolveVideoRequest = jest.fn();
let mockChatInputOnSend: ((text: string) => void | boolean | Promise<void | boolean>) | undefined;
const mockCloudAccountStorage = new Map<string, string>();

jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({}),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(() => effect(), [effect]);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      loadConversations: jest.fn(),
      createConversation: mockCreateConversation,
      sendMessage: mockSendMessage,
      workMode: 'chat',
      setWorkMode: jest.fn(),
      beginImageGeneration: jest.fn(() => 'assistant-msg-1'),
      beginVideoGeneration: jest.fn(),
      recordVideoGenerationTask: jest.fn(),
      isVideoGenerationCancelRequested: jest.fn(() => false),
      updateVideoGenerationProgress: jest.fn(),
      completeVideoGeneration: jest.fn(),
      failVideoGeneration: jest.fn(),
      completeImageGeneration: jest.fn(),
      failImageGeneration: jest.fn(),
      deleteMessage: jest.fn(),
      setPaywallError: jest.fn(),
      clearError: jest.fn(),
      features: { imageGen: true },
    }),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReconnecting: false, queueSize: 0 }),
}));

jest.mock('@/src/features/image/services/imagegen', () => ({
  generateImage: jest.fn(),
  getGeneratedImageUri: jest.fn(),
  getDurableGeneratedImagePath: jest.fn(() => null),
}));

jest.mock('@/src/features/chat/actions/runVideoGenerationTurn', () => ({
  ...jest.requireActual('@/src/features/chat/actions/runVideoGenerationTurn'),
  runVideoGenerationTurn: (...args: unknown[]) => mockRunVideoGenerationTurn(...(args as [])),
}));

jest.mock('@/src/features/chat/actions/resolveMobileVideoGenerationRequest', () => ({
  ...jest.requireActual('@/src/features/chat/actions/resolveMobileVideoGenerationRequest'),
  resolveMobileVideoGenerationRequest: (...args: unknown[]) => mockResolveVideoRequest(...args),
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
  return { AddToChatSheet: () => <View testID="add-to-chat-sheet" /> };
});

jest.mock('@/src/features/chat/components/ProjectSelectorBar', () => {
  const { View } = require('react-native');
  return { ProjectSelectorBar: () => <View testID="project-selector-bar" /> };
});

jest.mock('@/src/features/chat/components/StyleSelector', () => {
  const { View } = require('react-native');
  return { StyleSelector: () => <View testID="style-selector" /> };
});

jest.mock('@/src/features/model-picker/components/ModelPickerSheet', () => {
  const { View } = require('react-native');
  return { ModelPickerSheet: () => <View testID="model-picker-sheet" /> };
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
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? false : Icon),
    },
  );
});

jest.mock('@/src/features/model-picker/installStore', () => ({
  useModelInstallStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ installedModelIds: [], readySystemModelIds: [], jobs: {} }),
  readyLocalModelIdOr: (fallback: string) => fallback,
  pickReadyLocalModelId: () => null,
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
  storage: {
    getString: jest.fn((key: string) => mockCloudAccountStorage.get(key)),
    set: jest.fn((key: string, value: string) => {
      mockCloudAccountStorage.set(key, value);
    }),
    delete: jest.fn((key: string) => {
      mockCloudAccountStorage.delete(key);
    }),
  },
}));

import ChatTabScreen from '../app/(app)/(tabs)/chat';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useModelStore } from '../src/features/model-picker/store';
import { useTierStore } from '../src/features/billing/store';
import { useAuthStore } from '../src/features/auth/store';
import { DEFAULT_LOCAL_MODEL_ID } from '../src/features/model-picker/service';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { clearPostAuthIntent } from '../src/features/auth/services/postAuthIntent';

const CHOSEN_DURATION_SECS = 8;

describe('Chat tab new chat video request duration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCloudAccountStorage.clear();
    clearPostAuthIntent();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('mobile-video-test-user');
    mockChatInputOnSend = undefined;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseVideoGeneration'] });
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'mobile-video-test-user',
    });
    useModelStore.setState({
      selectedModel: DEFAULT_LOCAL_MODEL_ID,
      selectedProvider: 'local',
      recentModels: [],
      favorites: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},
    });
    useChatViewStore.setState({ mediaMode: 'video', videoDurationSecs: CHOSEN_DURATION_SECS });
    mockResolveVideoRequest.mockImplementation((input: { durationSecs?: number | null }) => ({
      status: 'ready',
      prompt: 'a cat surfing',
      model: 'fixture-video-model',
      aspectRatio: '16:9',
      resolution: '1080p',
      ...(input.durationSecs ? { durationSecs: input.durationSecs } : {}),
      ownerId: 'mobile-video-test-user',
    }));
  });

  afterEach(() => {
    useChatViewStore.setState({ mediaMode: 'text', videoDurationSecs: null });
  });

  it('asks for and starts the video with the duration chosen in the composer', async () => {
    render(<ChatTabScreen />);
    expect(mockChatInputOnSend).toBeTruthy();
    await mockChatInputOnSend?.('a cat surfing');

    await waitFor(() => expect(mockRunVideoGenerationTurn).toHaveBeenCalledTimes(1));
    expect(mockResolveVideoRequest).toHaveBeenCalledWith(
      expect.objectContaining({ durationSecs: CHOSEN_DURATION_SECS }),
    );
    expect(mockRunVideoGenerationTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', durationSecs: CHOSEN_DURATION_SECS }),
    );
  });
});
