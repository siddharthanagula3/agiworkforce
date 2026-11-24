/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: true,
}));

import React from 'react';
import { Alert } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import type { ComposerSendOutcome } from '@/src/features/chat/components/ChatInput';

const mockPush = jest.fn();
const mockCreateConversation = jest.fn(async () => 'conv-1');
const mockSendMessage = jest.fn();
const mockDiscardUnsentConversation = jest.fn(async (_conversationId: string) => undefined);
const mockClearError = jest.fn();
const mockClearUnscopedError = jest.fn();
const mockSetSendError = jest.fn();
const mockRunImageGenerationTurn = jest.fn(async () => undefined);
const mockResolveImageRequest = jest.fn();
const mockResolveVideoRequest = jest.fn();
const mockRunVideoGenerationTurn = jest.fn(async () => undefined);
let mockIsOnline = true;
let mockChatInputIsOnline: boolean | undefined;
let mockChatInputOnSend:
  | ((
      text: string,
      attachments?: Array<{ id: string; uri: string; mimeType: string; fileName: string }>,
    ) => ComposerSendOutcome | Promise<ComposerSendOutcome>)
  | undefined;
const mockCloudAccountStorage = new Map<string, string>();
const mockEnsureCloudSendConsent = jest.fn<Promise<void>, []>();
const mockFreeImageOfferFor = jest.fn();
let mockChatInputOnOpenVoiceMode: (() => void) | undefined;
let mockLiveVoiceReason: string | null | undefined;

jest.mock('@clerk/expo', () => ({ useUser: () => ({ user: null }) }));

jest.mock('@/services/llmGate', () => ({
  ...jest.requireActual('@/services/llmGate'),
  ensureCloudSendConsent: () => mockEnsureCloudSendConsent(),
}));

jest.mock('@/src/features/voice/services/liveVoiceAvailability', () => {
  const actual = jest.requireActual('@/src/features/voice/services/liveVoiceAvailability');
  return {
    ...actual,
    liveVoiceModeUnavailableReason: (input: unknown) =>
      mockLiveVoiceReason === undefined
        ? actual.liveVoiceModeUnavailableReason(input)
        : mockLiveVoiceReason,
  };
});

jest.mock('@/src/features/chat/actions/freeImageOffer', () => ({
  ...jest.requireActual('@/src/features/chat/actions/freeImageOffer'),
  freeImageOfferFor: (...args: unknown[]) => mockFreeImageOfferFor(...args),
}));

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
      clearError: mockClearError,
      clearUnscopedError: mockClearUnscopedError,
      setSendError: mockSetSendError,
      discardUnsentConversation: mockDiscardUnsentConversation,
      features: { imageGen: true },
    }),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: mockIsOnline, isReconnecting: false, queueSize: 0 }),
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
      props: {
        onSend?: typeof mockChatInputOnSend;
        isOnline?: boolean;
        onOpenVoiceMode?: () => void;
      },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ addAttachments: jest.fn() }));
      mockChatInputOnSend = props.onSend;
      mockChatInputOnOpenVoiceMode = props.onOpenVoiceMode;
      mockChatInputIsOnline = props.isOnline;
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

let mockInstalledModelIds: string[] = [];
let mockTier2Available: boolean | null = null;

