/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import {
  AccessibilityInfo,
  Alert,
  AppState,
  BackHandler,
  NativeModules,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

let mockAudioUri: string | undefined;
let mockSelectedModel = 'test-model';
let mockWindowWidth: number | null = null;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const actual = jest.requireActual('react-native/Libraries/Utilities/useWindowDimensions');
  return {
    __esModule: true,
    default: () => {
      const dimensions = actual.default();
      return mockWindowWidth === null ? dimensions : { ...dimensions, width: mockWindowWidth };
    },
  };
});

jest.mock('../lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
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

jest.mock('expo-speech-recognition', () => {
  const listenersByEvent = {};
  const getListeners = (name) => (listenersByEvent[name] ||= []);
  return {
    __esModule: true,
    ExpoSpeechRecognitionModule: {
      start: jest.fn(),
      stop: jest.fn(() => {
        for (const fn of getListeners('end')) fn(null);
      }),
      abort: jest.fn(),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      supportsOnDeviceRecognition: jest.fn().mockReturnValue(true),
      isRecognitionAvailable: jest.fn().mockReturnValue(true),
      addListener: jest.fn((name, fn) => {
        getListeners(name).push(fn);
        return {
          remove: () => {
            listenersByEvent[name] = getListeners(name).filter((cb) => cb !== fn);
          },
        };
      }),
    },
    __fireResult: (event) => {
      for (const fn of getListeners('result')) fn(event);
    },
    __fireError: (event) => {
      for (const fn of getListeners('error')) fn(event);
    },
    __clearListeners: () => {
      for (const key of Object.keys(listenersByEvent)) delete listenersByEvent[key];
    },
  };
});

jest.mock('expo-localization', () => ({
  __esModule: true,
  getLocales: jest.fn().mockReturnValue([{ languageTag: 'en-US' }]),
}));

jest.mock('expo-speech', () => ({
  speak: jest.fn().mockImplementation((_text: string, opts?: { onDone?: () => void }) => {
    opts?.onDone?.();
  }),
  stop: jest.fn().mockResolvedValue(undefined),
  isSpeakingAsync: jest.fn().mockResolvedValue(false),
  getAvailableVoicesAsync: jest.fn().mockResolvedValue([]),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('react-native-svg', () => {
  const { View } = require('react-native') as typeof import('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    Defs: () => null,
    RadialGradient: () => null,
    LinearGradient: () => null,
    Stop: () => null,
    Rect: () => null,
    Circle: () => null,
  };
});

const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockFocusEffects = new Set<{ focus: () => void }>();
let mockVoiceRouteFocused = true;
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  __esModule: true,
  useIsFocused: () => mockVoiceRouteFocused,
  useRouter: () => ({
    push: jest.fn(),
    replace: mockRouterReplace,
    back: mockRouterBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({ audioUri: mockAudioUri }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    const latest = React.useRef(cb);
    latest.current = cb;
    React.useEffect(() => {
      let cleanup: void | (() => void) = latest.current();
      const entry = {
        focus: () => {
          if (typeof cleanup === 'function') cleanup();
          cleanup = latest.current();
        },
      };
      mockFocusEffects.add(entry);
      return () => {
        mockFocusEffects.delete(entry);
        if (typeof cleanup === 'function') cleanup();
      };
    }, []);
  },
}));

jest.mock('@/src/features/voice/services/voiceInput', () => ({
  ...jest.requireActual('@/src/features/voice/services/voiceInput'),
  transcribeAudioFile: jest.fn(),
}));

jest.mock('@/stores/chatStore', () => {
  const state = {
    createConversation: jest.fn(async () => 'voice-conv-1'),
    sendMessage: jest.fn(async () => true),
    messages: {} as Record<string, unknown[]>,
    error: null as string | null,
  };
  const useChatStore = (selector: (s: typeof state) => unknown) => selector(state);
  useChatStore.getState = () => state;
  return { __esModule: true, useChatStore };
});

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? true : icon),
    },
  );
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({
      children,
      style,
    }: {
      children: React.ReactNode;
      style?: StyleProp<ViewStyle>;
    }) => (
      <View testID="voice.safe-area" style={style}>
        {children}
      </View>
    ),
  };
});

const mockReportSheet = jest.fn();
jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));

const mockEndConversationModel = jest.fn();
jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: Object.assign(
    (selector: (s: { selectedModel: string }) => unknown) =>
      selector({ selectedModel: mockSelectedModel }),
    { getState: () => ({ endConversationModel: mockEndConversationModel }) },
  ),
}));

import VoiceScreen from '@/app/(app)/voice';
import { READING_COLUMN_MAX_WIDTH } from '@/src/shared/layout/contentColumn';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import { useSettingsStore } from '../stores/settingsStore';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '@/src/features/model-picker/service';
import { useTierStore } from '@/src/features/billing/store';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { useRemoteCapabilityStore } from '@/src/lib/Capabilities';
import { colors, lightColors, type ColorScheme } from '@/src/ui/theme/tokens';
import { useTheme } from '@/src/ui/theme';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

const speechRecognitionMock = jest.requireMock('expo-speech-recognition') as {
  __fireResult: (event: {
    results: Array<{ transcript: string; confidence: number }>;
    isFinal: boolean;
  }) => void;
  __fireError: (event: { error: string; message: string }) => void;
  __clearListeners: () => void;
};

