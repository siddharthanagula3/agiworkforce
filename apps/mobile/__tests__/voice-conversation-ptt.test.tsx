/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
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
    selector({ selectedModel: 'test-model' }),
}));

import VoiceScreen from '@/app/(app)/voice';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import { useSettingsStore } from '../stores/settingsStore';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

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
    await VoiceInput.cancelCapture();
    speechRecognitionMock.__clearListeners();
    jest.clearAllMocks();
    useSettingsStore.setState({
      hapticsEnabled: false,
      voicePushToTalk: false,
      selectedVoiceId: null,
      speechRate: 1,
    });
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
