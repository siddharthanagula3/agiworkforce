/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: true,
}));

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockCreateConversation = jest.fn(async () => 'conv-1');
const mockSendMessage = jest.fn();
const mockRunImageGenerationTurn = jest.fn(async () => undefined);
const mockResolveImageRequest = jest.fn();
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

jest.mock('@/src/features/chat/actions/runImageGenerationTurn', () => ({
  ...jest.requireActual('@/src/features/chat/actions/runImageGenerationTurn'),
  runImageGenerationTurn: (...args: unknown[]) => mockRunImageGenerationTurn(...(args as [])),
}));

jest.mock('@/src/features/chat/actions/resolveMobileImageGenerationRequest', () => ({
  ...jest.requireActual('@/src/features/chat/actions/resolveMobileImageGenerationRequest'),
  resolveMobileImageGenerationRequest: (...args: unknown[]) => mockResolveImageRequest(...args),
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

const SOURCE_IMAGE = {
  uri: 'file:///source.png',
  mimeType: 'image/png',
  fileName: 'source.png',
};
const GUIDE_IMAGES = [
  { uri: 'file:///guide-one.png', mimeType: 'image/png', fileName: 'guide-one.png' },
  { uri: 'file:///guide-two.png', mimeType: 'image/png', fileName: 'guide-two.png' },
];

describe('Chat tab new chat image request with guide images', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCloudAccountStorage.clear();
    clearPostAuthIntent();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('mobile-image-test-user');
    mockChatInputOnSend = undefined;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] });
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'mobile-image-test-user',
    });
    useModelStore.setState({
      selectedModel: DEFAULT_LOCAL_MODEL_ID,
      selectedProvider: 'local',
      recentModels: [],
      favorites: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},
    });
  });

  it('hands the source image, the guide images and the transparent background to the generation turn', async () => {
    mockResolveImageRequest.mockReturnValue({
      status: 'ready',
      prompt: 'put the product on a beach',
      model: 'fixture-image-model',
      aspectRatio: '1:1',
      transparentBackground: true,
      ownerId: 'mobile-image-test-user',
      operation: 'edit',
      sourceImage: SOURCE_IMAGE,
      referenceImages: GUIDE_IMAGES,
    });

    render(<ChatTabScreen />);
    expect(mockChatInputOnSend).toBeTruthy();
    await mockChatInputOnSend?.('put the product on a beach');

    await waitFor(() => expect(mockRunImageGenerationTurn).toHaveBeenCalledTimes(1));
    expect(mockRunImageGenerationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        prompt: 'put the product on a beach',
        model: 'fixture-image-model',
        aspectRatio: '1:1',
        transparentBackground: true,
        operation: 'edit',
        sourceImage: SOURCE_IMAGE,
        referenceImages: GUIDE_IMAGES,
        ownerId: 'mobile-image-test-user',
      }),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('starts a plain generation when the request carries no guide images', async () => {
    mockResolveImageRequest.mockReturnValue({
      status: 'ready',
      prompt: 'a red circle',
      model: 'fixture-image-model',
      ownerId: 'mobile-image-test-user',
    });

    render(<ChatTabScreen />);
    await mockChatInputOnSend?.('a red circle');

    await waitFor(() => expect(mockRunImageGenerationTurn).toHaveBeenCalledTimes(1));
    const [input] = mockRunImageGenerationTurn.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(input['referenceImages']).toBeUndefined();
    expect(input['transparentBackground']).toBeUndefined();
    expect(input['operation']).toBeUndefined();
  });
});
