/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, render } from '@testing-library/react-native';

const mockFocusSetters = new Set<(focused: boolean) => void>();

function mockSetScreensFocused(focused: boolean) {
  mockFocusSetters.forEach((set) => set(focused));
}

jest.mock('@clerk/expo', () => ({
  useSession: () => ({ session: null }),
  useUser: () => ({ user: null }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({ id: 'thread-1' }),
  useNavigation: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    const [focused, setFocused] = React.useState(true);
    React.useEffect(() => {
      mockFocusSetters.add(setFocused);
      return () => {
        mockFocusSetters.delete(setFocused);
      };
    }, []);
    React.useEffect(() => (focused ? cb() : undefined), [cb, focused]);
  },
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

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReconnecting: false, queueSize: 0 }),
}));

jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('@/src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

jest.mock('@/src/features/chat/components/Composer/Composer', () => {
  const { View } = require('react-native');
  return { Composer: () => <View testID="composer" /> };
});

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
  return { AddToChatSheet: () => <View /> };
});

jest.mock('@/src/features/chat/components/ProjectSelectorBar', () => {
  const { View } = require('react-native');
  return { ProjectSelectorBar: () => <View /> };
});

jest.mock('@/src/features/model-picker/components/ModelPickerSheet', () => {
  const { View } = require('react-native');
  return { ModelPickerSheet: () => <View /> };
});

jest.mock('@/src/features/chat/components/PaywallBottomSheet', () => {
  const { View } = require('react-native');
  return { PaywallBottomSheet: () => <View /> };
});

jest.mock('@/src/features/chat/components/StyleSelector', () => {
  const { View } = require('react-native');
  return { StyleSelector: () => <View /> };
});

jest.mock('@/src/features/chat/components/MessageList', () => {
  const { View } = require('react-native');
  return { MessageList: () => <View testID="message-list" /> };
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
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : Icon) });
});

jest.mock('@/src/features/model-picker/installStore', () => ({
  useModelInstallStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ installedModelIds: [], readySystemModelIds: [], jobs: {} }),
  readyLocalModelIdOr: (fallback: string) => fallback,
  pickReadyLocalModelId: () => null,
}));

jest.mock('@/lib/mmkv', () => {
  const values = new Map<string, string>();
  return {
    whenMmkvReady: jest.fn((cb) => cb()),
    rehydrateWhenMmkvReady: jest.fn((store) => {
      if (store?.persist?.rehydrate) store.persist.rehydrate();
    }),
    mmkvStorage: {
      getItem: jest.fn().mockReturnValue(null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    storage: {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      delete: (key: string) => values.delete(key),
      clearAll: () => values.clear(),
    },
  };
});

import ChatScreen from '../app/(app)/chat/[id]';
import ChatTabScreen from '../app/(app)/(tabs)/chat';
import { useChatStore } from '../stores/chatStore';
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
import { requireLocalModel, requireMobileCloudModel } from '../test-utils/modelFixtures';
import { isAutoModeModelId } from '@agiworkforce/types';

const OWNER = 'new-chat-model-owner';
const NEW_CHAT_CHOICE = requireMobileCloudModel(
  (model) => !isAutoModeModelId(model.id),
  'non-Auto Mobile Cloud model',
).id;
const CONVERSATION_MODEL = requireMobileCloudModel(
  (model) => !isAutoModeModelId(model.id) && model.id !== NEW_CHAT_CHOICE,
  'second non-Auto Mobile Cloud model',
).id;

function seedConversation(title: string) {
  useChatStore.setState({
    conversations: [
      {
        id: 'thread-1',
        title,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
        messageCount: 0,
        pinned: false,
        executionMode: 'cloud',
        model: CONVERSATION_MODEL,
      },
    ],
    messages: { 'thread-1': [] },
    loadConversations: jest.fn(async () => undefined),
    loadMessages: jest.fn(async () => undefined),
  } as never);
}

const chosenModel = () => useModelStore.getState().selectedModel;
const PICKED_LOCAL_MODEL = requireLocalModel(
  (model) => model.id !== DEFAULT_LOCAL_MODEL_ID,
  'shippable local model other than the default',
).id;

describe('the model chosen for new chats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusSetters.clear();
    (jest.requireMock('@/lib/mmkv') as { storage: { clearAll: () => void } }).storage.clearAll();
    __resetCloudAccountSessionForTests();
    activateCloudAccount(OWNER);
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max', billingTier: 'max' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: OWNER });
    useModelStore.setState({
      selectedModel: DEFAULT_LOCAL_MODEL_ID,
      selectedProvider: 'local',
      recentModels: [],
      favorites: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},
    });
    useModelStore.getState().setModel(NEW_CHAT_CHOICE);
    seedConversation('Quarterly plan');
  });

  it('is still the choice on the new-chat screen after a conversation held with another model was opened', () => {
    expect(chosenModel()).toBe(NEW_CHAT_CHOICE);

    const conversation = render(<ChatScreen />);
    expect(chosenModel()).toBe(CONVERSATION_MODEL);
    conversation.unmount();

    render(<ChatTabScreen />);
    expect(chosenModel()).toBe(NEW_CHAT_CHOICE);
  });

  it('is not taken over by a conversation screen that is behind the new-chat screen', () => {
    render(<ChatScreen />);
    expect(chosenModel()).toBe(CONVERSATION_MODEL);

    act(() => mockSetScreensFocused(false));
    act(() => useModelStore.getState().setModel(NEW_CHAT_CHOICE));
    act(() => seedConversation('Quarterly plan, renamed'));

    expect(chosenModel()).toBe(NEW_CHAT_CHOICE);
  });

  it('gives the conversation its own model back when the person returns to it', () => {
    render(<ChatScreen />);
    act(() => mockSetScreensFocused(false));
    act(() => useModelStore.getState().setModel(NEW_CHAT_CHOICE));
    expect(chosenModel()).toBe(NEW_CHAT_CHOICE);

    act(() => mockSetScreensFocused(true));

    expect(chosenModel()).toBe(CONVERSATION_MODEL);
  });

  describe('when the new-chat screen falls back to Local', () => {
    beforeEach(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      useModelStore.getState().setModel(PICKED_LOCAL_MODEL);
      useModelStore.setState({ selectedModel: NEW_CHAT_CHOICE, selectedProvider: 'anthropic' });
    });

    it('keeps the Local model the person picked after Cloud signs out', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false, clerkUserId: null });

      render(<ChatTabScreen />);

      expect(useChatAppModeStore.getState().appMode).toBe('local');
      expect(chosenModel()).toBe(PICKED_LOCAL_MODEL);
    });

    it('keeps the Local model the person picked when a Cloud model is still selected in Local', () => {
      render(<ChatTabScreen />);

      expect(chosenModel()).toBe(PICKED_LOCAL_MODEL);
    });
  });
});
