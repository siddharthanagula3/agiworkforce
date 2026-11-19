/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: true,
}));

import React from 'react';
import { act, render } from '@testing-library/react-native';

const mockPickImageAssets = jest.fn(async (_options: Record<string, unknown>) => []);
let mockOnPhotos: (() => Promise<void>) | undefined;
const mockCloudAccountStorage = new Map<string, string>();

jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('@clerk/expo', () => ({ useUser: () => ({ user: null }) }));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({ push: jest.fn() }),
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
      createConversation: jest.fn(async () => 'conv-1'),
      sendMessage: jest.fn(),
      workMode: 'chat',
      setWorkMode: jest.fn(),
      deleteMessage: jest.fn(),
      setPaywallError: jest.fn(),
      clearError: jest.fn(),
      clearUnscopedError: jest.fn(),
      discardUnsentConversation: jest.fn(async () => undefined),
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

jest.mock('@/src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

jest.mock('@/src/features/media/photo-picker', () => ({
  ...jest.requireActual('@/src/features/media/photo-picker'),
  pickImageAssetsFromLibrary: (options: Record<string, unknown>) => mockPickImageAssets(options),
}));

jest.mock('@/src/features/chat/components/ChatInput', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ChatInput: function MockChatInput(props: { attachRef?: React.MutableRefObject<unknown> }) {
      if (props.attachRef) {
        props.attachRef.current = {
          addAttachments: jest.fn(),
          captureAttachmentOperation: () => ({
            isCurrent: () => true,
            addAttachments: jest.fn(),
          }),
        };
      }
      return <View testID="chat-input" />;
    },
  };
});

jest.mock('@/src/features/chat/components/AddToChatSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    AddToChatSheet: React.forwardRef(function MockAddToChatSheet(
      props: { onPhotos?: () => Promise<void> },
      _ref: unknown,
    ) {
      mockOnPhotos = props.onPhotos;
      return <View testID="add-to-chat-sheet" />;
    }),
  };
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

import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE,
  chatAttachmentLimitsToWire,
} from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_PRODUCT_LIMITS,
  getPlanMaxAttachmentsPerMessage,
  type BillingPlanTier,
} from '@agiworkforce/types';
import ChatTabScreen from '../app/(app)/(tabs)/chat';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import { useAuthStore } from '../src/features/auth/store';
import {
  applyServerAttachmentLimits,
  clearServerAttachmentLimits,
} from '../src/features/chat/upload/attachmentLimits';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { clearPostAuthIntent } from '../src/features/auth/services/postAuthIntent';

const ROOMY_TIER = (Object.keys(BILLING_PLAN_PRODUCT_LIMITS) as BillingPlanTier[]).find(
  (tier) =>
    getPlanMaxAttachmentsPerMessage(tier) >
    CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxFilesPerMessage,
);

async function openPhotos(): Promise<number> {
  render(<ChatTabScreen />);
  expect(mockOnPhotos).toBeTruthy();
  await act(async () => {
    await mockOnPhotos?.();
  });
  expect(mockPickImageAssets).toHaveBeenCalledTimes(1);
  return mockPickImageAssets.mock.calls[0]![0]['selectionLimit'] as number;
}

describe('photos offered by the new chat picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnPhotos = undefined;
    mockCloudAccountStorage.clear();
    clearPostAuthIntent();
    clearServerAttachmentLimits();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('photo-limit-user');
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: ROOMY_TIER!, grantedCapabilities: [] });
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'photo-limit-user',
    });
  });

  afterAll(() => {
    clearServerAttachmentLimits();
  });

  it('has a plan whose own limit is above what a server without limits keeps', () => {
    expect(ROOMY_TIER).toBeDefined();
  });

  it('offers no more photos in Cloud than a server that sent no limits keeps', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const limit = await openPhotos();

    expect(limit).toBe(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxFilesPerMessage);
    expect(limit).toBeLessThan(getPlanMaxAttachmentsPerMessage(ROOMY_TIER));
  });

  it('offers what the server announced in Cloud, never above the plan', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    applyServerAttachmentLimits(chatAttachmentLimitsToWire(CHAT_ATTACHMENT_LIMITS));

    const limit = await openPhotos();

    expect(limit).toBe(
      Math.min(
        CHAT_ATTACHMENT_LIMITS.maxFilesPerMessage,
        getPlanMaxAttachmentsPerMessage(ROOMY_TIER),
      ),
    );
  });

  it('keeps the plan limit in Local, where nothing is uploaded', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });

    const limit = await openPhotos();

    expect(limit).toBe(getPlanMaxAttachmentsPerMessage(ROOMY_TIER));
  });
});