interface MockChatState {
  createConversation: jest.Mock;
  sendMessage: jest.Mock;
  messages: Record<string, unknown[]>;
  error: string | null;
}

function chatState(): MockChatState {
  const mod = jest.requireMock('@/stores/chatStore') as {
    useChatStore: { getState: () => MockChatState };
  };
  return mod.useChatStore.getState();
}

function renderScreen(onSendMessage: jest.Mock) {
  const state = chatState();
  state.createConversation.mockResolvedValue('voice-conv-1');
  state.sendMessage.mockImplementation(async (_conversationId: string, text: string) => {
    await onSendMessage(text);
    return true;
  });
  return render(<VoiceScreen />);
}

describe('Voice conversation PTT + hands-free', () => {
  beforeEach(async () => {
    mockAudioUri = undefined;
    await VoiceInput.cancelCapture();
    speechRecognitionMock.__clearListeners();
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    chatState().messages = {};
    chatState().error = null;
    mockSelectedModel = 'test-model';
    mockWindowWidth = null;
    mockEndConversationModel.mockReset();
    useChatAppModeStore.setState({ appMode: 'local' });
    useSettingsStore.setState({
      hapticsEnabled: false,
      voiceEnabled: true,
      voicePushToTalk: false,
      selectedVoiceId: null,
      speechRate: 1,
    });
  });

  it('sends typed text through the selected Voice conversation when microphone input is off', async () => {
    useSettingsStore.setState({ voiceEnabled: false });
    const state = chatState();
    state.createConversation.mockResolvedValue('voice-conv-1');
    state.sendMessage.mockResolvedValue(true);
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), '  typed request  ');
    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    await waitFor(() =>
      expect(state.sendMessage).toHaveBeenCalledWith(
        'voice-conv-1',
        'typed request',
        expect.any(String),
      ),
    );
    expect(state.createConversation).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Type a message').props.value).toBe('');
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
  });

  it('shows the complete user and assistant turns in a scrollable voice transcript', async () => {
    const state = chatState();
    const fullReply =
      'The complete answer remains visible while the voice session continues. '.repeat(5);
    state.messages['voice-conv-1'] = [
      { id: 'voice-user', role: 'user', content: 'What happened?' },
      { id: 'voice-reply', role: 'assistant', content: fullReply },
    ];
    state.sendMessage.mockResolvedValue(true);
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'Continue');
    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    expect(screen.getByTestId('voice-session-transcript')).toBeTruthy();
    expect(screen.getByText('What happened?')).toBeTruthy();
    const reply = screen.getByText(fullReply);
    expect(reply.props.numberOfLines).toBeUndefined();
    expect(screen.getAllByText('You')).toHaveLength(1);
    expect(screen.getAllByText('AGI')).toHaveLength(1);
  });

  it('caps the transcript at the reading column, centred under the orb', async () => {
    const state = chatState();
    state.messages['voice-conv-1'] = [
      { id: 'voice-user', role: 'user', content: 'What happened?' },
      { id: 'voice-reply', role: 'assistant', content: 'A short answer.' },
    ];
    state.sendMessage.mockResolvedValue(true);
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'Continue');
    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    expect(screen.getByTestId('voice-transcript-column')).toHaveStyle({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
    });
  });

  it('keeps the typed composer at its iPhone margin on a 402pt window', () => {
    mockWindowWidth = 402;
    const screen = render(<VoiceScreen />);

    expect(screen.getByTestId('voice-composer')).toHaveStyle({ marginHorizontal: 20 });
  });

  it.each([820, 1032, 1376])(
    'lines the typed composer up with the transcript column on a %ipt window',
    (width) => {
      mockWindowWidth = width;
      const screen = render(<VoiceScreen />);

      const { marginHorizontal } = StyleSheet.flatten(
        screen.getByTestId('voice-composer').props.style as StyleProp<ViewStyle>,
      );
      expect(width - 2 * Number(marginHorizontal)).toBe(READING_COLUMN_MAX_WIDTH);
    },
  );

  it('lets a transcript line be selected and copied', async () => {
    const state = chatState();
    state.messages['voice-conv-1'] = [
      { id: 'voice-user', role: 'user', content: 'What happened?' },
      { id: 'voice-reply', role: 'assistant', content: 'A spoken answer.' },
    ];
    state.sendMessage.mockResolvedValue(true);
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'Continue');
    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    expect(screen.getByText('What happened?').props.selectable).toBe(true);
    expect(screen.getByText('A spoken answer.').props.selectable).toBe(true);
  });

  it('draws only working controls in the bottom row', () => {
    const screen = render(<VoiceScreen />);

    const controls = screen.getByTestId('voice-controls').children as {
      props: { accessibilityRole?: string; accessibilityLabel?: string };
    }[];
    expect(controls.map((control) => control.props.accessibilityLabel)).toEqual([
      'Mute microphone',
      'Switch to push-to-talk mode',
    ]);
  });

  it('says the microphone is muted instead of inviting a hold or a tap', async () => {
    useSettingsStore.setState({ voicePushToTalk: true });
    const screen = render(<VoiceScreen />);

    expect(screen.getAllByText('Hold to talk').length).toBeGreaterThan(0);
    await act(async () => fireEvent.press(screen.getByLabelText('Mute microphone')));

    expect(screen.queryByText('Hold to talk')).toBeNull();
    expect(screen.getByText('Microphone is muted')).toBeTruthy();
    expect(screen.getByText('Unmute to talk')).toBeTruthy();
    expect(screen.getByTestId('voice-companion-orb').props.accessibilityLabel).toBe(
      'Microphone is muted',
    );

    await act(async () => fireEvent.press(screen.getByLabelText('Unmute')));
    expect(screen.getByText('Hold to talk')).toBeTruthy();
  });

  it('reports an assistant turn from the voice transcript, and offers no report on what you said', async () => {
    const state = chatState();
    state.messages['voice-conv-1'] = [
      { id: 'voice-user', role: 'user', content: 'What happened?' },
      { id: 'voice-reply', role: 'assistant', content: 'A spoken answer.' },
    ];
    state.sendMessage.mockResolvedValue(true);
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'Continue');
    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    expect(screen.getAllByLabelText('Report this response')).toHaveLength(1);
    expect(screen.queryByTestId('voice-report-voice-user')).toBeNull();
    expect(mockReportSheet).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('voice-report-voice-reply'));

    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        title: 'Report this response',
        target: {
          messageId: 'voice-reply',
          conversationId: 'voice-conv-1',
          contentExcerpt: 'A spoken answer.',
          subject: { kind: 'voice-turn', id: 'voice-reply' },
        },
      }),
    );
  });

  it('does not claim an on-device model when none is installed', () => {
    mockSelectedModel = DEFAULT_LOCAL_MODEL_ID;
    useModelInstallStore.setState({ installedModelIds: [], readySystemModelIds: [] });

    const screen = renderScreen(jest.fn());

    expect(screen.queryByText('ON-DEVICE')).toBeNull();
    expect(screen.getByTestId('voice-processing-badge').props.children).toBe('NO MODEL INSTALLED');
  });

  it('names the on-device model once it is installed', () => {
    mockSelectedModel = DEFAULT_LOCAL_MODEL_ID;
    useModelInstallStore.setState({
      installedModelIds: [DEFAULT_LOCAL_MODEL_ID],
      readySystemModelIds: [],
    });

    const screen = renderScreen(jest.fn());

    expect(screen.getByTestId('voice-processing-badge').props.children).toBe('ON-DEVICE');
  });

  it('uses a Local model when a stale Cloud model is selected before Voice opens', async () => {
    mockSelectedModel = requireMobileCloudModel().id;
    useSettingsStore.setState({ voiceEnabled: false });
    const state = chatState();
    state.sendMessage.mockResolvedValue(true);
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'local only');
    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    expect(state.sendMessage).toHaveBeenCalledWith(
      'voice-conv-1',
      'local only',
      DEFAULT_LOCAL_MODEL_ID,
    );
  });

  it('uses a Cloud model when a stale Local model is selected before Voice opens', async () => {
    activateCloudAccount('voice-test-account');
    mockSelectedModel = DEFAULT_LOCAL_MODEL_ID;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'pro' });
    useSettingsStore.setState({ voiceEnabled: false });
    const state = chatState();
    state.sendMessage.mockResolvedValue(true);
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'cloud request');
    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    expect(state.sendMessage).toHaveBeenCalledWith(
      'voice-conv-1',
      'cloud request',
      getDefaultCloudModelIdForTier('pro'),
    );
  });

  it('starts the Voice chat on the new-chat model, not one shown only for a project', async () => {
    activateCloudAccount('voice-test-account');
    const projectModel = requireMobileCloudModel().id;
    const ownModel = requireMobileCloudModel((model) => model.id !== projectModel).id;
    mockSelectedModel = projectModel;
    mockEndConversationModel.mockImplementation(() => {
      mockSelectedModel = ownModel;
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useSettingsStore.setState({ voiceEnabled: false });
    const state = chatState();
    state.sendMessage.mockResolvedValue(true);
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'own model please');
    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    expect(mockEndConversationModel).toHaveBeenCalledTimes(1);
    expect(state.sendMessage).toHaveBeenCalledWith('voice-conv-1', 'own model please', ownModel);
  });

  it('sends a handed-over recording on the new-chat model', async () => {
    activateCloudAccount('voice-test-account');
    const projectModel = requireMobileCloudModel().id;
    const ownModel = requireMobileCloudModel((model) => model.id !== projectModel).id;
    mockSelectedModel = projectModel;
    mockEndConversationModel.mockImplementation(() => {
      mockSelectedModel = ownModel;
    });
    mockAudioUri = 'file:///handed-over.m4a';
    useChatAppModeStore.setState({ appMode: 'cloud' });
    let finishTranscription: (value: { text: string }) => void = () => undefined;
    (VoiceInput.transcribeAudioFile as jest.Mock).mockImplementation(
      () =>
        new Promise<{ text: string }>((resolve) => {
          finishTranscription = resolve;
        }),
    );
    const state = chatState();
    state.sendMessage.mockResolvedValue(true);
    render(<VoiceScreen />);

    await act(async () => finishTranscription({ text: 'from the recording' }));

    await waitFor(() =>
      expect(state.sendMessage).toHaveBeenCalledWith(
        'voice-conv-1',
        'from the recording',
        ownModel,
      ),
    );
  });

  it('keeps a typed draft after send failure and retries without creating another chat', async () => {
    const state = chatState();
    state.createConversation.mockResolvedValue('voice-conv-1');
    state.sendMessage.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'please retry');
    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    await waitFor(() => expect(screen.getByText('Message was not sent. Try again.')).toBeTruthy());
    expect(screen.getByLabelText('Type a message').props.value).toBe('please retry');

    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledTimes(2));
    expect(state.createConversation).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Type a message').props.value).toBe('');
  });

  it('shows a new send error alongside earlier voice turns', async () => {
    const state = chatState();
    state.messages['voice-conv-1'] = [
      { id: 'prior-user', role: 'user', content: 'Earlier question' },
      { id: 'prior-reply', role: 'assistant', content: 'Earlier answer' },
    ];
    state.sendMessage.mockResolvedValue(false);
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'New question');
    await act(async () => fireEvent.press(screen.getByLabelText('Send typed message')));

    expect(screen.getByText('Earlier answer')).toBeTruthy();
    expect(screen.getByTestId('voice-transcript-preview').props.children).toBe(
      'Message was not sent. Please try again.',
    );
    expect(screen.getByLabelText('Type a message').props.value).toBe('New question');
  });

  it('does not speak a delayed typed reply after the app backgrounds', async () => {
    let appStateListener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
    let finishSend: ((accepted: boolean) => void) | undefined;
    const state = chatState();
    state.messages = {};
    state.createConversation.mockResolvedValue('voice-conv-1');
    state.sendMessage.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    const speech = jest.requireMock('expo-speech') as { speak: jest.Mock };
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'background request');
    fireEvent.press(screen.getByLabelText('Send typed message'));
    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledTimes(1));

    await act(async () => appStateListener?.('background'));
    state.messages['voice-conv-1'] = [
      { id: 'reply-1', role: 'assistant', content: 'Delayed reply', isStreaming: false },
    ];
    await act(async () => finishSend?.(true));

    expect(speech.speak).not.toHaveBeenCalled();
  });

  it('preserves a file transcript and retries a failed send', async () => {
    mockAudioUri = 'file:///recording.m4a';
    (VoiceInput.transcribeAudioFile as jest.Mock).mockResolvedValue({ text: 'recorded request' });
    const state = chatState();
    state.createConversation.mockResolvedValue('voice-conv-1');
    state.sendMessage.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const { getByText, getByTestId, queryByText } = render(<VoiceScreen />);

    await waitFor(() =>
      expect(getByTestId('voice-transcript-preview').props.children).toBe('recorded request'),
    );
    await waitFor(() => expect(getByText('Retry sending')).toBeTruthy());
    expect(state.sendMessage).toHaveBeenCalledTimes(1);

    await act(async () => fireEvent.press(getByText('Retry sending')));

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledTimes(2));
    expect(queryByText('Retry sending')).toBeNull();
    expect(getByTestId('voice-transcript-preview').props.children).toBe('recorded request');
  });

  it('push-to-talk: press-in starts capture, release stops and sends the transcript', async () => {
    useSettingsStore.setState({ voicePushToTalk: true });
    const onSendMessage = jest.fn().mockResolvedValue('AI reply');
    const { getByTestId } = renderScreen(onSendMessage);

    const orb = getByTestId('voice-companion-orb');
    await act(async () => {
      fireEvent(orb, 'pressIn');
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
    expect(onSendMessage).not.toHaveBeenCalled();

    act(() => {
      speechRecognitionMock.__fireResult({
        results: [{ transcript: 'hello world', confidence: 1 }],
        isFinal: false,
      });
    });
    await act(async () => {
      fireEvent(orb, 'pressOut');
    });

    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith('hello world'));
  });

  it('hands-free: recognizer auto-final processes the transcript without a tap', async () => {
    const onSendMessage = jest.fn().mockResolvedValue(null);
    const { getByTestId, getByText } = renderScreen(onSendMessage);

    await act(async () => {
      fireEvent.press(getByTestId('voice-companion-orb'));
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));

    await act(async () => {
      speechRecognitionMock.__fireResult({
        results: [{ transcript: 'what time is it', confidence: 1 }],
        isFinal: true,
      });
    });

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith('what time is it'));
    expect(ExpoSpeechRecognitionModule.stop).not.toHaveBeenCalled();
    await waitFor(() => expect(getByText('Sent to chat.')).toBeTruthy());
  });

  it('shows silence as a quiet line under the orb with no alert and stays ready to listen again', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByTestId, getByText, queryByText } = renderScreen(jest.fn());

    await act(async () => {
      fireEvent.press(getByTestId('voice-companion-orb'));
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));

    await act(async () => {
      speechRecognitionMock.__fireError({ error: 'no-speech', message: 'No speech detected' });
    });

    await waitFor(() => expect(getByText("Didn't catch that. Say it again.")).toBeTruthy());
    expect(alert).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId('voice-companion-orb'));
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(2));
    expect(queryByText("Didn't catch that. Say it again.")).toBeNull();
    alert.mockRestore();
  });

  it('drops the silence line when the microphone is muted afterwards', async () => {
    const { getByTestId, getByText, getByLabelText, queryByText } = renderScreen(jest.fn());

    await act(async () => {
      fireEvent.press(getByTestId('voice-companion-orb'));
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
    await act(async () => {
      speechRecognitionMock.__fireError({ error: 'no-speech', message: 'No speech detected' });
    });
    await waitFor(() => expect(getByText("Didn't catch that. Say it again.")).toBeTruthy());

    await act(async () => fireEvent.press(getByLabelText('Mute microphone')));

    expect(queryByText("Didn't catch that. Say it again.")).toBeNull();
    expect(getByText('Unmute to talk')).toBeTruthy();
  });

  it.each([
    ['ios', 1],
    ['android', 0],
  ])(
    'announces the silence line by speech on %s only when the live region cannot',
    async (os, calls) => {
      const originalOS = Platform.OS;
      const originalVersion = Platform.Version;
      Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
      Object.defineProperty(Platform, 'Version', {
        get: () => (os === 'android' ? 34 : originalVersion),
        configurable: true,
      });
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => undefined);
      try {
        const { getByTestId, getByText } = renderScreen(jest.fn());
        await act(async () => {
          fireEvent.press(getByTestId('voice-companion-orb'));
        });
        await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
        await act(async () => {
          speechRecognitionMock.__fireError({ error: 'no-speech', message: 'No speech detected' });
        });
        await waitFor(() => expect(getByText("Didn't catch that. Say it again.")).toBeTruthy());

        expect(announce).toHaveBeenCalledTimes(calls);
        expect(getByText("Didn't catch that. Say it again.").props.accessibilityLiveRegion).toBe(
          'polite',
        );
      } finally {
        announce.mockRestore();
        Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
        Object.defineProperty(Platform, 'Version', {
          get: () => originalVersion,
          configurable: true,
        });
      }
    },
  );

  it('guards against double-processing when auto-final races the PTT release', async () => {
    useSettingsStore.setState({ voicePushToTalk: true });
    const onSendMessage = jest.fn().mockResolvedValue(null);
    const { getByTestId } = renderScreen(onSendMessage);

    const orb = getByTestId('voice-companion-orb');
    await act(async () => {
      fireEvent(orb, 'pressIn');
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));

    await act(async () => {
      speechRecognitionMock.__fireResult({
        results: [{ transcript: 'race test', confidence: 1 }],
        isFinal: true,
      });
    });
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent(orb, 'pressOut');
    });
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(ExpoSpeechRecognitionModule.stop).not.toHaveBeenCalled();
  });

  it('mode toggle flips and persists the voicePushToTalk preference', async () => {
    const onSendMessage = jest.fn().mockResolvedValue(null);
    const { getByTestId, getByLabelText, queryByText } = renderScreen(onSendMessage);

    expect(useSettingsStore.getState().voicePushToTalk).toBe(false);
    expect(queryByText('Hold to talk')).toBeNull();

    const toggle = getByTestId('voice-companion-ptt-toggle');
    expect(toggle.props.accessibilityState.selected).toBe(false);
    fireEvent.press(toggle);

    expect(useSettingsStore.getState().voicePushToTalk).toBe(true);
    expect(getByLabelText('Switch to hands-free mode')).toBeTruthy();
    expect(queryByText('Hold to talk')).toBeTruthy();

    const { mmkvStorage } = jest.requireMock('../lib/mmkv') as {
      mmkvStorage: { setItem: jest.Mock };
    };
    await waitFor(() =>
      expect(mmkvStorage.setItem).toHaveBeenCalledWith(
        'settings-store',
        expect.stringContaining('"voicePushToTalk":true'),
      ),
    );
  });

  it('stops microphone capture when the app backgrounds and never auto-resumes', async () => {
    let appStateListener: ((state: string) => void) | undefined;
    const removeListener = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: removeListener };
    });

    const onSendMessage = jest.fn().mockResolvedValue(null);
    const { getByTestId, getByText, unmount } = renderScreen(onSendMessage);

    await act(async () => {
      fireEvent.press(getByTestId('voice-companion-orb'));
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));

    await act(async () => {
      appStateListener?.('background');
    });

    await waitFor(() => expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1));
    expect(getByText('Voice paused when AGI left the foreground.')).toBeTruthy();

    await act(async () => {
      appStateListener?.('active');
    });
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1);

    unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it('says nothing about a pause when the app backgrounds before any voice session started', async () => {
    let appStateListener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() };
    });

    const { queryByText } = renderScreen(jest.fn().mockResolvedValue(null));

    await act(async () => {
      appStateListener?.('inactive');
    });
    await act(async () => {
      appStateListener?.('background');
    });
    await act(async () => {
      appStateListener?.('active');
    });

    expect(queryByText('Voice paused when AGI left the foreground.')).toBeNull();
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
  });

  it('says the voice session paused when the app backgrounds while a reply is awaited', async () => {
    let appStateListener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
    const state = chatState();
    state.createConversation.mockResolvedValue('voice-conv-1');
    state.sendMessage.mockImplementation(() => new Promise<boolean>(() => {}));
    const screen = render(<VoiceScreen />);

    fireEvent.changeText(screen.getByLabelText('Type a message'), 'pending request');
    fireEvent.press(screen.getByLabelText('Send typed message'));
    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledTimes(1));

    await act(async () => appStateListener?.('background'));

    expect(screen.getByText('Voice paused when AGI left the foreground.')).toBeTruthy();
  });
});

