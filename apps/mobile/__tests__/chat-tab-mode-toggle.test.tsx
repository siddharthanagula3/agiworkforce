/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { requireAutoMode } from '../test-utils/modelFixtures';

const mockPush = jest.fn();
const AUTO_MODEL_ID = requireAutoMode().id;
const mockLoadConversations = jest.fn();
const mockCreateConversation = jest.fn(async () => 'conv-1');
const mockSendMessage = jest.fn();
const mockSetWorkMode = jest.fn();
let mockWorkMode: 'chat' | 'agiwork' = 'chat';
const mockBeginImageGeneration = jest.fn(() => 'assistant-msg-1');
const mockCompleteImageGeneration = jest.fn();
const mockFailImageGeneration = jest.fn();
let mockChatInputOnSend: ((text: string) => void | boolean | Promise<void | boolean>) | undefined;
let mockChatFeatures = { imageGen: true };
const mockCloudAccountStorage = new Map<string, string>();
let mockChatInputDraftProvenance:
  { scope: 'local' } | { scope: 'cloud'; ownerId: string } | undefined;
let mockChatInputOnOpenCompare: (() => void) | undefined;
let mockChatInputSelectedSkillName: string | undefined;
let mockChatInputExhaustedUsageRecovery: string | null | undefined;
let mockChatInputOnStackedChange: ((stacked: boolean) => void) | undefined;
let mockUsageSnapshot: Record<string, unknown> | null = null;

jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: jest.fn(async () => {
    if (!mockUsageSnapshot) throw new Error('no usage fixture');
    return mockUsageSnapshot;
  }),
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
      loadConversations: mockLoadConversations,
      createConversation: mockCreateConversation,
      sendMessage: mockSendMessage,
      workMode: mockWorkMode,
      setWorkMode: mockSetWorkMode,
      beginImageGeneration: mockBeginImageGeneration,
      completeImageGeneration: mockCompleteImageGeneration,
      failImageGeneration: mockFailImageGeneration,
      deleteMessage: jest.fn(),
      setPaywallError: jest.fn(),
      clearError: jest.fn(),
      features: mockChatFeatures,
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

jest.mock('@/src/features/chat/components/ChatInput', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ChatInput: React.forwardRef(function MockChatInput(
      props: {
        onSend?: (text: string) => void;
        draftProvenance?: { scope: 'local' } | { scope: 'cloud'; ownerId: string };
        onOpenCompare?: () => void;
        selectedSkillName?: string;
        exhaustedUsageRecovery?: string | null;
        onStackedChange?: (stacked: boolean) => void;
      },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ addAttachments: jest.fn() }));
      mockChatInputOnSend = props.onSend;
      mockChatInputDraftProvenance = props.draftProvenance;
      mockChatInputOnOpenCompare = props.onOpenCompare;
      mockChatInputSelectedSkillName = props.selectedSkillName;
      mockChatInputExhaustedUsageRecovery = props.exhaustedUsageRecovery;
      mockChatInputOnStackedChange = props.onStackedChange;
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
import { generateImage, getGeneratedImageUri } from '../src/features/image/services/imagegen';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useMobileSkillSelectionStore } from '../src/features/skills/selectionStore';
import { useCloudUsageStore } from '../src/features/settings/cloud-usage/store';
import {
  clearPostAuthIntent,
  CLOUD_CHAT_POST_AUTH_INTENT,
  POST_AUTH_INTENT_PARAM,
} from '../src/features/auth/services/postAuthIntent';

const mockGenerateImage = generateImage as jest.Mock;
const mockGetGeneratedImageUri = getGeneratedImageUri as jest.Mock;

