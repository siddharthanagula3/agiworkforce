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
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — declared before imports
// ---------------------------------------------------------------------------

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
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
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

// Mock sub-components to simplify testing
jest.mock('../components/chat/ModelSelectorButton', () => {
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

jest.mock('../components/chat/AttachmentPreview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    AttachmentPreview: () => <View testID="attachment-preview" />,
  };
});

jest.mock('../components/chat/SendButton', () => {
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

jest.mock('../components/chat/CommandPalette', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CommandPalette: () => <View testID="command-palette" />,
  };
});

jest.mock('../components/voice/VoiceInputButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    VoiceInputButton: () => (
      <Pressable testID="voice-input-button" accessibilityLabel="Voice input">
        <Text>Mic</Text>
      </Pressable>
    ),
  };
});

jest.mock('../components/voice/RecordingOverlay', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    RecordingOverlay: () => <View testID="recording-overlay" />,
  };
});

jest.mock('../services/voice', () => ({
  isRecording: jest.fn().mockReturnValue(false),
  cancelRecording: jest.fn().mockResolvedValue(undefined),
  stopRecording: jest.fn().mockResolvedValue('mock-uri'),
  transcribe: jest.fn().mockResolvedValue({ text: '' }),
}));

jest.mock('../stores/modelStore', () => ({
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedModel: 'claude-sonnet-4.6',
      thinkingEnabledPerModel: {},
    }),
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ hapticsEnabled: false, themeMode: 'dark' }),
}));

jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      textPrimary: '#fff',
      textMuted: '#888',
      surfaceElevated: '#1a1a1a',
    },
    isDark: true,
  }),
}));

jest.mock('../lib/models', () => ({
  getDisplayName: (id: string) => {
    if (id === 'claude-sonnet-4.6') return 'Claude 4.6 Sonnet';
    return id;
  },
  isAutoMode: () => false,
  getModelById: () => undefined,
  PROVIDERS: [],
}));

jest.mock('../components/chat/AutoApproveToggle', () => ({
  AutoApproveToggle: jest.fn().mockReturnValue(null),
}));

jest.mock('../components/chat/TemporaryChatToggle', () => ({
  TemporaryChatToggle: jest.fn().mockReturnValue(null),
}));

jest.mock('../lib/theme', () => ({
  colors: {
    teal: '#14b8a6',
    terraCotta: '#e07a5f',
    textMuted: '#888',
  },
}));

jest.mock('../lib/constants', () => ({
  MAX_INPUT_LINES: 6,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ChatInput } from '../components/chat/ChatInput';

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

    it('renders send button', () => {
      const { getByTestId } = renderInput();
      expect(getByTestId('send-button')).toBeTruthy();
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
});