describe('Voice route, imported recording and Close', () => {
  const transcribe = VoiceInput.transcribeAudioFile as jest.Mock;
  const realTranscribe = jest.requireActual('@/src/features/voice/services/voiceInput')
    .transcribeAudioFile as typeof VoiceInput.transcribeAudioFile;
  const recognizer = ExpoSpeechRecognitionModule as unknown as Record<string, unknown>;

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((accept) => {
      resolve = accept;
    });
    return { promise, resolve };
  }

  function pressClose(screen: ReturnType<typeof render>) {
    return act(async () => fireEvent.press(screen.getByLabelText('Close voice companion')));
  }

  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    speechRecognitionMock.__clearListeners();
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    mockAudioUri = 'file:///recording.m4a';
    transcribe.mockReset();
    const state = chatState();
    state.messages = {};
    state.error = null;
    state.createConversation.mockReset().mockResolvedValue('voice-conv-1');
    state.sendMessage.mockReset().mockResolvedValue(true);
    useChatAppModeStore.setState({ appMode: 'local' });
    useSettingsStore.setState({
      hapticsEnabled: false,
      voiceEnabled: true,
      voicePushToTalk: false,
      selectedVoiceId: null,
      speechRate: 1,
    });
  });

  afterEach(() => {
    delete recognizer['getSupportedLocales'];
    mockAudioUri = undefined;
  });

  it('cancels the recognizer and sends nothing when Close is pressed while transcribing', async () => {
    transcribe.mockImplementation(realTranscribe);
    const state = chatState();
    const screen = render(<VoiceScreen />);
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));

    await pressClose(screen);

    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1);
    await act(async () => {
      speechRecognitionMock.__fireResult({
        results: [{ transcript: 'words after close', confidence: 1 }],
        isFinal: true,
      });
    });
    expect(state.createConversation).not.toHaveBeenCalled();
    expect(state.sendMessage).not.toHaveBeenCalled();
    expect(VoiceInput.isCapturing()).toBe(false);
  });

  it('never starts the recognizer when Close is pressed while it is being prepared', async () => {
    const locales = deferred<{ installedLocales: string[] }>();
    recognizer['getSupportedLocales'] = jest.fn(() => locales.promise);
    transcribe.mockImplementation(realTranscribe);
    const state = chatState();
    const screen = render(<VoiceScreen />);
    await waitFor(() => expect(recognizer['getSupportedLocales']).toHaveBeenCalledTimes(1));

    await pressClose(screen);
    await act(async () => locales.resolve({ installedLocales: ['en-US'] }));

    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    expect(state.createConversation).not.toHaveBeenCalled();
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it('drops a transcript that arrives after Close even from a recognizer that ignores the signal', async () => {
    const transcript = deferred<{ text: string }>();
    transcribe.mockReturnValue(transcript.promise);
    const state = chatState();
    const screen = render(<VoiceScreen />);
    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    const options = transcribe.mock.calls[0][1] as { signal: AbortSignal };
    expect(options.signal.aborted).toBe(false);

    await pressClose(screen);
    expect(options.signal.aborted).toBe(true);
    await act(async () => transcript.resolve({ text: 'recorded request' }));

    expect(state.createConversation).not.toHaveBeenCalled();
    expect(state.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByText('Retry sending')).toBeNull();
  });

  it('sends nothing when Close is pressed while the conversation is being created', async () => {
    transcribe.mockResolvedValue({ text: 'recorded request' });
    const conversation = deferred<string>();
    const state = chatState();
    state.createConversation.mockReturnValue(conversation.promise);
    const screen = render(<VoiceScreen />);
    await waitFor(() => expect(state.createConversation).toHaveBeenCalledTimes(1));

    await pressClose(screen);
    await act(async () => conversation.resolve('voice-conv-1'));

    expect(state.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByText('Retry sending')).toBeNull();
  });

  it('cancels the recognizer and sends nothing when the screen goes away mid-transcription', async () => {
    transcribe.mockImplementation(realTranscribe);
    const state = chatState();
    const screen = render(<VoiceScreen />);
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));

    screen.unmount();

    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1);
    await act(async () => {
      speechRecognitionMock.__fireResult({
        results: [{ transcript: 'words after leaving', confidence: 1 }],
        isFinal: true,
      });
    });
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it('still sends the recording when Close is never pressed', async () => {
    transcribe.mockResolvedValue({ text: 'recorded request' });
    const state = chatState();
    render(<VoiceScreen />);

    await waitFor(() =>
      expect(state.sendMessage).toHaveBeenCalledWith(
        'voice-conv-1',
        'recorded request',
        expect.any(String),
      ),
    );
  });
});

