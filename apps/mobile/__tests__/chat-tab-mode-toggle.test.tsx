/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { requireAutoMode } from '../test-utils/modelFixtures';

const mockPush = jest.fn();
const AUTO_MODEL_ID = requireAutoMode().id;
const mockLoadConversations = jest.fn();
const mockCreateConversation = jest.fn(async () => 'conv-1');
const mockSendMessage = jest.fn();
const mockBeginImageGeneration = jest.fn(() => 'assistant-msg-1');
const mockCompleteImageGeneration = jest.fn();
const mockFailImageGeneration = jest.fn();
let mockChatInputOnSend: ((text: string) => void | boolean | Promise<void | boolean>) | undefined;
let mockChatFeatures = { imageGen: true };
const mockCloudAccountStorage = new Map<string, string>();
let mockChatInputDraftProvenance:
  | { scope: 'local' }
  | { scope: 'cloud'; ownerId: string }
  | undefined;
let mockChatInputOnOpenCompare: (() => void) | undefined;
let mockChatInputSelectedSkillName: string | undefined;

jest.mock('expo-router', () => ({
  // `useNavigation`/`useFocusEffect` come from expo-router, NOT
  // @react-navigation/native: the monorepo resolves several copies of that
  // package and importing from it crashed the app at launch. The mock has to
  // follow the production import or every screen using them throws here.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // Stands in for useFocusEffect's fire-once-on-focus behaviour. Adding `cb` to the
    // deps would re-run it on every render, which is the opposite of what it mocks.
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
      },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ addAttachments: jest.fn() }));
      mockChatInputOnSend = props.onSend;
      mockChatInputDraftProvenance = props.draftProvenance;
      mockChatInputOnOpenCompare = props.onOpenCompare;
      mockChatInputSelectedSkillName = props.selectedSkillName;
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

// Any icon, not a fixed list. The allowlist version broke whenever a component
// anywhere in this screen's tree started using a seventh icon — the failure
// surfaced as "Cannot read properties of undefined (reading 'displayName')"
// from inside the new component, which points at the wrong file entirely.
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
import {
  clearPostAuthIntent,
  CLOUD_CHAT_POST_AUTH_INTENT,
  peekPostAuthIntent,
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
    mockChatFeatures = { imageGen: true };
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

    // A definitive signed-out result still closes the Cloud boundary.
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

  // SIX-23: /compare streams both panes through the managed-cloud gateway.
  // Offering it in Local Mode dead-ended in guardedFetch's refusal, so the
  // composer must not receive an onOpenCompare handler outside Cloud.
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
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(auth)/login',
        params: { [POST_AUTH_INTENT_PARAM]: CLOUD_CHAT_POST_AUTH_INTENT },
      });
    });

    expect(peekPostAuthIntent()).toBe(CLOUD_CHAT_POST_AUTH_INTENT);
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
        model: expect.any(String),
        // The route accepted and validated `aspect_ratio` all along, but no
        // surface sent one, so every generated image silently took the legacy
        // square default. Assert it reaches the wire so the picker cannot
        // regress to decoration.
        aspect_ratio: expect.any(String),
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
    expect(mockGenerateImage).toHaveBeenCalledWith({
      prompt: 'Create an image of a blue observatory on Mars',
      model: expect.any(String),
      aspect_ratio: expect.any(String),
    });
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
});
