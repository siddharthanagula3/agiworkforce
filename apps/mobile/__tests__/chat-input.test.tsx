/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for ChatInput component.
 *
 * Validates the restructured chat input bar:
 * - [+] button, model pill, mic button, send button presence
 * - [+] calls onOpenAddToChat
 * - Streaming state: placeholder text, stop button
 * - Send triggers message send
 * - Disabled state shows "You're offline" placeholder
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — declared before imports
// ---------------------------------------------------------------------------

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
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
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

// Mock sub-components to simplify testing
jest.mock('../src/features/chat/components/ModelSelectorButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    ModelSelectorButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable onPress={onPress} testID="model-selector-button">
        <Text>Model</Text>
      </Pressable>
    ),
  };
});

jest.mock('../src/features/chat/components/AttachmentPreview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    AttachmentPreview: () => <View testID="attachment-preview" />,
  };
});

jest.mock('../src/features/chat/components/SendButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    SendButton: ({
      state,
      onPress,
      disabled,
    }: {
      state: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled && state === 'idle'}
        testID="send-button"
        accessibilityLabel={state === 'streaming' ? 'Stop generating' : 'Send message'}
        accessibilityRole="button"
      >
        <Text>{state === 'streaming' ? 'Stop' : 'Send'}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../src/features/chat/components/CommandPalette', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CommandPalette: () => <View testID="command-palette" />,
  };
});

let lastVoiceResetSignal: number | undefined;

jest.mock('../src/features/voice/components/VoiceInputButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    VoiceInputButton: (props: { resetSignal?: number }) => {
      lastVoiceResetSignal = props.resetSignal;
      return (
        <Pressable testID="voice-input-button" accessibilityLabel="Voice input">
          <Text>Mic</Text>
        </Pressable>
      );
    },
  };
});

let capturedOverlaySend: (() => void) | undefined;
let capturedOverlayCancel: (() => void) | undefined;

jest.mock('../src/features/voice/components/RecordingOverlay', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    RecordingOverlay: (props: { onSend: () => void; onCancel: () => void }) => {
      capturedOverlaySend = props.onSend;
      capturedOverlayCancel = props.onCancel;
      return <View testID="recording-overlay" />;
    },
  };
});

jest.mock('../src/features/voice/services/voice', () => ({
  isRecording: jest.fn().mockReturnValue(false),
  cancelRecording: jest.fn().mockResolvedValue(undefined),
  stopRecording: jest.fn().mockResolvedValue('mock-uri'),
  transcribe: jest.fn().mockResolvedValue({ text: '' }),
}));

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedModel: 'claude-sonnet-4.6',
      thinkingEnabledPerModel: {},
    }),
}));

jest.mock('../src/features/model-picker/service', () => ({
  getShortDisplayName: (id: string) => {
    if (id === 'claude-sonnet-4.6') return 'Claude 4.6 Sonnet';
    return id;
  },
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ hapticsEnabled: false, themeMode: 'dark' }),
}));

jest.mock('../src/ui/theme', () => ({
  useTheme: () => ({
    colors: {
      textPrimary: '#fff',
      textMuted: '#888',
      surfaceElevated: '#1a1a1a',
      teal: '#14b8a6',
      terraCotta: '#e07a5f',
    },
    isDark: true,
  }),
  colors: {
    teal: '#14b8a6',
    terraCotta: '#e07a5f',
    textMuted: '#888',
    textPrimary: '#fff',
    surfaceElevated: '#1a1a1a',
  },
  radii: {
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 24,
    '3xl': 32,
    full: 9999,
  },
}));

jest.mock('../src/features/chat/components/TemporaryChatToggle', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    TemporaryChatToggle: () => <View testID="temporary-chat-toggle" />,
  };
});