describe('Voice route on a phone without on-device recognition', () => {
  const transcribe = VoiceInput.transcribeAudioFile as jest.Mock;
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;
  const runOn = (os: 'ios' | 'android', version: number | string) => {
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
    Object.defineProperty(Platform, 'Version', { get: () => version, configurable: true });
  };

  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    speechRecognitionMock.__clearListeners();
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    mockAudioUri = 'file:///recording.m4a';
    transcribe.mockReset().mockResolvedValue({ text: 'recorded request' });
    const state = chatState();
    state.messages = {};
    state.error = null;
    state.createConversation.mockReset().mockResolvedValue('voice-conv-1');
    state.sendMessage.mockReset().mockResolvedValue(true);
    useChatAppModeStore.setState({ appMode: 'local' });
    useSettingsStore.setState({ hapticsEnabled: false, voiceEnabled: true });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
    Object.defineProperty(Platform, 'Version', { get: () => originalVersion, configurable: true });
    mockAudioUri = undefined;
  });

  it('leaves for the chat tab on Android API 32 without drawing the companion or hearing anything', async () => {
    runOn('android', 32);
    const screen = render(<VoiceScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/(tabs)/chat');
    expect(screen.queryByLabelText('Close voice companion')).toBeNull();
    expect(transcribe).not.toHaveBeenCalled();
    expect(chatState().createConversation).not.toHaveBeenCalled();
  });

  const refocus = () =>
    act(() => {
      mockFocusEffects.forEach((entry) => entry.focus());
    });

  it('steps past itself when Back from the chat tab lands on it again on Android API 32', async () => {
    runOn('android', 32);
    const screen = render(<VoiceScreen />);
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterBack).not.toHaveBeenCalled();

    mockCanGoBack.mockReturnValue(true);
    refocus();

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Close voice companion')).toBeNull();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('lets Android finish the Back press when nothing is behind it on API 32', async () => {
    runOn('android', 32);
    const exitApp = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
    render(<VoiceScreen />);
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);

    mockCanGoBack.mockReturnValue(false);
    refocus();

    expect(exitApp).toHaveBeenCalledTimes(1);
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    exitApp.mockRestore();
    mockCanGoBack.mockReturnValue(true);
  });

  it.each([
    ['Android API 33', 'android', 33],
    ['iOS', 'ios', '18.0'],
  ] as const)('stays on the companion on %s', async (_label, os, version) => {
    runOn(os, version);
    const screen = render(<VoiceScreen />);

    expect(screen.getByLabelText('Close voice companion')).toBeTruthy();
    await waitFor(() => expect(transcribe).toHaveBeenCalled());
    expect(mockRouterReplace).not.toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });
});

