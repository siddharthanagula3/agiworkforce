/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Alert, Keyboard, TextInput } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        return (props: Record<string, unknown>) => (
          <View testID={`icon-${String(name)}`} {...props} />
        );
      },
    },
  );
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../src/features/chat/draftStore', () => ({
  getDraft: jest.fn(() => ''),
  getDraftAttachments: jest.fn(() => []),
  setDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

jest.mock('../src/features/chat/components/AttachmentPreview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { AttachmentPreview: () => <View testID="attachment-preview" /> };
});

jest.mock('../src/features/chat/components/SendButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    SendButton: ({ state, onPress }: { state: string; onPress: () => void }) => (
      <Pressable onPress={onPress} testID="send-button" accessibilityRole="button">
        <Text>{state}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../src/features/chat/components/CommandPalette', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { CommandPalette: () => <View testID="command-palette" /> };
});

jest.mock('../src/features/chat/components/MediaModeChip', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { MediaModeChip: () => <View testID="media-mode-chip" /> };
});

let lastWaveformProps: { active?: boolean; audioLevel?: number } | undefined;

jest.mock('../src/features/voice/components/Waveform', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Waveform: (props: { active?: boolean; audioLevel?: number }) => {
      lastWaveformProps = props;
      return <View testID="dictation-waveform" />;
    },
  };
});

let capturedVoice: React.ComponentProps<
  typeof import('../src/features/voice/components/VoiceInputButton').VoiceInputButton
>;
const mockVoiceStop = jest.fn();
const mockVoiceCancel = jest.fn();
const mockVoiceHold = jest.fn();

jest.mock('../src/features/voice/components/VoiceInputButton', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    VoiceInputButton: (props: typeof capturedVoice) => {
      capturedVoice = props;
      React.useImperativeHandle(props.controlRef, () => ({
        stop: mockVoiceStop,
        cancel: mockVoiceCancel,
        hold: mockVoiceHold,
      }));
      return <Pressable testID="voice-input-button" accessibilityLabel="Voice input" />;
    },
  };
});

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedModel: 'fixture-cloud-model', thinkingEnabledPerModel: {} }),
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({ appMode: 'local' }),
    {
      getState: () => ({ appMode: 'local' }),
      subscribe: jest.fn(() => jest.fn()),
    },
  ),
}));

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ isClerkSignedIn: false }),
}));

jest.mock('../stores/chatStore', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      features: {
        webSearch: true,
        imageGen: false,
        health: false,
        codeExecution: false,
        research: false,
      },
    }),
}));

jest.mock('../src/features/billing/store', () => ({
  useTierStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      tier: 'free',
      grantedCapabilities: [],
      codeExecutionAvailable: false,
      genericWebSearchAvailable: false,
    }),
}));

jest.mock('../src/features/model-picker/service', () => ({
  getShortDisplayName: () => 'Fixture Model',
  isFreeQuotaTurnModelId: () => false,
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ hapticsEnabled: false, themeMode: 'dark' }),
}));

jest.mock('../src/ui/theme', () => {
  const themeColors = {
    background: '#000000',
    surfaceBase: '#171717',
    teal: '#14b8a6',
    terraCotta: '#e07a5f',
    textMuted: '#888',
    textSecondary: '#bbb',
    textPrimary: '#fff',
    surfaceElevated: '#1a1a1a',
    surfaceHover: '#303030',
    inputSurface: '#242424',
    accentSurface: '#292929',
    accentBorder: '#555',
    border: '#444',
    composerBorder: '#333',
    transparent: 'transparent',
  };
  return {
    useTheme: () => ({ colors: themeColors, isDark: true }),
    useThemeColors: () => themeColors,
    colors: themeColors,
    radii: { sm: 6, md: 8, lg: 12, xl: 16, '2xl': 24, '3xl': 32, full: 9999 },
  };
});

jest.mock('../lib/constants', () => ({ MAX_INPUT_LINES: 6 }));

import { ChatInput } from '../src/features/chat/components/ChatInput';

const defaultProps = {
  onSend: jest.fn(),
  isStreaming: false,
  onStop: jest.fn(),
  onOpenModelPicker: jest.fn(),
  onOpenVoiceMode: jest.fn(),
  onOpenAddToChat: jest.fn(),
  isOnline: true,
};

function renderInput(overrides: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  return render(<ChatInput {...defaultProps} {...overrides} />);
}

function startRecording() {
  act(() => capturedVoice.onRecordingStart?.());
}

