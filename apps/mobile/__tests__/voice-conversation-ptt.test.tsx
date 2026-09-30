/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

let mockAudioUri: string | undefined;
let mockSelectedModel = 'test-model';

jest.mock('../lib/mmkv', () => ({
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

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({ audioUri: mockAudioUri }),
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: (selector: (s: { selectedModel: string }) => unknown) =>
    selector({ selectedModel: mockSelectedModel }),
}));

import VoiceScreen from '@/app/(app)/voice';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import { useSettingsStore } from '../stores/settingsStore';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '@/src/features/model-picker/service';
import { useTierStore } from '@/src/features/billing/store';

const speechRecognitionMock = jest.requireMock('expo-speech-recognition') as {
  __fireResult: (event: {
    results: Array<{ transcript: string; confidence: number }>;
    isFinal: boolean;
  }) => void;
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
    chatState().messages = {};
    chatState().error = null;
    mockSelectedModel = 'test-model';
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
});