describe('Chat tab mode toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCloudAccountStorage.clear();
    clearPostAuthIntent();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('mobile-image-test-user');
    mockChatInputOnSend = undefined;
    mockChatInputDraftProvenance = undefined;
    mockChatInputOnOpenCompare = undefined;
    mockChatInputSelectedSkillName = undefined;
    mockChatInputExhaustedUsageRecovery = undefined;
    mockChatInputOnStackedChange = undefined;
    mockUsageSnapshot = null;
    useCloudUsageStore.getState().clear();
    mockChatFeatures = { imageGen: true };
    mockWorkMode = 'chat';
    useChatAppModeStore.setState({ appMode: 'local' });
    useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] });
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'mobile-image-test-user',
    });
    useMobileSkillSelectionStore.setState({ selection: null });
    useModelStore.setState({
      selectedModel: DEFAULT_LOCAL_MODEL_ID,
      selectedProvider: 'local',
      recentModels: [],
      favorites: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},
    });
  });

  it('shows the Local/Cloud toggle in the new-chat header in Local and in Cloud', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    const local = render(<ChatTabScreen />);
    expect(local.getByTestId('chat.mode-toggle.local').props.accessibilityState.selected).toBe(
      true,
    );
    expect(local.getByTestId('chat.mode-toggle.cloud').props.accessibilityState.selected).toBe(
      false,
    );
    local.unmount();

    useChatAppModeStore.setState({ appMode: 'cloud' });
    const cloud = render(<ChatTabScreen />);
    expect(cloud.getByTestId('chat.mode-toggle.cloud').props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('starts the new chat in Cloud and rebinds the draft to the Cloud owner', async () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    const screen = render(<ChatTabScreen />);
    expect(mockChatInputDraftProvenance).toEqual({ scope: 'local' });

    fireEvent.press(screen.getByTestId('chat.mode-toggle.cloud'));

    await waitFor(() => {
      expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    });
    expect(mockChatInputDraftProvenance).toEqual({
      scope: 'cloud',
      ownerId: 'mobile-image-test-user',
    });
    expect(useModelStore.getState().selectedModel).not.toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('stays in Local and asks for Cloud access when Cloud is locked', () => {
    useWaitlistStore.setState({ cloudUnlocked: false });
    const screen = render(<ChatTabScreen />);

    fireEvent.press(screen.getByTestId('chat.mode-toggle.cloud'));

    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(mockChatInputDraftProvenance).toEqual({ scope: 'local' });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { [POST_AUTH_INTENT_PARAM]: CLOUD_CHAT_POST_AUTH_INTENT },
    });
  });

  it('switches a new Cloud chat back to Local and leaves Work', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    const screen = render(<ChatTabScreen />);

    fireEvent.press(screen.getByTestId('chat.mode-toggle.local'));

    await waitFor(() => {
      expect(useChatAppModeStore.getState().appMode).toBe('local');
    });
    expect(mockSetWorkMode).toHaveBeenCalledWith('chat');
    expect(mockChatInputDraftProvenance).toEqual({ scope: 'local' });
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('hides the greeting while the composer is stacked', () => {
    const screen = render(<ChatTabScreen />);
    expect(screen.getByTestId('chat.new-chat.greeting')).toBeTruthy();

    act(() => mockChatInputOnStackedChange?.(true));
    expect(screen.queryByTestId('chat.new-chat.greeting')).toBeNull();

    act(() => mockChatInputOnStackedChange?.(false));
    expect(screen.getByTestId('chat.new-chat.greeting')).toBeTruthy();
  });

  it('renders no starter suggestion chips in the empty new chat', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    const screen = render(<ChatTabScreen />);
    expect(screen.queryByText('Create an image')).toBeNull();
    expect(screen.queryByText('Write or edit')).toBeNull();
    expect(screen.queryByText('Search the web')).toBeNull();
  });

  it('shows Chat and Work in the header and selects Work only for a Cloud Pro session', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });

    const screen = render(<ChatTabScreen />);
    expect(screen.getByTestId('chat.work-mode.chat').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('chat.work-mode.agiwork'));
    expect(mockSetWorkMode).toHaveBeenCalledWith('agiwork');
  });

  it('hides Chat and Work in Cloud for a plan without Work', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'free' });

    const screen = render(<ChatTabScreen />);
    expect(screen.queryByTestId('chat.work-mode.chat')).toBeNull();
    expect(screen.queryByTestId('chat.work-mode.agiwork')).toBeNull();
  });

  it('clears a persisted Work selection when the Cloud account no longer has Work access', () => {
    mockWorkMode = 'agiwork';
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'free' });

    const screen = render(<ChatTabScreen />);
    expect(screen.queryByTestId('chat.work-mode.agiwork')).toBeNull();
    expect(mockSetWorkMode).toHaveBeenCalledWith('chat');
  });

  it('hides Chat and Work in Local Mode even for a plan with Work', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });

    const screen = render(<ChatTabScreen />);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(screen.queryByTestId('chat.work-mode.chat')).toBeNull();
    expect(screen.queryByTestId('chat.work-mode.agiwork')).toBeNull();
  });

  it('keeps Work behind the signed-in Cloud gate even for an eligible plan', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: false });
    const screen = render(<ChatTabScreen />);
    fireEvent.press(screen.getByTestId('chat.work-mode.agiwork'));

    expect(mockSetWorkMode).not.toHaveBeenCalledWith('agiwork');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { [POST_AUTH_INTENT_PARAM]: CLOUD_CHAT_POST_AUTH_INTENT },
    });
  });

  it('does not overwrite a persisted Cloud preference while Clerk is still loading', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: false });
    useAuthStore.setState({
      isClerkLoaded: false,
      isClerkSignedIn: false,
      clerkUserId: null,
    });

    render(<ChatTabScreen />);

    expect(useChatAppModeStore.getState().appMode).toBe('cloud');

    act(() => {
      useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
    });
    await waitFor(() => {
      expect(useChatAppModeStore.getState().appMode).toBe('local');
    });
  });

  it('binds the new-chat draft to Local or the signed-in Cloud owner', () => {
    const localScreen = render(<ChatTabScreen />);
    expect(mockChatInputDraftProvenance).toEqual({ scope: 'local' });
    localScreen.unmount();

    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    render(<ChatTabScreen />);

    expect(mockChatInputDraftProvenance).toEqual({
      scope: 'cloud',
      ownerId: 'mobile-image-test-user',
    });
  });

  it('sends an owner-bound selected Skill once and clears it only after acceptance', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useMobileSkillSelectionStore.getState().selectSkill({
      ownerId: 'mobile-image-test-user',
      name: 'fixture-review-skill',
    });
    mockSendMessage.mockImplementation(
      async (
        _conversationId: string,
        _text: string,
        _model: string,
        _attachments: unknown,
        options?: { onAccepted?: () => void },
      ) => {
        options?.onAccepted?.();
        return true;
      },
    );

    render(<ChatTabScreen />);

    expect(mockChatInputSelectedSkillName).toBe('fixture-review-skill');
    await act(async () => {
      await mockChatInputOnSend?.('Review this fixture');
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1',
      'Review this fixture',
      expect.any(String),
      undefined,
      expect.objectContaining({
        skillName: 'fixture-review-skill',
        onAccepted: expect.any(Function),
      }),
    );
    expect(useMobileSkillSelectionStore.getState().selection).toBeNull();
  });

  it('withholds the /compare command from the composer in Local Mode', () => {
    render(<ChatTabScreen />);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(mockChatInputOnOpenCompare).toBeUndefined();
  });

  it('offers the /compare command to the composer in Cloud Mode', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });

    render(<ChatTabScreen />);

    expect(typeof mockChatInputOnOpenCompare).toBe('function');
    mockChatInputOnOpenCompare?.();
    expect(mockPush).toHaveBeenCalledWith('/(app)/compare');
  });

  it('keeps a registry Auto profile selected inside the Cloud boundary', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({
      joined: true,
      email: 'tester@example.com',
      country: 'US',
      rank: 1,
      joinedAt: new Date().toISOString(),
      cloudUnlocked: true,
      inviteId: undefined,
      inviteCode: undefined,
      cloudUnlockedAt: new Date().toISOString(),
    });
    useModelStore.setState({ selectedModel: AUTO_MODEL_ID, selectedProvider: 'local' });

    render(<ChatTabScreen />);

    await waitFor(() => {
      expect(useModelStore.getState().selectedModel).toBe(AUTO_MODEL_ID);
    });
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
      expect(mockGenerateImage).toHaveBeenCalledWith(
        {
          prompt: 'a red circle on a white background',
          model: expect.any(String),
          aspect_ratio: expect.any(String),
        },
        { operationId: expect.any(String) },
      );
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

  it('routes a natural-language image request to image generation', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({
      joined: true,
      email: 'tester@example.com',
      country: 'US',
      rank: 1,
      joinedAt: new Date().toISOString(),
      cloudUnlocked: true,
      inviteId: undefined,
      inviteCode: undefined,
      cloudUnlockedAt: new Date().toISOString(),
    });
    mockGenerateImage.mockResolvedValue({
      success: true,
      images: [{ url: 'https://example.com/observatory.png' }],
      model: 'registry-selected-image-model',
    });
    mockGetGeneratedImageUri.mockReturnValue('https://example.com/observatory.png');

    render(<ChatTabScreen />);
    await mockChatInputOnSend?.('Create an image of a blue observatory on Mars');

    await waitFor(() => {
      expect(mockBeginImageGeneration).toHaveBeenCalledWith(
        'conv-1',
        'Create an image of a blue observatory on Mars',
        'Create an image of a blue observatory on Mars',
        expect.any(String),
      );
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockGenerateImage).toHaveBeenCalledWith(
      {
        prompt: 'Create an image of a blue observatory on Mars',
        model: expect.any(String),
        aspect_ratio: expect.any(String),
      },
      { operationId: expect.any(String) },
    );
  });

  it.each([
    '/image a red circle on a white background',
    'Create an image of a blue observatory on Mars',
  ])('does not generate for %s when Image is disabled', async (message) => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    mockChatFeatures = { imageGen: false };

    render(<ChatTabScreen />);
    await mockChatInputOnSend?.(message);

    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(mockBeginImageGeneration).not.toHaveBeenCalled();
    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a signed-out session',
      () =>
        useAuthStore.setState({
          isClerkLoaded: true,
          isClerkSignedIn: false,
          clerkUserId: null,
        }),
    ],
    ['a denied image capability', () => useTierStore.setState({ grantedCapabilities: [] })],
    ['an ineligible tier', () => useTierStore.setState({ tier: 'free' })],
  ])('does not run /image for %s', async (_label, denyImageGeneration) => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    denyImageGeneration();

    render(<ChatTabScreen />);
    await mockChatInputOnSend?.('/image a secure enterprise diagram');

    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(mockBeginImageGeneration).not.toHaveBeenCalled();
    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not fall back to ordinary chat for an ineligible natural-language image request', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'free' });

    render(<ChatTabScreen />);
    await mockChatInputOnSend?.('Create an image of a secure enterprise architecture');

    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(mockBeginImageGeneration).not.toHaveBeenCalled();
    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  describe('new-chat usage limit', () => {
    function exhaustedSnapshot(planTier: string, purchasedRemaining: number | null = 0) {
      const window = { allowance: 100, used: 100, remaining: 0, reset_at: null };
      return {
        planTier,
        usagePercentage: 40,
        usageResetAt: null,
        hasUsageRemaining: false,
        periodStart: null,
        periodEnd: null,
        subscriptionStatus: 'active',
        sessionUsagePercentage: 100,
        sessionResetAt: null,
        weeklyUsagePercentage: 60,
        weeklyResetAt: null,
        flagshipWeeklyUsagePercentage: 0,
        flagshipWeeklyResetAt: null,
        credits: {
          monthly: window,
          weekly: window,
          five_hour: window,
          flagship_weekly: null,
          purchased: { remaining: purchasedRemaining, overage_enabled: false },
          bonus: null,
        },
      };
    }

    it('shows a Free account only the limit and Upgrade, which opens billing', async () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useWaitlistStore.setState({ cloudUnlocked: true });
      useTierStore.setState({ tier: 'free' });
      mockUsageSnapshot = exhaustedSnapshot('free');

      const screen = render(<ChatTabScreen />);

      const banner = await screen.findByTestId('chat.usage-limit');
      expect(within(banner).getByText("You've reached the Free limit for now")).toBeTruthy();
      expect(within(banner).queryByText(/%|credit/i)).toBeNull();
      fireEvent.press(within(banner).getByText('Upgrade'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
    });

    it('hands the exhausted Work state to the composer instead of a second banner', async () => {
      mockWorkMode = 'agiwork';
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useWaitlistStore.setState({ cloudUnlocked: true });
      mockUsageSnapshot = exhaustedSnapshot('pro');

      const screen = render(<ChatTabScreen />);

      await waitFor(() => {
        expect(mockChatInputExhaustedUsageRecovery).toBe('add_credits');
      });
      expect(screen.queryByTestId('chat.usage-limit')).toBeNull();
    });

    it('does not treat usage as exhausted while purchased credits remain', async () => {
      mockWorkMode = 'agiwork';
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useWaitlistStore.setState({ cloudUnlocked: true });
      mockUsageSnapshot = exhaustedSnapshot('pro', 25);

      const screen = render(<ChatTabScreen />);

      const banner = await screen.findByTestId('chat.usage-limit');
      expect(mockChatInputExhaustedUsageRecovery).toBeNull();
      fireEvent.press(within(banner).getByText('Add credits'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
    });

    it('reads no Cloud usage for a Local new chat', () => {
      mockUsageSnapshot = exhaustedSnapshot('pro');
      const screen = render(<ChatTabScreen />);
      expect(screen.queryByTestId('chat.usage-limit')).toBeNull();
      expect(mockChatInputExhaustedUsageRecovery).toBeNull();
    });
  });
});
