/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: true,
}));

import React from 'react';
import { act, fireEvent, render, renderHook, waitFor, within } from '@testing-library/react-native';
import { requireAutoMode, requireMobileCloudModel } from '../test-utils/modelFixtures';
import { isAutoModeModelId } from '@agiworkforce/types';

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
let mockChatInputOnMultilineChange: ((multiline: boolean) => void) | undefined;
let mockChatInputSendPreview: { providerMode?: string } | undefined;
let mockUsageSnapshot: Record<string, unknown> | null = null;

jest.mock('@clerk/expo', () => ({ useUser: () => ({ user: null }) }));

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
      clearUnscopedError: jest.fn(),
      discardUnsentConversation: jest.fn(async () => undefined),
      features: mockChatFeatures,
    }),
}));

jest.mock('@/src/features/voice/services/voiceInput', () => ({
  ...jest.requireActual('@/src/features/voice/services/voiceInput'),
  isCapturing: jest.fn().mockReturnValue(false),
  startCaptureSession: jest.fn(),
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
  const { Pressable, View } = require('react-native');
  return {
    ChatInput: React.forwardRef(function MockChatInput(
      props: {
        onSend?: (text: string) => void;
        draftProvenance?: { scope: 'local' } | { scope: 'cloud'; ownerId: string };
        onOpenCompare?: () => void;
        onOpenVoiceMode?: () => void;
        selectedSkillName?: string;
        exhaustedUsageRecovery?: string | null;
        onMultilineChange?: (multiline: boolean) => void;
        sendPreview?: { providerMode?: string };
      },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ addAttachments: jest.fn() }));
      mockChatInputOnSend = props.onSend;
      mockChatInputDraftProvenance = props.draftProvenance;
      mockChatInputOnOpenCompare = props.onOpenCompare;
      mockChatInputSelectedSkillName = props.selectedSkillName;
      mockChatInputExhaustedUsageRecovery = props.exhaustedUsageRecovery;
      mockChatInputOnMultilineChange = props.onMultilineChange;
      mockChatInputSendPreview = props.sendPreview;
      return (
        <View testID="chat-input">
          {props.onOpenVoiceMode ? (
            <Pressable accessibilityLabel="Start voice mode" onPress={props.onOpenVoiceMode} />
          ) : null}
        </View>
      );
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

import { Alert, NativeModules, Platform, StyleSheet } from 'react-native';
import ChatTabScreen from '../app/(app)/(tabs)/chat';
import { HEADER_TEXT_SCALE_LIMIT } from '../src/features/chat/components/WorkModeSwitch';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useModelStore } from '../src/features/model-picker/store';
import { useTierStore } from '../src/features/billing/store';
import { useAuthStore } from '../src/features/auth/store';
import {
  DEFAULT_LOCAL_MODEL_ID,
  canAccessCloudModelForTier,
  getDefaultCloudModelIdForTier,
} from '../src/features/model-picker/service';
import { generateImage, getGeneratedImageUri } from '../src/features/image/services/imagegen';
import { startCaptureSession } from '../src/features/voice/services/voiceInput';
import { VOICE_DISCLOSURE } from '../src/features/voice/components/VoiceOnboardingSheet';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useMobileSkillSelectionStore } from '../src/features/skills/selectionStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  __resetStartWithVoiceLaunchForTests,
  useLocalSettingsStore,
} from '../stores/settings/localSettingsStore';
import { useCloudUsageStore } from '../src/features/settings/cloud-usage/store';
import {
  clearPostAuthIntent,
  CLOUD_CHAT_POST_AUTH_INTENT,
  POST_AUTH_INTENT_PARAM,
} from '../src/features/auth/services/postAuthIntent';
import {
  __resetCloudModeFallbackForTests,
  answerCloudSession,
} from '../src/features/chat/store/cloudModeFallback';
import { useAppModeSwitch } from '../src/features/chat/hooks/useAppModeSwitch';
import { getDraft, setDraft } from '../src/features/chat/draftStore';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { useProjectStore } from '../src/features/projects/store';
import { useCloudProjectStore } from '../stores/projects/cloudProjectStore';
import { recordCloudProviderConsent } from '../services/providerConsent';

const mockGenerateImage = generateImage as jest.Mock;
const mockGetGeneratedImageUri = getGeneratedImageUri as jest.Mock;
const mockStartCapture = startCaptureSession as jest.Mock;

