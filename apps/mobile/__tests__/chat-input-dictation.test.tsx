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

let capturedRecordingStart: (() => void) | undefined;

jest.mock('../src/features/voice/components/VoiceInputButton', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    VoiceInputButton: (props: { onRecordingStart?: () => void }) => {
      capturedRecordingStart = props.onRecordingStart;
      return <Pressable testID="voice-input-button" accessibilityLabel="Voice input" />;
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
    selector({ selectedModel: 'fixture-cloud-model', thinkingEnabledPerModel: {} }),
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ appMode: 'local' }),
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
    background: '#0f0f0f',
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

const VoiceService = require('../src/features/voice/services/voice') as {
  isRecording: jest.Mock;
  cancelRecording: jest.Mock;
  stopRecording: jest.Mock;
  transcribe: jest.Mock;
};

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
  act(() => {
    capturedRecordingStart!();
  });
}

describe('ChatInput dictation controls (PAR-M22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedRecordingStart = undefined;
    lastWaveformProps = undefined;
    VoiceService.isRecording.mockReturnValue(true);
    VoiceService.stopRecording.mockResolvedValue('mock-uri');
    VoiceService.transcribe.mockResolvedValue({ text: '' });
    VoiceService.cancelRecording.mockResolvedValue(undefined);
  });

  describe('the four-control row', () => {
    it('renders cancel, waveform, stop and send while recording', () => {
      const { getByTestId, queryByTestId } = renderInput();

      expect(queryByTestId('chat.composer.dictation-send')).toBeNull();

      startRecording();

      expect(getByTestId('chat.composer.dictation-cancel')).toBeTruthy();
      expect(getByTestId('chat.composer.recording')).toBeTruthy();
      expect(getByTestId('dictation-waveform')).toBeTruthy();
      expect(getByTestId('chat.composer.dictation-stop')).toBeTruthy();
      expect(getByTestId('chat.composer.dictation-send')).toBeTruthy();
    });

    it('renders no elapsed timer', () => {
      const { queryByText } = renderInput();
      startRecording();

      expect(queryByText(/^\d\d:\d\d$/)).toBeNull();
    });
  });

  describe('one-tap send', () => {
    it('stops, transcribes and sends without a trip through the composer', async () => {
      VoiceService.transcribe.mockResolvedValue({ text: 'book the meeting room' });
      const onSend = jest.fn();
      const { getByTestId, getByLabelText } = renderInput({ onSend });

      startRecording();

      await act(async () => {
        fireEvent.press(getByTestId('chat.composer.dictation-send'));
      });

      expect(VoiceService.stopRecording).toHaveBeenCalledTimes(1);
      expect(VoiceService.transcribe).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(onSend).toHaveBeenCalledWith('book the meeting room', undefined);
      });
      await waitFor(() => {
        expect(getByLabelText('Message input').props.value).toBe('');
      });
    });

    it('appends the dictation to text already typed and sends the whole message', async () => {
      VoiceService.transcribe.mockResolvedValue({ text: 'tomorrow at nine' });
      const onSend = jest.fn();
      const { getByTestId, getByLabelText } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), 'Remind me');
      startRecording();

      await act(async () => {
        fireEvent.press(getByTestId('chat.composer.dictation-send'));
      });

      await waitFor(() => {
        expect(onSend).toHaveBeenCalledWith('Remind me tomorrow at nine', undefined);
      });
    });

    it('keeps the dictated words in the composer when the send is rejected', async () => {
      VoiceService.transcribe.mockResolvedValue({ text: 'send the invoice' });
      const onSend = jest.fn(() => Promise.resolve(false));
      const { getByTestId, getByLabelText } = renderInput({ onSend });

      startRecording();

      await act(async () => {
        fireEvent.press(getByTestId('chat.composer.dictation-send'));
      });

      await waitFor(() => {
        expect(onSend).toHaveBeenCalledWith('send the invoice', undefined);
      });
      expect(getByLabelText('Message input').props.value).toBe('send the invoice');
    });

    it('leaves the stop square as a review path that does not send', async () => {
      VoiceService.transcribe.mockResolvedValue({ text: 'draft a reply' });
      const onSend = jest.fn();
      const { getByTestId, getByLabelText } = renderInput({ onSend });

      startRecording();

      await act(async () => {
        fireEvent.press(getByTestId('chat.composer.dictation-stop'));
      });

      await waitFor(() => {
        expect(getByLabelText('Message input').props.value).toBe('draft a reply');
      });
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe('cancel during transcription', () => {
    function renderTranscribing(overrides: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
      let releaseStop!: (uri: string) => void;
      VoiceService.stopRecording.mockImplementation(
        () => new Promise<string>((resolve) => (releaseStop = resolve)),
      );
      const utils = renderInput(overrides);
      startRecording();
      act(() => {
        fireEvent.press(utils.getByTestId('chat.composer.dictation-send'));
      });
      return { ...utils, releaseStop: () => releaseStop('mock-uri') };
    }

    it('keeps cancel enabled and dims only the two ending controls', () => {
      const { getByTestId } = renderTranscribing();

      expect(getByTestId('chat.composer.transcribing')).toBeTruthy();

      expect(
        getByTestId('chat.composer.dictation-cancel').props.accessibilityState?.disabled,
      ).toBeFalsy();
      expect(getByTestId('chat.composer.dictation-stop').props.accessibilityState?.disabled).toBe(
        true,
      );
      expect(getByTestId('chat.composer.dictation-send').props.accessibilityState?.disabled).toBe(
        true,
      );

      const stopCallsBefore = VoiceService.stopRecording.mock.calls.length;
      act(() => {
        fireEvent.press(getByTestId('chat.composer.dictation-stop'));
      });
      expect(VoiceService.stopRecording).toHaveBeenCalledTimes(stopCallsBefore);

      act(() => {
        fireEvent.press(getByTestId('chat.composer.dictation-cancel'));
      });
      expect(VoiceService.cancelRecording).toHaveBeenCalledTimes(1);
    });

    it('freezes the waveform while the transcript resolves', () => {
      const { getByTestId } = renderInput();
      startRecording();
      expect(lastWaveformProps?.active).toBe(true);

      VoiceService.stopRecording.mockImplementation(() => new Promise<string>(() => {}));
      act(() => {
        fireEvent.press(getByTestId('chat.composer.dictation-send'));
      });

      expect(getByTestId('chat.composer.transcribing')).toBeTruthy();
      expect(lastWaveformProps?.active).toBe(false);
    });

    it('aborts the capture session and drops a late transcript', async () => {
      VoiceService.transcribe.mockResolvedValue({ text: 'this should never land' });
      const onSend = jest.fn();
      const { getByTestId, getByLabelText, releaseStop } = renderTranscribing({ onSend });

      await act(async () => {
        fireEvent.press(getByTestId('chat.composer.dictation-cancel'));
      });

      expect(VoiceService.cancelRecording).toHaveBeenCalledTimes(1);

      await act(async () => {
        releaseStop();
      });

      expect(getByLabelText('Message input').props.value).toBe('');
      expect(onSend).not.toHaveBeenCalled();
      expect(getByTestId('chat.composer.send')).toBeTruthy();
    });
  });
});