function deliver(text: string, intent: 'insert' | 'send') {
  act(() => capturedVoice.onTranscription(text, intent));
}

describe('ChatInput owned dictation controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastWaveformProps = undefined;
  });

  it('renders cancel, waveform, stop and send without an elapsed timer', () => {
    const { getByTestId, queryByText } = renderInput();
    startRecording();
    expect(getByTestId('chat.composer.dictation-cancel')).toBeTruthy();
    expect(getByTestId('dictation-waveform')).toBeTruthy();
    expect(getByTestId('chat.composer.dictation-stop')).toBeTruthy();
    expect(getByTestId('chat.composer.dictation-send')).toBeTruthy();
    expect(queryByText(/^\d\d:\d\d$/)).toBeNull();
  });

  it('delegates send to its recording owner and sends the completed result', async () => {
    const onSend = jest.fn();
    const { getByTestId } = renderInput({ onSend });
    startRecording();
    fireEvent.press(getByTestId('chat.composer.dictation-send'));
    expect(mockVoiceStop).toHaveBeenCalledWith('send');
    expect(onSend).not.toHaveBeenCalled();
    deliver('book the meeting room', 'send');
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('book the meeting room', undefined));
  });

  it('merges text edited while recording instead of overwriting it', async () => {
    const onSend = jest.fn();
    const { getByLabelText } = renderInput({ onSend });
    fireEvent.changeText(getByLabelText('Message input'), 'Original');
    startRecording();
    fireEvent.changeText(
      getByLabelText('Message input', { includeHiddenElements: true }),
      'Remind me',
    );
    deliver('tomorrow at nine', 'send');
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('Remind me tomorrow at nine', undefined),
    );
  });

  it('preserves the dictated draft when send is rejected', async () => {
    const onSend = jest.fn(async () => false);
    const { getByLabelText } = renderInput({ onSend });
    startRecording();
    deliver('send the invoice', 'send');
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('send the invoice', undefined));
    expect(getByLabelText('Message input').props.value).toBe('send the invoice');
  });

  it('delegates stop as review and inserts without sending', () => {
    const onSend = jest.fn();
    const { getByTestId, getByLabelText } = renderInput({ onSend });
    startRecording();
    fireEvent.press(getByTestId('chat.composer.dictation-stop'));
    expect(mockVoiceStop).toHaveBeenCalledWith('insert');
    deliver('draft a reply', 'insert');
    expect(getByLabelText('Message input').props.value).toBe('draft a reply');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('keeps cancellation available while its owner transcribes', () => {
    const { getByTestId, queryByTestId, getByText } = renderInput();
    startRecording();
    act(() => {
      capturedVoice.onRecordingStop?.();
      capturedVoice.onProcessingChange?.(true);
    });
    expect(queryByTestId('chat.composer.dictation-stop')).toBeNull();
    expect(queryByTestId('dictation-waveform')).toBeNull();
    expect(getByText('Transcribing')).toBeTruthy();
    expect(getByTestId('chat.composer.dictation-send').props.accessibilityState?.disabled).toBe(
      true,
    );
    fireEvent.press(getByTestId('chat.composer.dictation-cancel'));
    expect(mockVoiceCancel).toHaveBeenCalledTimes(1);
    expect(queryByTestId('chat.composer.transcribing')).toBeNull();
  });

  it('passes a new ownership scope when the draft destination changes', () => {
    const view = renderInput({ draftKey: 'first', draftProvenance: { scope: 'local' } });
    const originalScope = capturedVoice.scopeKey;
    view.rerender(
      <ChatInput {...defaultProps} draftKey="second" draftProvenance={{ scope: 'local' }} />,
    );
    expect(capturedVoice.scopeKey).not.toBe(originalScope);
  });

  it('offers Try again only for a real miss, not when recognition cannot start', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderInput();
    act(() => capturedVoice.onFailure?.());
    expect(alertSpy).toHaveBeenLastCalledWith(
      "Didn't catch that",
      "Audio isn't saved, so say it again.",
      expect.arrayContaining([expect.objectContaining({ text: 'Try again' })]),
    );
    act(() =>
      capturedVoice.onError?.(
        'Speech recognition is not available on this device or for this language. You can type instead.',
      ),
    );
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]?.[2];
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Voice input unavailable',
      'Speech recognition is not available on this device or for this language. You can type instead.',
    );
    expect(buttons).toBeUndefined();
    alertSpy.mockRestore();
  });
});

const mockDrafts = require('../src/features/chat/draftStore') as { setDraft: jest.Mock };