describe.each<['light' | 'dark', ColorScheme]>([
  ['light', lightColors],
  ['dark', colors],
])('Voice route in %s appearance', (themeMode, palette) => {
  const initialThemeMode = useLocalSettingsStore.getState().themeMode;
  const safeAreaBackground = (screen: ReturnType<typeof render>) =>
    StyleSheet.flatten(screen.getByTestId('voice.safe-area').props.style).backgroundColor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAudioUri = undefined;
    useChatAppModeStore.setState({ appMode: 'local' });
    useSettingsStore.setState({ hapticsEnabled: false, voiceEnabled: true });
    useTierStore.setState({ capabilityDocument: null });
    useLocalSettingsStore.setState({ themeMode });
  });

  afterEach(() => {
    mockVoiceRouteFocused = true;
    useRemoteCapabilityStore.setState({ switchedOff: {}, loadedAt: null });
    useLocalSettingsStore.setState({ themeMode: initialThemeMode });
  });

  it('frames the voice-off notice in the theme background, not the dark companion', () => {
    useRemoteCapabilityStore.setState({
      switchedOff: { canUseVoice: true },
      loadedAt: new Date().toISOString(),
    });

    const screen = render(<VoiceScreen />);

    expect(screen.getByTestId('capability.unavailable')).toBeTruthy();
    expect(safeAreaBackground(screen)).toBe(palette.background);
  });

  it('keeps the companion dark', () => {
    const screen = render(<VoiceScreen />);

    expect(screen.getByLabelText('Close voice companion')).toBeTruthy();
    expect(safeAreaBackground(screen)).toBe(colors.voiceCompanionBgEnd);
  });

  it('draws light status bar text only while the companion is in front, then hands the bar back to the theme', async () => {
    const themeBarStyle = themeMode === 'dark' ? 'light-content' : 'dark-content';
    const otherThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    const otherThemeBarStyle = themeMode === 'dark' ? 'dark-content' : 'light-content';
    const settleStatusBar = () => act(() => new Promise<void>((resolve) => setImmediate(resolve)));
    const nativeBarStyle = () =>
      jest.mocked(NativeModules.StatusBarManager.setStyle).mock.calls.at(-1)?.[0];
    function RootStatusBar() {
      return <ExpoStatusBar style={useTheme().statusBarStyle} />;
    }
    const tree = () => (
      <>
        <RootStatusBar />
        <VoiceScreen />
      </>
    );

    await settleStatusBar();
    mockVoiceRouteFocused = true;
    const screen = render(tree());
    await settleStatusBar();
    expect(nativeBarStyle()).toBe('light-content');

    mockVoiceRouteFocused = false;
    screen.rerender(tree());
    await settleStatusBar();
    expect(screen.getByLabelText('Close voice companion')).toBeTruthy();
    expect(nativeBarStyle()).toBe(themeBarStyle);

    act(() => useLocalSettingsStore.setState({ themeMode: otherThemeMode }));
    await settleStatusBar();
    expect(nativeBarStyle()).toBe(otherThemeBarStyle);

    mockVoiceRouteFocused = true;
    screen.rerender(tree());
    await settleStatusBar();
    expect(nativeBarStyle()).toBe('light-content');
  });
});

