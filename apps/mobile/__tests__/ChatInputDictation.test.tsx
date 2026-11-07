/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
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

let capturedVoice: React.ComponentProps<typeof import('../src/features/voice/components/VoiceInputButton').VoiceInputButton>;
const mockVoiceStop = jest.fn();
const mockVoiceCancel = jest.fn();

jest.mock('../src/features/voice/components/VoiceInputButton', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    VoiceInputButton: (props: typeof capturedVoice) => {
      capturedVoice = props;
      React.useImperativeHandle(props.controlRef, () => ({ stop: mockVoiceStop, cancel: mockVoiceCancel }));
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
    fireEvent.changeText(getByLabelText('Message input'), 'Remind me');
    deliver('tomorrow at nine', 'send');
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Remind me tomorrow at nine', undefined));
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
    expect(getByTestId('chat.composer.dictation-send').props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(getByTestId('chat.composer.dictation-cancel'));
    expect(mockVoiceCancel).toHaveBeenCalledTimes(1);
    expect(queryByTestId('chat.composer.transcribing')).toBeNull();
  });

  it('passes a new ownership scope when the draft destination changes', () => {
    const view = renderInput({ draftKey: 'first', draftProvenance: { scope: 'local' } });
    const originalScope = capturedVoice.scopeKey;
    view.rerender(<ChatInput {...defaultProps} draftKey="second" draftProvenance={{ scope: 'local' }} />);
    expect(capturedVoice.scopeKey).not.toBe(originalScope);
  });
});