describe('ChatInput words heard while dictating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function hear(words: string) {
    act(() => capturedVoice.onPartialTranscript?.(words));
  }

  it('shows the waveform alone until the first words arrive, then the words above it', () => {
    const { getByTestId, queryByTestId } = renderInput();
    startRecording();
    expect(getByTestId('dictation-waveform')).toBeTruthy();
    expect(queryByTestId('chat.composer.live-transcript')).toBeNull();

    hear('book the');
    expect(getByTestId('chat.composer.live-transcript')).toHaveTextContent('book the');
    expect(getByTestId('dictation-waveform')).toBeTruthy();

    hear('book the meeting room');
    expect(getByTestId('chat.composer.live-transcript')).toHaveTextContent('book the meeting room');
  });

  it('shows the words after the text already in the field', () => {
    const { getByLabelText, getByTestId } = renderInput();
    fireEvent.changeText(getByLabelText('Message input'), 'Remind me');
    startRecording();
    hear('tomorrow at nine');
    expect(getByTestId('chat.composer.live-transcript')).toHaveTextContent(
      'Remind me tomorrow at nine',
    );
  });

  it('keeps the words on screen while the final text resolves, then puts the final text in the field', () => {
    const { getByLabelText, getByTestId, queryByTestId, queryByText } = renderInput();
    startRecording();
    hear('draft a reply');
    act(() => {
      capturedVoice.onRecordingStop?.();
      capturedVoice.onProcessingChange?.(true);
    });
    expect(getByTestId('chat.composer.live-transcript')).toHaveTextContent('draft a reply');
    expect(queryByText('Transcribing')).toBeNull();

    act(() => {
      capturedVoice.onProcessingChange?.(false);
      capturedVoice.onTranscription('Draft a reply to Sam.', 'insert');
    });
    expect(queryByTestId('chat.composer.live-transcript')).toBeNull();
    expect(getByLabelText('Message input').props.value).toBe('Draft a reply to Sam.');
  });

  it('clears the words and leaves the field as it was when the dictation is cancelled', () => {
    const { getByLabelText, getByTestId, queryByTestId } = renderInput();
    fireEvent.changeText(getByLabelText('Message input'), 'Keep this');
    startRecording();
    hear('not this');
    fireEvent.press(getByTestId('chat.composer.dictation-cancel'));
    expect(mockVoiceCancel).toHaveBeenCalledTimes(1);
    expect(queryByTestId('chat.composer.live-transcript')).toBeNull();

    startRecording();
    expect(queryByTestId('chat.composer.live-transcript')).toBeNull();
    expect(getByLabelText('Message input', { includeHiddenElements: true }).props.value).toBe(
      'Keep this',
    );
  });

  it('clears the words and keeps the retry offer when nothing usable comes back', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { queryByTestId } = renderInput();
    startRecording();
    hear('mumble');
    act(() => {
      capturedVoice.onRecordingStop?.();
      capturedVoice.onProcessingChange?.(true);
    });
    act(() => {
      capturedVoice.onProcessingChange?.(false);
      capturedVoice.onFailure?.();
    });
    expect(queryByTestId('chat.composer.live-transcript')).toBeNull();
    expect(alertSpy).toHaveBeenLastCalledWith(
      "Didn't catch that",
      "Audio isn't saved, so say it again.",
      expect.arrayContaining([expect.objectContaining({ text: 'Try again' })]),
    );
    alertSpy.mockRestore();
  });

  it('keeps the Transcribing label when the recognizer gave no words while recording', () => {
    const { getByText } = renderInput();
    startRecording();
    act(() => {
      capturedVoice.onRecordingStop?.();
      capturedVoice.onProcessingChange?.(true);
    });
    expect(getByText('Transcribing')).toBeTruthy();
  });

  it('tells a screen reader it is transcribing while the heard words stay on screen', () => {
    const { getByTestId } = renderInput();
    startRecording();
    hear('draft a reply');
    expect(getByTestId('chat.composer.live-transcript').props.accessibilityLabel).toBeUndefined();

    act(() => {
      capturedVoice.onRecordingStop?.();
      capturedVoice.onProcessingChange?.(true);
    });
    const preview = getByTestId('chat.composer.live-transcript');
    expect(preview.props.accessibilityRole).toBe('alert');
    expect(preview.props.accessibilityLabel).toBe('Transcribing, draft a reply');
    expect(preview.props.accessibilityLiveRegion).toBe('polite');
  });

  it('never brings the sent words back when a dictation ends just after Send', async () => {
    let resolveSend!: (accepted: boolean) => void;
    const onSend = jest.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
    const { getByLabelText, getByTestId } = renderInput({
      onSend,
      draftKey: 'conversation-1',
      conversationId: 'conversation-1',
      draftProvenance: { scope: 'local' },
    });
    fireEvent.changeText(getByLabelText('Message input'), 'Plan the offsite');
    fireEvent.press(getByTestId('send-button'));
    const writesAfterSend = mockDrafts.setDraft.mock.calls.length;

    startRecording();
    hear('and the dinner');
    expect(getByTestId('chat.composer.live-transcript')).toHaveTextContent('and the dinner');
    deliver('and the dinner', 'insert');
    await act(async () => {
      resolveSend(true);
    });

    expect(onSend).toHaveBeenCalledWith('Plan the offsite', undefined);
    expect(getByLabelText('Message input').props.value).toBe('and the dinner');
    const laterWrites = mockDrafts.setDraft.mock.calls
      .slice(writesAfterSend)
      .map(([, text]) => text as string);
    expect(laterWrites.length).toBeGreaterThan(0);
    expect(laterWrites.some((text) => text.includes('Plan the offsite'))).toBe(false);
  });
});