jest.mock('@/src/features/model-picker/installStore', () => ({
  useModelInstallStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      installedModelIds: mockInstalledModelIds,
      readySystemModelIds: [],
      jobs: {},
      tier2Available: mockTier2Available,
      statusForModel: () => ({ status: 'unavailable' }),
    }),
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
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
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
import { useSettingsStore } from '../stores/settingsStore';
import { REDUCED_SENSITIVE_CONTENT_REFUSAL } from '../lib/contentFilter';
import { CloudProviderConsentDeclinedError } from '../services/llmGate';

const OWNER = 'mobile-new-chat-settings-user';

describe('Chat tab new chat Cloud send', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockCloudAccountStorage.clear();
    clearPostAuthIntent();
    __resetCloudAccountSessionForTests();
    activateCloudAccount(OWNER);
    mockChatInputOnSend = undefined;
    mockChatInputIsOnline = undefined;
    mockChatInputOnOpenVoiceMode = undefined;
    mockLiveVoiceReason = undefined;
    mockIsOnline = true;
    mockInstalledModelIds = [];
    mockTier2Available = null;
    mockResolveVideoRequest.mockReturnValue({ status: 'not_requested' });
    mockResolveImageRequest.mockReturnValue({ status: 'not_requested' });
    mockCreateConversation.mockResolvedValue('conv-1');
    mockEnsureCloudSendConsent.mockResolvedValue(undefined);
    mockFreeImageOfferFor.mockResolvedValue({ status: 'not_offered' });
    useChatViewStore.setState({
      mediaMode: 'chat',
      imageTransparentBackground: false,
      videoDurationSecs: null,
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({
      tier: 'max',
      grantedCapabilities: ['canUseImages', 'canUseVideoGeneration'],
    });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: OWNER });
    useModelStore.setState({
      selectedModel: requireMobileCloudModel().id,
      selectedProvider: 'anthropic',
      recentModels: [],
      favorites: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('hands the chosen video length to the resolver and the video turn', async () => {
    useChatViewStore.setState({ mediaMode: 'video', videoDurationSecs: 8 });
    mockResolveVideoRequest.mockReturnValue({
      status: 'ready',
      prompt: 'a paper boat',
      model: 'fixture-video-model',
      aspectRatio: '16:9',
      resolution: '720p',
      durationSecs: 8,
      ownerId: OWNER,
    });

    render(<ChatTabScreen />);
    await mockChatInputOnSend?.('a paper boat');

    await waitFor(() => expect(mockRunVideoGenerationTurn).toHaveBeenCalledTimes(1));
    expect(mockResolveVideoRequest).toHaveBeenCalledWith(
      expect.objectContaining({ durationSecs: 8 }),
    );
    expect(mockRunVideoGenerationTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', durationSecs: 8 }),
    );
  });

  it('hands the transparent background choice to the image resolver', async () => {
    useChatViewStore.setState({ mediaMode: 'image', imageTransparentBackground: true });
    mockResolveImageRequest.mockReturnValue({
      status: 'ready',
      prompt: 'a logo',
      model: 'fixture-image-model',
      transparentBackground: true,
      ownerId: OWNER,
    });

    render(<ChatTabScreen />);
    await mockChatInputOnSend?.('a logo');

    await waitFor(() => expect(mockRunImageGenerationTurn).toHaveBeenCalledTimes(1));
    expect(mockResolveImageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ transparentBackground: true }),
    );
  });

  it('clears only a failure no conversation owns when the new chat screen gains focus', () => {
    render(<ChatTabScreen />);

    expect(mockClearUnscopedError).toHaveBeenCalledTimes(1);
    expect(mockClearError).not.toHaveBeenCalled();
  });

  it('explains the offline state and creates nothing for the first message of a new Cloud chat', async () => {
    mockIsOnline = false;

    render(<ChatTabScreen />);
    expect(mockChatInputIsOnline).toBeUndefined();
    const accepted = await mockChatInputOnSend?.('hello');

    expect(accepted).toBe(false);
    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      "You're offline",
      expect.stringContaining('Your message is still in the composer'),
    );
  });

  it('keeps the Local draft when no catalog model can run on this device', async () => {
    mockTier2Available = false;
    useChatAppModeStore.setState({ appMode: 'local' });
    useModelStore.setState({ selectedModel: DEFAULT_LOCAL_MODEL_ID, selectedProvider: 'local' });

    const { getByRole } = render(<ChatTabScreen />);
    expect(getByRole('button', { name: 'No compatible local models' })).toBeTruthy();
    const accepted = await mockChatInputOnSend?.('keep my local draft');

    expect(accepted).toBe(false);
    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'No compatible local models',
      expect.stringContaining('Your draft stays on this device'),
      expect.any(Array),
    );
  });

  describe('a photo sent to AGI Cloud from a new chat', () => {
    const photo = {
      id: 'photo-1',
      uri: 'file:///photo-1.jpg',
      mimeType: 'image/jpeg',
      fileName: 'photo-1.jpg',
    };

    const answerUploadQuestion = (choice: 'Cancel' | 'Upload & Send' | 'dismiss') => {
      alertSpy.mockImplementation((title, _message, buttons, options) => {
        if (title !== 'Send files to AGI Cloud?') return;
        if (choice === 'dismiss') {
          options?.onDismiss?.();
          return;
        }
        buttons?.find((button) => button.text === choice)?.onPress?.();
      });
    };

    it.each(['Cancel', 'dismiss'] as const)(
      'creates nothing and stays on the new chat when the upload question gets %s',
      async (choice) => {
        answerUploadQuestion(choice);

        render(<ChatTabScreen />);
        const accepted = await mockChatInputOnSend?.('What is in this photo?', [photo]);

        expect(accepted).toBe(false);
        expect(alertSpy).toHaveBeenCalledWith(
          'Send files to AGI Cloud?',
          expect.any(String),
          expect.any(Array),
          expect.any(Object),
        );
        expect(mockCreateConversation).not.toHaveBeenCalled();
        expect(mockSendMessage).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
        const { wasCloudUploadDeclined } =
          require('../src/features/chat/utils/cloudUploadConsent') as typeof import('../src/features/chat/utils/cloudUploadConsent');
        expect(wasCloudUploadDeclined([photo])).toBe(true);
      },
    );

    it('asks once, before the chat exists, and does not ask again inside the send', async () => {
      answerUploadQuestion('Upload & Send');
      const order: string[] = [];
      alertSpy.mockImplementationOnce((title, _message, buttons) => {
        order.push(String(title));
        buttons?.find((button) => button.text === 'Upload & Send')?.onPress?.();
      });
      mockCreateConversation.mockImplementationOnce(async () => {
        order.push('create');
        return 'conv-1';
      });
      mockSendMessage.mockImplementationOnce(async (_id, _text, _model, attachments) => {
        const { takeCloudUploadAgreedAhead } =
          require('../src/features/chat/utils/cloudUploadConsent') as typeof import('../src/features/chat/utils/cloudUploadConsent');
        order.push(takeCloudUploadAgreedAhead(attachments ?? []) ? 'agreed' : 'not agreed');
        return false;
      });

      render(<ChatTabScreen />);
      await mockChatInputOnSend?.('What is in this photo?', [photo]);

      expect(order).toEqual(['Send files to AGI Cloud?', 'create', 'agreed']);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('removes the empty chat when the upload fails after the person agreed', async () => {
      answerUploadQuestion('Upload & Send');
      mockSendMessage.mockResolvedValueOnce(false);

      render(<ChatTabScreen />);
      const accepted = await mockChatInputOnSend?.('What is in this photo?', [photo]);

      expect(accepted).toBe(false);
      expect(mockCreateConversation).toHaveBeenCalledTimes(1);
      expect(mockDiscardUnsentConversation).toHaveBeenCalledWith('conv-1');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('removes the empty chat when the send is cancelled before it is taken', async () => {
      answerUploadQuestion('Upload & Send');
      mockSendMessage.mockRejectedValueOnce(new Error('cancelled'));

      render(<ChatTabScreen />);
      const accepted = await mockChatInputOnSend?.('What is in this photo?', [photo]);

      expect(accepted).toBe(false);
      expect(mockSetSendError).toHaveBeenCalledWith('Message could not be sent. Please try again.');
      expect(mockDiscardUnsentConversation).toHaveBeenCalledWith('conv-1');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('keeps the chat once the message was taken', async () => {
      answerUploadQuestion('Upload & Send');
      mockSendMessage.mockImplementationOnce(
        async (
          _conversationId: string,
          _text: string,
          _model: string,
          _attachments: unknown,
          options?: { onAccepted?: () => void },
        ) => {
          options?.onAccepted?.();
          return false;
        },
      );

      render(<ChatTabScreen />);
      await mockChatInputOnSend?.('What is in this photo?', [photo]);

      expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
      expect(mockDiscardUnsentConversation).not.toHaveBeenCalled();
    });

    it('opens the new chat once the upload is agreed and the message is taken', async () => {
      answerUploadQuestion('Upload & Send');
      mockSendMessage.mockImplementationOnce(
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
      const accepted = await mockChatInputOnSend?.('What is in this photo?', [photo]);

      expect(accepted).toEqual({ openedConversationId: 'conv-1' });
      expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
    });

    it('still opens a text-only new chat straight away', async () => {
      mockSendMessage.mockImplementationOnce(() => new Promise(() => undefined));

      render(<ChatTabScreen />);
      void mockChatInputOnSend?.('hello');

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1'));
    });

    it('hands the composer to the text-only chat it opened once the message is taken', async () => {
      mockCreateConversation.mockResolvedValueOnce('conv-2');
      mockSendMessage.mockImplementationOnce(
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
      const outcome = await mockChatInputOnSend?.('hello');

      expect(outcome).toEqual({ openedConversationId: 'conv-2' });
      expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-2');
    });

    it('keeps the plain refusal when the chat it opened did not take the message', async () => {
      mockSendMessage.mockResolvedValueOnce(false);

      render(<ChatTabScreen />);
      const outcome = await mockChatInputOnSend?.('hello');

      expect(outcome).toBe(false);
      expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
    });
  });

  describe('a message Reduce sensitive content refuses', () => {
    beforeEach(() => {
      useSettingsStore.setState({ reduceSensitiveContent: true });
    });

    afterEach(() => {
      useSettingsStore.setState({ reduceSensitiveContent: false });
    });

    it('creates and opens nothing, keeps the text and says why', async () => {
      render(<ChatTabScreen />);
      const accepted = await mockChatInputOnSend?.('Tell me the easiest suicide method');

      expect(accepted).toBe(false);
      expect(mockCreateConversation).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith(
        'Content not available',
        expect.stringContaining('Reduce sensitive content is on'),
      );
    });

    it('refuses an image prompt before the image chat exists', async () => {
      useChatViewStore.setState({ mediaMode: 'image' });
      mockResolveImageRequest.mockReturnValue({
        status: 'ready',
        prompt: 'explicit sexual content',
        model: 'fixture-image-model',
        ownerId: OWNER,
      });

      render(<ChatTabScreen />);
      const accepted = await mockChatInputOnSend?.('explicit sexual content');

      expect(accepted).toBe(false);
      expect(mockCreateConversation).not.toHaveBeenCalled();
      expect(mockRunImageGenerationTurn).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        'Content not available',
        REDUCED_SENSITIVE_CONTENT_REFUSAL,
      );
    });

    it('still creates and opens the chat once for a message it allows', async () => {
      mockSendMessage.mockImplementationOnce(
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
      const outcome = await mockChatInputOnSend?.('What is a good name for a cat?');

      expect(outcome).toEqual({ openedConversationId: 'conv-1' });
      expect(mockCreateConversation).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('the Share with AI providers question', () => {
    const declineSharing = () =>
      mockEnsureCloudSendConsent.mockRejectedValue(new CloudProviderConsentDeclinedError());

    const expectNothingStarted = () => {
      expect(mockEnsureCloudSendConsent).toHaveBeenCalledTimes(1);
      expect(mockCreateConversation).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockRunImageGenerationTurn).not.toHaveBeenCalled();
      expect(mockRunVideoGenerationTurn).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockDiscardUnsentConversation).not.toHaveBeenCalled();
    };

    it('reports a declined send for a message with a file and opens nothing', async () => {
      declineSharing();

      render(<ChatTabScreen />);
      const accepted = await mockChatInputOnSend?.('hello', [
        {
          id: 'photo',
          uri: 'file:///fixture.jpg',
          mimeType: 'image/jpeg',
          fileName: 'fixture.jpg',
        },
      ]);

      expect(accepted).toBe('declined');
      expectNothingStarted();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('creates nothing for the free image offer when sharing is declined', async () => {
      declineSharing();
      useChatViewStore.setState({ mediaMode: 'image' });
      mockResolveImageRequest.mockReturnValue({
        status: 'blocked',
        code: 'plan_required',
        prompt: 'a red fox',
        alert: { title: 'Images need a plan', message: 'Choose a plan.' },
      });
      mockFreeImageOfferFor.mockResolvedValue({
        status: 'offered',
        model: 'fixture-image-model',
        prompt: 'a red fox',
      });

      render(<ChatTabScreen />);
      const accepted = await mockChatInputOnSend?.('a red fox');

      expect(accepted).toBe('declined');
      expect(mockFreeImageOfferFor).toHaveBeenCalledTimes(1);
      expectNothingStarted();
    });

    it.each(['image', 'video'] as const)(
      'creates nothing and sends no %s prompt when sharing is declined',
      async (kind) => {
        declineSharing();
        useChatViewStore.setState({ mediaMode: kind });
        const ready = {
          status: 'ready',
          prompt: 'a paper boat',
          model: `fixture-${kind}-model`,
          ownerId: OWNER,
        };
        if (kind === 'image') mockResolveImageRequest.mockReturnValue(ready);
        else mockResolveVideoRequest.mockReturnValue({ ...ready, durationSecs: 8 });

        render(<ChatTabScreen />);
        const accepted = await mockChatInputOnSend?.('a paper boat');

        expect(accepted).toBe('declined');
        expectNothingStarted();
      },
    );

    it('asks before the chat exists and then sends once when sharing is allowed', async () => {
      const order: string[] = [];
      mockEnsureCloudSendConsent.mockImplementation(async () => {
        order.push('consent');
      });
      mockCreateConversation.mockImplementationOnce(async () => {
        order.push('create');
        return 'conv-1';
      });
      mockSendMessage.mockImplementationOnce(
        async (
          _conversationId: string,
          _text: string,
          _model: string,
          _attachments: unknown,
          options?: { onAccepted?: () => void },
        ) => {
          order.push('send');
          options?.onAccepted?.();
          return true;
        },
      );

      render(<ChatTabScreen />);
      const outcome = await mockChatInputOnSend?.('hello');

      expect(outcome).toEqual({ openedConversationId: 'conv-1' });
      expect(order).toEqual(['consent', 'create', 'send']);
      expect(mockCreateConversation).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
    });

    it('creates nothing when the account changes while the question is open', async () => {
      mockEnsureCloudSendConsent.mockImplementation(async () => {
        activateCloudAccount('another-person');
      });

      render(<ChatTabScreen />);
      const accepted = await mockChatInputOnSend?.('hello');

      expect(accepted).toBe(false);
      expect(mockCreateConversation).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('never asks for a Local Mode message', async () => {
      mockInstalledModelIds = [DEFAULT_LOCAL_MODEL_ID];
      useChatAppModeStore.setState({ appMode: 'local' });
      useModelStore.setState({ selectedModel: DEFAULT_LOCAL_MODEL_ID, selectedProvider: 'local' });
      mockSendMessage.mockResolvedValueOnce(true);

      render(<ChatTabScreen />);
      await mockChatInputOnSend?.('hello');

      expect(mockEnsureCloudSendConsent).not.toHaveBeenCalled();
      expect(mockCreateConversation).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    describe('when live voice starts from a new Cloud chat', () => {
      beforeEach(() => {
        mockLiveVoiceReason = null;
        useSettingsStore.setState({ voiceOnboardingSeen: true });
      });

      afterEach(() => {
        useSettingsStore.setState({ voiceOnboardingSeen: false });
      });

      const startVoice = async () => {
        render(<ChatTabScreen />);
        expect(mockChatInputOnOpenVoiceMode).toBeDefined();
        mockChatInputOnOpenVoiceMode?.();
        await waitFor(() => expect(mockEnsureCloudSendConsent).toHaveBeenCalledTimes(1));
        await Promise.resolve();
        await Promise.resolve();
      };

      it('creates and opens no voice chat when sharing is declined', async () => {
        declineSharing();

        await startVoice();

        expect(mockCreateConversation).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
        expect(alertSpy).not.toHaveBeenCalled();
      });

      it('asks before the voice chat exists and then opens it once when sharing is allowed', async () => {
        const order: string[] = [];
        mockEnsureCloudSendConsent.mockImplementation(async () => {
          order.push('consent');
        });
        mockCreateConversation.mockImplementationOnce(async () => {
          order.push('create');
          return 'conv-1';
        });

        await startVoice();

        await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
        expect(order).toEqual(['consent', 'create']);
        expect(mockCreateConversation).toHaveBeenCalledWith('Voice chat');
        expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1?voice=live');
      });

      it('creates no voice chat when the account changes while the question is open', async () => {
        mockEnsureCloudSendConsent.mockImplementation(async () => {
          activateCloudAccount('another-person');
        });

        await startVoice();

        expect(mockCreateConversation).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
      });
    });
  });

  it('shows the real reason a Cloud conversation could not be created', async () => {
    mockCreateConversation.mockRejectedValueOnce(
      new Error('AGI Cloud conversation could not be created.', {
        cause: new Error('Network request failed'),
      }),
    );

    render(<ChatTabScreen />);
    const accepted = await mockChatInputOnSend?.('hello');

    expect(accepted).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(
      'Could not start the chat',
      'Could not reach the server. Check your connection and try again.',
    );
  });

  it('keeps the generic sentence when the failure carries no better message', async () => {
    mockCreateConversation.mockRejectedValueOnce(
      new Error('AGI Cloud conversation could not be created.'),
    );

    render(<ChatTabScreen />);
    await mockChatInputOnSend?.('hello');

    expect(alertSpy).toHaveBeenCalledWith(
      'Could not start the chat',
      'Something went wrong. Please try again.',
    );
  });
});