jest.mock('../lib/constants', () => ({
  MAX_INPUT_LINES: 6,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ChatInput } from '../src/features/chat/components/ChatInput';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  onSend: jest.fn(),
  isStreaming: false,
  onStop: jest.fn(),
  onOpenModelPicker: jest.fn(),
  onOpenVoiceMode: jest.fn(),
  onOpenAddToChat: jest.fn(),
  onOpenConnectors: jest.fn(),
  isOnline: true,
};

function renderInput(overrides: Partial<typeof defaultProps> = {}) {
  return render(<ChatInput {...defaultProps} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastVoiceResetSignal = undefined;
    capturedOverlaySend = undefined;
    capturedOverlayCancel = undefined;
  });

  // ---- Button presence ----

  describe('button presence', () => {
    it('renders [+] button', () => {
      const { getByLabelText } = renderInput();
      expect(getByLabelText('Add to chat')).toBeTruthy();
    });

    it('renders Model pill', () => {
      const { getByTestId } = renderInput();
      expect(getByTestId('model-selector-button')).toBeTruthy();
    });

    it('renders mic button', () => {
      const { getByTestId } = renderInput();
      expect(getByTestId('voice-input-button')).toBeTruthy();
    });

    it('renders voice-mode button when composer is empty and onOpenVoiceMode is set', () => {
      // The composer's right circle is a state slot (ChatGPT reference:
      // empty -> voice-mode waveform, typing -> send, streaming -> stop).
      // Send-with-content is covered separately in "sending messages" below.
      const { getByLabelText } = renderInput();
      expect(getByLabelText('Start voice mode')).toBeTruthy();
    });

    it('renders send button once the composer has content', () => {
      const { getByLabelText, getByTestId } = renderInput();
      fireEvent.changeText(getByLabelText('Message input'), 'Hello');
      expect(getByTestId('send-button')).toBeTruthy();
    });

    it('renders the temporary chat toggle (visible status + shortcut in the toolbar)', () => {
      // Regression: TemporaryChatToggle was fully built (icon, "Temporary" badge,
      // a11y) with a docstring saying it belongs in the ChatInput toolbar, but was
      // never actually imported/rendered anywhere — there was no way to see or
      // toggle temporary-chat state from the main composer, only from deep inside
      // the Add-to-Chat sheet.
      const { getByTestId } = renderInput();
      expect(getByTestId('temporary-chat-toggle')).toBeTruthy();
    });
  });

  // ---- [+] button behaviour ----

  describe('[+] button', () => {
    it('calls onOpenAddToChat when pressed', () => {
      const onOpenAddToChat = jest.fn();
      const { getByLabelText } = renderInput({ onOpenAddToChat });

      fireEvent.press(getByLabelText('Add to chat'));

      expect(onOpenAddToChat).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Streaming state ----

  describe('streaming state', () => {
    it('shows "Reply to [model]..." placeholder during streaming', () => {
      const { getByLabelText } = renderInput({ isStreaming: true });

      const input = getByLabelText('Message input');
      expect(input.props.placeholder).toBe('Reply to Claude 4.6 Sonnet...');
    });

    it('shows stop button instead of send during streaming', () => {
      const { getByLabelText } = renderInput({ isStreaming: true });

      expect(getByLabelText('Stop generating')).toBeTruthy();
    });
  });

  // ---- Sending messages ----

  describe('sending messages', () => {
    it('send button triggers onSend with text', () => {
      const onSend = jest.fn();
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      // Type text
      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'Hello world');

      // Press send
      fireEvent.press(getByTestId('send-button'));

      expect(onSend).toHaveBeenCalledWith('Hello world', undefined);
    });
  });

  // ---- Disabled state ----

  describe('offline state', () => {
    it('shows offline placeholder when isOnline is false', () => {
      const { getByLabelText } = renderInput({ isOnline: false });

      const input = getByLabelText('Message input');
      expect(input.props.placeholder).toContain('Offline');
    });
  });

  // ---- Voice recording overlay "Send" reset signal ----

  describe('recording overlay send', () => {
    it('bumps voiceResetSignal even when the recording session already ended', async () => {
      // Regression: on the iOS Simulator (no mic) — and in a real race on
      // device — VoiceService.isRecording() can already be false by the time
      // "Send recording" is tapped. The old handler returned early in that
      // case WITHOUT bumping voiceResetSignal, so VoiceInputButton's internal
      // state stayed stuck on "recording" (red mic, "Tap to stop recording"
      // a11y label) with no way back short of triggering a second, unrelated
      // error path.

      const VoiceService = require('../src/features/voice/services/voice');
      VoiceService.isRecording.mockReturnValue(false);

      renderInput();
      const signalBefore = lastVoiceResetSignal;

      await act(async () => {
        await capturedOverlaySend!();
      });

      await waitFor(() => {
        expect(lastVoiceResetSignal).toBe((signalBefore ?? 0) + 1);
      });
      expect(VoiceService.stopRecording).not.toHaveBeenCalled();
      expect(VoiceService.transcribe).not.toHaveBeenCalled();
    });

    it('bumps voiceResetSignal after a normal send with an active recording', async () => {
      const VoiceService = require('../src/features/voice/services/voice');
      VoiceService.isRecording.mockReturnValue(true);
      VoiceService.transcribe.mockResolvedValue({ text: 'hello from voice' });

      const onSend = jest.fn();
      renderInput({ onSend });
      const signalBefore = lastVoiceResetSignal;

      await act(async () => {
        await capturedOverlaySend!();
      });

      await waitFor(() => {
        expect(lastVoiceResetSignal).toBe((signalBefore ?? 0) + 1);
      });
      expect(VoiceService.stopRecording).toHaveBeenCalledTimes(1);
    });
  });
});