describe('ChatInput hold the field to talk', () => {
  const HOLD = 'chat.composer.hold-to-talk';
  const hidden = { includeHiddenElements: true };
  const textFrame = { x: 17, y: 13, width: 300, height: 24 };

  let keyboardListeners: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    keyboardListeners = jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation(() => ({ remove: jest.fn() }) as never);
  });
  afterEach(() => {
    jest.useRealTimers();
    keyboardListeners.mockRestore();
  });

  function offerHold(available = true) {
    act(() => capturedVoice.onHoldAvailableChange?.(available));
  }

  function measureTextBlock(view: ReturnType<typeof renderInput>) {
    let node = view.getByLabelText('Message input').parent;
    while (node && !(typeof node.type === 'string' && node.props.onLayout)) node = node.parent;
    if (!node) throw new Error('text block not found');
    fireEvent(node, 'layout', { nativeEvent: { layout: textFrame } });
  }

  function touch(locationX: number, locationY: number) {
    return { nativeEvent: { locationX, locationY, pageX: 0, pageY: 0, timestamp: 0 } };
  }

  function holdField(view: ReturnType<typeof renderInput>, ms: number) {
    fireEvent(view.getByTestId(HOLD, hidden), 'responderGrant', touch(20, 10));
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  }

  function openKeyboard() {
    const add = Keyboard.addListener as unknown as jest.Mock;
    act(() => {
      for (const call of add.mock.calls) {
        if (call[0] === 'keyboardWillShow' || call[0] === 'keyboardDidShow') {
          (call[1] as () => void)();
        }
      }
    });
  }

  it('names the gesture in the new chat placeholder only when the microphone can take it', () => {
    const view = renderInput();
    expect(view.getByLabelText('Message input').props.placeholder).toBe("What's on your mind?");
    measureTextBlock(view);
    offerHold();
    expect(view.getByLabelText('Message input').props.placeholder).toBe('Type or hold to talk');
    offerHold(false);
    expect(view.getByLabelText('Message input').props.placeholder).toBe("What's on your mind?");
  });

  it('stops naming the gesture while the field is focused or the keyboard is up', () => {
    const view = renderInput();
    measureTextBlock(view);
    offerHold();
    const placeholder = () => view.getByLabelText('Message input').props.placeholder;
    expect(placeholder()).toBe('Type or hold to talk');

    fireEvent(view.getByLabelText('Message input'), 'focus');
    expect(placeholder()).toBe("What's on your mind?");
    fireEvent(view.getByLabelText('Message input'), 'blur');
    expect(placeholder()).toBe('Type or hold to talk');

    openKeyboard();
    expect(placeholder()).toBe("What's on your mind?");
  });

  it('leaves the offline, image, video and thread placeholders as they are', () => {
    const { useChatViewStore } = require('../stores/chat/chatViewStore') as {
      useChatViewStore: { setState: (state: { mediaMode: 'text' | 'image' | 'video' }) => void };
    };
    const placeholderIn = (overrides: Partial<React.ComponentProps<typeof ChatInput>>) => {
      const view = renderInput(overrides);
      measureTextBlock(view);
      offerHold();
      const placeholder = view.getByLabelText('Message input').props.placeholder as string;
      view.unmount();
      return placeholder;
    };

    expect(placeholderIn({ isOnline: false })).toMatch(/^Offline/);
    expect(placeholderIn({ isThreadActive: true })).toBe('Reply to AGI');
    try {
      act(() => useChatViewStore.setState({ mediaMode: 'image' }));
      expect(placeholderIn({})).toBe('Describe the image to create');
      act(() => useChatViewStore.setState({ mediaMode: 'video' }));
      expect(placeholderIn({})).toBe('Describe the video to create');
    } finally {
      act(() => useChatViewStore.setState({ mediaMode: 'text' }));
    }
  });

  it('measures the text block before the hold becomes available', () => {
    const view = renderInput();
    measureTextBlock(view);
    offerHold();
    expect(view.getByTestId(HOLD, hidden)).toBeTruthy();
  });

  it('starts dictation after a 300 ms hold on the empty field and inserts it on release', () => {
    const view = renderInput();
    offerHold();
    measureTextBlock(view);

    holdField(view, 299);
    expect(mockVoiceHold).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(mockVoiceHold).toHaveBeenCalledTimes(1);

    startRecording();
    expect(view.getByTestId('dictation-waveform')).toBeTruthy();
    expect(view.getByTestId(HOLD, hidden)).toBeTruthy();

    fireEvent(view.getByTestId(HOLD, hidden), 'responderRelease', touch(40, 12));
    expect(mockVoiceStop).toHaveBeenCalledWith('insert');
    expect(mockVoiceCancel).not.toHaveBeenCalled();
    expect(view.queryByTestId(HOLD, hidden)).toBeNull();
  });

  it('focuses the field on a short tap without starting dictation', () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    try {
      const view = renderInput();
      offerHold();
      measureTextBlock(view);

      holdField(view, 120);
      fireEvent(view.getByTestId(HOLD, hidden), 'responderRelease', touch(20, 10));

      expect(focus).toHaveBeenCalled();
      expect(mockVoiceHold).not.toHaveBeenCalled();
      expect(mockVoiceStop).not.toHaveBeenCalled();
    } finally {
      focus.mockRestore();
    }
  });

  it('cancels when the finger slides off the field before letting go', () => {
    const view = renderInput();
    offerHold();
    measureTextBlock(view);

    holdField(view, 300);
    startRecording();
    fireEvent(view.getByTestId(HOLD, hidden), 'responderMove', touch(20, -80));
    fireEvent(view.getByTestId(HOLD, hidden), 'responderRelease', touch(20, -80));

    expect(mockVoiceCancel).toHaveBeenCalledTimes(1);
    expect(mockVoiceStop).not.toHaveBeenCalled();
    expect(view.queryByTestId('chat.composer.recording')).toBeNull();
  });

  it('cancels when the system takes the touch away during the hold', () => {
    const view = renderInput();
    offerHold();
    measureTextBlock(view);

    holdField(view, 300);
    expect(view.getByTestId(HOLD, hidden).props.onResponderTerminationRequest()).toBe(false);
    fireEvent(view.getByTestId(HOLD, hidden), 'responderTerminate', touch(0, 0));
    expect(mockVoiceCancel).toHaveBeenCalledTimes(1);
  });

  it('leaves a field with text to the platform long press', () => {
    const view = renderInput();
    offerHold();
    measureTextBlock(view);
    expect(view.getByTestId(HOLD, hidden)).toBeTruthy();

    fireEvent.changeText(view.getByLabelText('Message input'), 'Hello');
    expect(view.queryByTestId(HOLD, hidden)).toBeNull();
    expect(mockVoiceHold).not.toHaveBeenCalled();
  });

  it('leaves the field to the platform while the keyboard is up', () => {
    const view = renderInput();
    offerHold();
    measureTextBlock(view);
    openKeyboard();
    expect(view.queryByTestId(HOLD, hidden)).toBeNull();
  });

  it('offers no hold when the microphone cannot take it', () => {
    const view = renderInput();
    offerHold();
    measureTextBlock(view);
    offerHold(false);
    expect(view.queryByTestId(HOLD, hidden)).toBeNull();
  });

  it('leaves a focused field to the platform even with no on-screen keyboard', () => {
    const view = renderInput();
    offerHold();
    measureTextBlock(view);

    fireEvent(view.getByLabelText('Message input'), 'focus');
    expect(view.queryByTestId(HOLD, hidden)).toBeNull();

    fireEvent(view.getByLabelText('Message input'), 'blur');
    expect(view.getByTestId(HOLD, hidden)).toBeTruthy();
  });
});