describe('Voice route microphone permission and leaving', () => {
  const recognizer = ExpoSpeechRecognitionModule as unknown as {
    requestPermissionsAsync: jest.Mock;
    getPermissionsAsync: jest.Mock;
  };
  const PAUSED = 'Voice paused when AGI left the foreground.';
  let appStateListener: ((state: string) => void) | undefined;
  let backListener: (() => boolean) | undefined;
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;
  const runOn = (os: 'ios' | 'android') => {
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
    Object.defineProperty(Platform, 'Version', {
      get: () => (os === 'android' ? 34 : '18.0'),
      configurable: true,
    });
  };

  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((accept) => {
      resolve = accept;
    });
    return { promise, resolve };
  };

  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    speechRecognitionMock.__clearListeners();
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    mockAudioUri = undefined;
    mockCanGoBack.mockReturnValue(true);
    mockVoiceRouteFocused = true;
    appStateListener = undefined;
    backListener = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_type, listener) => {
      backListener = listener as () => boolean;
      return { remove: jest.fn() };
    });
    recognizer.getPermissionsAsync.mockResolvedValue({ granted: true });
    recognizer.requestPermissionsAsync.mockResolvedValue({ granted: true });
    const state = chatState();
    state.messages = {};
    state.error = null;
    useChatAppModeStore.setState({ appMode: 'local' });
    useSettingsStore.setState({
      hapticsEnabled: false,
      voiceEnabled: true,
      voicePushToTalk: false,
      selectedVoiceId: null,
      speechRate: 1,
    });
  });

  afterEach(async () => {
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
    Object.defineProperty(Platform, 'Version', { get: () => originalVersion, configurable: true });
    await VoiceInput.cancelCapture();
    recognizer.getPermissionsAsync.mockResolvedValue({ granted: true });
    recognizer.requestPermissionsAsync.mockResolvedValue({ granted: true });
    jest.restoreAllMocks();
  });

  it('starts listening on an orb tap without asking again when the microphone is already allowed', async () => {
    const screen = render(<VoiceScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-companion-orb'));
    });

    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
    expect(recognizer.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Listening...')).toBeTruthy();
  });

  it('is not paused by the system permission screen and listens once the person allows', async () => {
    const answer = deferred<{ granted: boolean }>();
    recognizer.getPermissionsAsync.mockResolvedValue({ granted: false });
    recognizer.requestPermissionsAsync.mockReturnValue(answer.promise);
    const screen = render(<VoiceScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-companion-orb'));
    });
    await waitFor(() => expect(recognizer.requestPermissionsAsync).toHaveBeenCalledTimes(1));

    await act(async () => appStateListener?.('background'));
    await act(async () => appStateListener?.('active'));
    expect(screen.queryByText(PAUSED)).toBeNull();
    expect(ExpoSpeechRecognitionModule.abort).not.toHaveBeenCalled();

    await act(async () => answer.resolve({ granted: true }));

    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(PAUSED)).toBeNull();
    expect(screen.getByText('Listening...')).toBeTruthy();
  });

  it('still stops listening and says so when the app really leaves after a permission was granted', async () => {
    const answer = deferred<{ granted: boolean }>();
    recognizer.getPermissionsAsync.mockResolvedValue({ granted: false });
    recognizer.requestPermissionsAsync.mockReturnValue(answer.promise);
    const screen = render(<VoiceScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-companion-orb'));
    });
    await waitFor(() => expect(recognizer.requestPermissionsAsync).toHaveBeenCalledTimes(1));
    await act(async () => answer.resolve({ granted: true }));
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));

    await act(async () => appStateListener?.('background'));

    await waitFor(() => expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1));
    expect(screen.getByText(PAUSED)).toBeTruthy();
    expect(screen.getByText('Tap to speak')).toBeTruthy();
  });

  it('goes back when Close is pressed with a screen behind it', async () => {
    const screen = render(<VoiceScreen />);

    await act(async () => fireEvent.press(screen.getByLabelText('Close voice companion')));

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('opens a new chat when Close is pressed and nothing is behind the voice screen', async () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = render(<VoiceScreen />);

    await act(async () => fireEvent.press(screen.getByLabelText('Close voice companion')));

    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/(tabs)/chat');
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('opens a new chat on Android Back instead of offering to exit when nothing is behind it', async () => {
    runOn('android');
    mockCanGoBack.mockReturnValue(false);
    render(<VoiceScreen />);

    expect(backListener).toBeDefined();
    let handled: boolean | undefined;
    await act(async () => {
      handled = backListener?.();
    });

    expect(handled).toBe(true);
    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('stops listening and goes back on Android Back with a screen behind it', async () => {
    runOn('android');
    const screen = render(<VoiceScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-companion-orb'));
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));

    await act(async () => {
      backListener?.();
    });

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1);
  });

  it('leaves the system Back alone on iPhone', () => {
    runOn('ios');
    render(<VoiceScreen />);

    expect(backListener).toBeUndefined();
  });

  it('announces the phase to a screen reader', () => {
    const screen = render(<VoiceScreen />);

    expect(screen.getByText('Tap to speak').props.accessibilityLiveRegion).toBe('polite');
  });

  it('still stops listening when the app leaves while an earlier permission request never answered', async () => {
    const neverAnswered = deferred<{ granted: boolean }>();
    recognizer.getPermissionsAsync.mockResolvedValueOnce({ granted: false });
    recognizer.requestPermissionsAsync.mockReturnValueOnce(neverAnswered.promise);
    const first = render(<VoiceScreen />);
    await act(async () => {
      fireEvent.press(first.getByTestId('voice-companion-orb'));
    });
    await waitFor(() => expect(recognizer.requestPermissionsAsync).toHaveBeenCalledTimes(1));
    first.unmount();

    recognizer.getPermissionsAsync.mockResolvedValue({ granted: true });
    const second = render(<VoiceScreen />);
    await act(async () => {
      fireEvent.press(second.getByTestId('voice-companion-orb'));
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));

    await act(async () => appStateListener?.('background'));

    try {
      await waitFor(() => expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1));
      expect(second.getByText(PAUSED)).toBeTruthy();
    } finally {
      await act(async () => neverAnswered.resolve({ granted: false }));
    }
  });
});