describe('Chat tab new chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCloudAccountStorage.clear();
    clearPostAuthIntent();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('mobile-image-test-user');
    recordCloudProviderConsent();
    mockChatInputOnSend = undefined;
    mockChatInputDraftProvenance = undefined;
    mockChatInputOnOpenCompare = undefined;
    mockChatInputSelectedSkillName = undefined;
    mockChatInputExhaustedUsageRecovery = undefined;
    mockChatInputOnMultilineChange = undefined;
    mockChatInputSendPreview = undefined;
    mockUsageSnapshot = null;
    mockStartCapture.mockResolvedValue({
      result: new Promise(() => {}),
      stop: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    });
    __resetStartWithVoiceLaunchForTests();
    useLocalSettingsStore.setState({ startWithVoice: false });
    useSettingsStore.setState({ voiceEnabled: true, voiceOnboardingSeen: true });
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
      newChatModels: { local: null, cloud: null },
      conversationModelShown: false,
      recentModels: [],
      favorites: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},
    });
  });

  it('leaves the Local/Cloud switch to the sidebar and names the active mode at the composer', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    const local = render(<ChatTabScreen />);
    expect(local.queryByTestId('chat.mode-toggle')).toBeNull();
    expect(local.getByLabelText('New local chat')).toBeTruthy();
    expect(mockChatInputSendPreview?.providerMode).toBe('Local');
    local.unmount();

    useChatAppModeStore.setState({ appMode: 'cloud' });
    const cloud = render(<ChatTabScreen />);
    expect(cloud.queryByTestId('chat.mode-toggle')).toBeNull();
    expect(cloud.getByLabelText('New AGI Cloud chat')).toBeTruthy();
    expect(mockChatInputSendPreview?.providerMode).toBe('ManagedGateway');
  });

  it('follows a switch to Cloud made in the sidebar and rebinds the draft to the Cloud owner', async () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    render(<ChatTabScreen />);
    expect(mockChatInputDraftProvenance).toEqual({ scope: 'local' });

    act(() => useChatAppModeStore.getState().setAppMode('cloud'));

    await waitFor(() => {
      expect(mockChatInputDraftProvenance).toEqual({
        scope: 'cloud',
        ownerId: 'mobile-image-test-user',
      });
    });
    await waitFor(() => {
      expect(useModelStore.getState().selectedModel).not.toBe(DEFAULT_LOCAL_MODEL_ID);
    });
    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('follows a switch back to Local made in the sidebar and leaves Work', async () => {
    mockWorkMode = 'agiwork';
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    render(<ChatTabScreen />);

    act(() => useChatAppModeStore.getState().setAppMode('local'));

    await waitFor(() => {
      expect(mockChatInputDraftProvenance).toEqual({ scope: 'local' });
    });
    expect(mockSetWorkMode).toHaveBeenCalledWith('chat');
    await waitFor(() => {
      expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
    });
  });

  it('keeps the empty new chat to the symbol and the greeting in Chat, in Work and in Local', () => {
    const expectOnlyGreeting = (screen: ReturnType<typeof render>) => {
      expect(screen.getByTestId('chat.new-chat.symbol')).toBeTruthy();
      expect(screen.getByTestId('chat.new-chat.greeting')).toBeTruthy();
      expect(screen.queryByLabelText('Work mode connected-source privacy')).toBeNull();
      expect(screen.queryByLabelText('Manage connected services')).toBeNull();
      expect(screen.queryByText('Example tasks')).toBeNull();
      expect(screen.queryByText('Continue with AGI Cloud.')).toBeNull();
      expect(screen.queryByText('AGI')).toBeNull();
    };

    useWaitlistStore.setState({ cloudUnlocked: true });
    const local = render(<ChatTabScreen />);
    expectOnlyGreeting(local);
    local.unmount();

    useChatAppModeStore.setState({ appMode: 'cloud' });
    const chat = render(<ChatTabScreen />);
    expectOnlyGreeting(chat);
    chat.unmount();

    mockWorkMode = 'agiwork';
    const work = render(<ChatTabScreen />);
    expectOnlyGreeting(work);
    expect(work.getByTestId('chat.work-mode.agiwork').props.accessibilityState.selected).toBe(true);
  });

  it('opens voice with an exit when Start with Voice is on, once per launch', async () => {
    useLocalSettingsStore.setState({ startWithVoice: true });
    const first = render(<ChatTabScreen />);

    await waitFor(() => expect(first.getByTestId('voice-inline-bar')).toBeTruthy());
    expect(first.getByLabelText('Exit voice mode')).toBeTruthy();
    await waitFor(() => expect(first.getByLabelText('Mute microphone')).toBeTruthy());
    expect(mockStartCapture).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = render(<ChatTabScreen />);
    expect(second.queryByTestId('voice-inline-bar')).toBeNull();
  });

  it('keeps voice open and shows one quiet notice instead of an alert when nothing was heard', async () => {
    const { VoiceCaptureError } = jest.requireActual('@/src/features/voice/services/voiceInput');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const toast = jest.spyOn(require('@/src/shared/components/Toast'), 'showToast');
    mockStartCapture.mockRejectedValueOnce(
      new VoiceCaptureError('recognition-error', 'No speech detected', 'no-speech'),
    );
    useLocalSettingsStore.setState({ startWithVoice: true });
    const screen = render(<ChatTabScreen />);

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith("Didn't catch that. Say it again.");
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByTestId('voice-inline-bar')).toBeTruthy();
    alert.mockRestore();
    toast.mockRestore();
  });

  it('stays on the text composer at launch when Start with Voice is off', () => {
    const screen = render(<ChatTabScreen />);
    expect(screen.queryByTestId('voice-inline-bar')).toBeNull();
  });

  it('does not open voice at launch while Voice Input is off', () => {
    useLocalSettingsStore.setState({ startWithVoice: true });
    useSettingsStore.setState({ voiceEnabled: false });
    const screen = render(<ChatTabScreen />);
    expect(screen.queryByTestId('voice-inline-bar')).toBeNull();
  });

  describe('voice mode where the phone has no on-device recognizer', () => {
    const originalOS = Platform.OS;
    const originalVersion = Platform.Version;
    const nativeModules = NativeModules as Record<string, unknown>;
    const originalWebRtc = nativeModules['WebRTCModule'];

    const runOn = (os: 'ios' | 'android', version: number | string) => {
      Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
      Object.defineProperty(Platform, 'Version', { get: () => version, configurable: true });
    };

    const liveVoiceReady = () => {
      nativeModules['WebRTCModule'] = {};
      useWaitlistStore.setState({ cloudUnlocked: true });
      useChatAppModeStore.setState({ appMode: 'cloud' });
    };

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
      Object.defineProperty(Platform, 'Version', {
        get: () => originalVersion,
        configurable: true,
      });
      if (originalWebRtc === undefined) delete nativeModules['WebRTCModule'];
      else nativeModules['WebRTCModule'] = originalWebRtc;
    });

    it('offers no voice mode in Local Mode on Android API 32', () => {
      runOn('android', 32);
      useSettingsStore.setState({ voiceOnboardingSeen: false });

      const screen = render(<ChatTabScreen />);

      expect(screen.queryByLabelText('Start voice mode')).toBeNull();
      expect(screen.queryByText(VOICE_DISCLOSURE['on-device'])).toBeNull();
    });

    it('does nothing at launch on Android API 32 in Local Mode when Start with Voice is on', () => {
      runOn('android', 32);
      useSettingsStore.setState({ voiceOnboardingSeen: false });
      useLocalSettingsStore.setState({ startWithVoice: true });

      const screen = render(<ChatTabScreen />);

      expect(screen.queryByText(VOICE_DISCLOSURE['on-device'])).toBeNull();
      expect(screen.queryByTestId('voice-inline-bar')).toBeNull();
      expect(mockStartCapture).not.toHaveBeenCalled();
    });

    it.each([
      ['Android API 33', 'android', 33],
      ['iOS', 'ios', '17.5'],
    ] as const)(
      'offers voice mode in Local Mode on %s with the on-device disclosure',
      (_label, os, version) => {
        runOn(os, version);
        useSettingsStore.setState({ voiceOnboardingSeen: false });

        const screen = render(<ChatTabScreen />);
        fireEvent.press(screen.getByLabelText('Start voice mode'));

        expect(screen.getByText(VOICE_DISCLOSURE['on-device'])).toBeTruthy();
      },
    );

    it('offers live voice on Android API 32 when live voice is available', () => {
      runOn('android', 32);
      liveVoiceReady();
      useSettingsStore.setState({ voiceOnboardingSeen: false });

      const screen = render(<ChatTabScreen />);
      fireEvent.press(screen.getByLabelText('Start voice mode'));

      expect(screen.getByText(VOICE_DISCLOSURE.live)).toBeTruthy();
      expect(screen.queryByText(VOICE_DISCLOSURE['on-device'])).toBeNull();
    });

    it('waits for the account to load before Start with Voice opens live voice on Android API 32', async () => {
      runOn('android', 32);
      liveVoiceReady();
      useLocalSettingsStore.setState({ startWithVoice: true });
      useAuthStore.setState({ isClerkLoaded: false, isClerkSignedIn: false, clerkUserId: null });

      render(<ChatTabScreen />);
      expect(mockCreateConversation).not.toHaveBeenCalled();

      act(() => {
        useAuthStore.setState({
          isClerkLoaded: true,
          isClerkSignedIn: true,
          clerkUserId: 'mobile-image-test-user',
        });
      });

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1?voice=live'));
      expect(mockCreateConversation).toHaveBeenCalledTimes(1);
      expect(mockStartCapture).not.toHaveBeenCalled();
    });

    it('says voice is unavailable instead of falling back to the device when the live chat cannot start on Android API 32', async () => {
      runOn('android', 32);
      liveVoiceReady();
      mockCreateConversation.mockRejectedValueOnce(new Error('offline'));
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      const screen = render(<ChatTabScreen />);
      fireEvent.press(screen.getByLabelText('Start voice mode'));

      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith(
          'Voice is unavailable',
          'The chat could not be started.',
        ),
      );
      expect(screen.queryByTestId('voice-inline-bar')).toBeNull();
      expect(mockStartCapture).not.toHaveBeenCalled();
      alert.mockRestore();
    });
  });

  it('hides the greeting while the composer text wraps', () => {
    const screen = render(<ChatTabScreen />);
    expect(screen.getByTestId('chat.new-chat.greeting')).toBeTruthy();

    act(() => mockChatInputOnMultilineChange?.(true));
    expect(screen.queryByTestId('chat.new-chat.greeting')).toBeNull();

    act(() => mockChatInputOnMultilineChange?.(false));
    expect(screen.getByTestId('chat.new-chat.greeting')).toBeTruthy();
  });

  it('keeps the header, greeting and composer whole at the largest text sizes', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    const screen = render(<ChatTabScreen />);

    for (const label of ['Chat', 'Work']) {
      const text = screen.getByText(label);
      expect(text.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(text.props.allowFontScaling).not.toBe(false);
    }
    const greeting = screen.getByTestId('chat.new-chat.greeting');
    expect(greeting.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
    expect(greeting.props.numberOfLines).toBe(1);
    expect(greeting.props.ellipsizeMode).toBe('tail');
    expect(
      StyleSheet.flatten(screen.getByTestId('chat.new-chat.middle').props.style),
    ).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 });
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

  describe('a Work selection while Clerk has not answered', () => {
    beforeEach(() => {
      mockWorkMode = 'agiwork';
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useWaitlistStore.setState({ cloudUnlocked: false });
      useAuthStore.setState({ isClerkLoaded: false, isClerkSignedIn: false, clerkUserId: null });
    });

    it('keeps Work through the wait and after Clerk confirms the same signed-in account', () => {
      render(<ChatTabScreen />);
      expect(mockSetWorkMode).not.toHaveBeenCalledWith('chat');

      act(() => {
        useWaitlistStore.setState({ cloudUnlocked: true });
        useAuthStore.setState({
          isClerkLoaded: true,
          isClerkSignedIn: true,
          clerkUserId: 'mobile-image-test-user',
        });
      });

      expect(mockSetWorkMode).not.toHaveBeenCalledWith('chat');
      expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    });

    it('returns to Chat once Clerk answers signed out', () => {
      render(<ChatTabScreen />);
      expect(mockSetWorkMode).not.toHaveBeenCalledWith('chat');

      act(() => {
        useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
      });

      expect(mockSetWorkMode).toHaveBeenCalledWith('chat');
    });

    it('returns to Chat at once in Local Mode', () => {
      useChatAppModeStore.setState({ appMode: 'local' });

      render(<ChatTabScreen />);

      expect(mockSetWorkMode).toHaveBeenCalledWith('chat');
    });

    it('returns to Chat at once for a plan without Work', () => {
      useTierStore.setState({ tier: 'free' });

      render(<ChatTabScreen />);

      expect(mockSetWorkMode).toHaveBeenCalledWith('chat');
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

  it('puts the image choice back to its defaults once an image request is sent', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatViewStore.setState({
      mediaMode: 'image',
      imageAspectRatio: '16:9',
      imageTransparentBackground: true,
    });
    mockGenerateImage.mockResolvedValue({
      success: true,
      images: [{ url: 'https://example.com/generated.png' }],
      model: 'cloud-image-model',
    });
    mockGetGeneratedImageUri.mockReturnValue('https://example.com/generated.png');

    render(<ChatTabScreen />);
    await mockChatInputOnSend?.('/image a red circle on a white background');

    await waitFor(() => expect(mockBeginImageGeneration).toHaveBeenCalled());
    expect(useChatViewStore.getState()).toMatchObject({
      mediaMode: 'text',
      imageAspectRatio: '1:1',
      imageTransparentBackground: false,
    });
  });

  it('names the project a new chat starts in and lets the person start outside it', () => {
    useProjectStore.setState({
      projects: [
        {
          id: 'project-garden',
          name: 'Garden',
          description: '',
          instructions: '',
          createdAt: '2026-11-14T10:00:00.000Z',
          updatedAt: '2026-11-14T10:00:00.000Z',
        },
      ],
      activeProjectId: 'project-garden',
    });

    const screen = render(<ChatTabScreen />);

    expect(screen.getByTestId('chat.new-chat.project')).toBeTruthy();
    expect(screen.getByText('In Garden')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Start this chat outside Garden'));

    expect(useProjectStore.getState().activeProjectId).toBeNull();
    expect(screen.queryByTestId('chat.new-chat.project')).toBeNull();
    useProjectStore.setState({ projects: [], activeProjectId: null });
  });

  it('keeps a new chat in a project only while the person stays on the screen they opened from it', () => {
    useProjectStore.setState({
      projects: [
        {
          id: 'project-garden',
          name: 'Garden',
          description: '',
          instructions: '',
          createdAt: '2026-11-14T10:00:00.000Z',
          updatedAt: '2026-11-14T10:00:00.000Z',
        },
      ],
      activeProjectId: 'project-garden',
    });
    useCloudProjectStore.setState({
      projects: [
        {
          id: 'project-kite',
          name: 'Kite',
          description: null,
          instructions: null,
          color: null,
          isArchived: false,
          metadata: null,
          source: 'mobile',
          createdAt: '2026-11-14T10:00:00.000Z',
          updatedAt: '2026-11-14T10:00:00.000Z',
          deletedAt: null,
        },
      ],
      activeProjectId: 'project-kite',
    });

    const first = render(<ChatTabScreen />);
    expect(first.getByText('In Garden')).toBeTruthy();
    first.unmount();

    expect(useProjectStore.getState().activeProjectId).toBeNull();
    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
    const second = render(<ChatTabScreen />);
    expect(second.queryByTestId('chat.new-chat.project')).toBeNull();
    second.unmount();
    useProjectStore.setState({ projects: [], activeProjectId: null });
    useCloudProjectStore.setState({ projects: [], activeProjectId: null });
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
    function exhaustedSnapshot(
      planTier: string,
      purchasedRemaining: number | null = 0,
      overageEnabled = false,
    ) {
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
          purchased: { remaining: purchasedRemaining, overage_enabled: overageEnabled },
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

    it('asks to turn on usage credits when bought credits are switched off', async () => {
      mockWorkMode = 'agiwork';
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useWaitlistStore.setState({ cloudUnlocked: true });
      mockUsageSnapshot = exhaustedSnapshot('pro', 25);

      const screen = render(<ChatTabScreen />);

      await waitFor(() => {
        expect(mockChatInputExhaustedUsageRecovery).toBe('enable_usage_credits');
      });
      expect(screen.queryByTestId('chat.usage-limit')).toBeNull();
    });

    it('does not treat usage as exhausted while usage credits are on and funded', async () => {
      mockWorkMode = 'agiwork';
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useWaitlistStore.setState({ cloudUnlocked: true });
      mockUsageSnapshot = exhaustedSnapshot('pro', 25, true);

      const screen = render(<ChatTabScreen />);

      const banner = await screen.findByTestId('chat.usage-limit');
      expect(mockChatInputExhaustedUsageRecovery).toBeNull();
      fireEvent.press(within(banner).getByText('Add credits'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
    });

    it('reads no Cloud usage for a Local new chat', async () => {
      mockUsageSnapshot = exhaustedSnapshot('pro');
      const { fetchUsageSnapshot } = require('@/services/usage') as {
        fetchUsageSnapshot: jest.Mock;
      };
      const screen = render(<ChatTabScreen />);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(fetchUsageSnapshot).not.toHaveBeenCalled();
      expect(useCloudUsageStore.getState().snapshot).toBeNull();
      expect(screen.queryByTestId('chat.usage-limit')).toBeNull();
      expect(mockChatInputExhaustedUsageRecovery).toBeNull();
    });
  });

  describe('after the session settle window ends without an answer', () => {
    const owner = 'mobile-image-test-user';
    const mmkvItems = new Map<string, string>();

    beforeEach(() => {
      __resetCloudModeFallbackForTests();
      mmkvItems.clear();
      const { mmkvStorage } = jest.requireMock('@/lib/mmkv') as {
        mmkvStorage: Record<'getItem' | 'setItem' | 'removeItem', jest.Mock>;
      };
      mmkvStorage.getItem.mockImplementation((key: string) => mmkvItems.get(key) ?? null);
      mmkvStorage.setItem.mockImplementation((key: string, value: string) => {
        mmkvItems.set(key, value);
      });
      mmkvStorage.removeItem.mockImplementation((key: string) => {
        mmkvItems.delete(key);
      });
      useWaitlistStore.setState({ cloudUnlocked: true });
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false, clerkUserId: null });
    });

    afterEach(() => {
      const { mmkvStorage } = jest.requireMock('@/lib/mmkv') as {
        mmkvStorage: Record<'getItem' | 'setItem' | 'removeItem', jest.Mock>;
      };
      mmkvStorage.getItem.mockReset().mockReturnValue(null);
      mmkvStorage.setItem.mockReset();
      mmkvStorage.removeItem.mockReset();
      __resetCloudModeFallbackForTests();
    });

    const confirmSession = (userId: string) =>
      act(() => {
        useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: userId });
        answerCloudSession(userId);
      });

    it('returns to Cloud when the same account confirms, leaving the Local draft in Local', async () => {
      render(<ChatTabScreen />);
      await waitFor(() => expect(useChatAppModeStore.getState().appMode).toBe('local'));
      expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
      expect(mockChatInputDraftProvenance).toEqual({ scope: 'local' });
      setDraft('new-chat', 'private local notes', mockChatInputDraftProvenance);

      confirmSession(owner);

      await waitFor(() =>
        expect(mockChatInputDraftProvenance).toEqual({ scope: 'cloud', ownerId: owner }),
      );
      expect(useChatAppModeStore.getState().appMode).toBe('cloud');
      await waitFor(() =>
        expect(useModelStore.getState().selectedModel).not.toBe(DEFAULT_LOCAL_MODEL_ID),
      );
      expect(getDraft('new-chat', mockChatInputDraftProvenance)).toBe('');
      expect(getDraft('new-chat', { scope: 'local' })).toBe('private local notes');
      expect(mockCreateConversation).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('returns to Cloud with the model the person had picked, not the plan default', async () => {
      const picked = requireMobileCloudModel(
        (model) =>
          !isAutoModeModelId(model.id) &&
          canAccessCloudModelForTier(model.id, 'pro') &&
          model.id !== getDefaultCloudModelIdForTier('pro'),
        'non-default Mobile Cloud model on the Pro plan',
      ).id;
      act(() => useModelStore.getState().setModel(picked));
      render(<ChatTabScreen />);
      await waitFor(() => expect(useChatAppModeStore.getState().appMode).toBe('local'));
      expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);

      confirmSession(owner);

      await waitFor(() => expect(useChatAppModeStore.getState().appMode).toBe('cloud'));
      await waitFor(() => expect(useModelStore.getState().selectedModel).toBe(picked));
    });

    it('stays in Local when the person picks Local themselves before the session confirms', async () => {
      render(<ChatTabScreen />);
      await waitFor(() => expect(useChatAppModeStore.getState().appMode).toBe('local'));
      const modeSwitch = renderHook(() => useAppModeSwitch());

      act(() => {
        modeSwitch.result.current.switchToLocal();
      });
      confirmSession(owner);

      expect(useChatAppModeStore.getState().appMode).toBe('local');
      expect(mockChatInputDraftProvenance).toEqual({ scope: 'local' });
    });

    it('stays in Local when the session was answered signed out before the fallback', async () => {
      answerCloudSession(null);
      render(<ChatTabScreen />);
      await waitFor(() => expect(useChatAppModeStore.getState().appMode).toBe('local'));

      confirmSession(owner);

      expect(useChatAppModeStore.getState().appMode).toBe('local');
    });
  });
});
