/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Snapshot tests for the voice composer: RecordingOverlay in idle/recording states,
 * and VoiceInputButton in idle/recording states.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/src/ui/theme', () => ({
  colors: {
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    teal: '#2dd4bf',
    background: '#0e0e0e',
    surfaceElevated: '#1a1a1a',
    surfaceOverlay: '#0e0e0e',
    agentError: '#ef4444',
    white: '#ffffff',
    terraCotta: '#c0513a',
  },
  useTheme: () => ({
    colors: {
      textPrimary: '#fff',
      textSecondary: '#aaa',
      textMuted: '#777',
      border: '#333',
      teal: '#2dd4bf',
      background: '#0e0e0e',
      surfaceElevated: '#1a1a1a',
      surfaceOverlay: '#0e0e0e',
      agentError: '#ef4444',
      white: '#ffffff',
    },
    isDark: true,
  }),
  useThemeColors: () => ({
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    teal: '#2dd4bf',
    background: '#0e0e0e',
    surfaceElevated: '#1a1a1a',
    surfaceOverlay: '#0e0e0e',
    agentError: '#ef4444',
    white: '#ffffff',
  }),
}));

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return {
    Mic: factory('mic'),
    MicOff: factory('mic-off'),
    Loader: factory('loader'),
    X: factory('x'),
    Check: factory('check'),
    Plus: factory('plus'),
    Link: factory('link'),
    Square: factory('square'),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
  NotificationFeedbackType: { Success: 0, Warning: 1, Error: 2 },
}));

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (sel: (s: { hapticsEnabled: boolean }) => unknown) =>
    sel({ hapticsEnabled: false }),
}));

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const mockReact = require('react');

  const mockAnimatedView = jest.fn().mockImplementation((props) => {
    const { children, ...rest } = props || {};
    return mockReact.createElement(RN.View, rest, children);
  });
  const mockAnimatedPressable = jest.fn().mockImplementation((props) => {
    const { children, ...rest } = props || {};
    return mockReact.createElement(RN.Pressable, rest, children);
  });

  return {
    __esModule: true,
    default: {
      View: mockAnimatedView,
      Pressable: mockAnimatedPressable,
      createAnimatedComponent: (Comp: unknown) => Comp,
    },
    View: mockAnimatedView,
    createAnimatedComponent: (Comp: unknown) => Comp,
    useSharedValue: jest.fn((initial) => ({ value: initial })),
    useAnimatedStyle: jest.fn((fn) => fn()),
    useDerivedValue: jest.fn((fn) => ({ value: fn() })),
    useReducedMotion: jest.fn(() => false),
    withRepeat: jest.fn((v) => v),
    withTiming: jest.fn((v) => v),
    withSpring: jest.fn((v) => v),
    withSequence: jest.fn((v) => v),
    withDelay: jest.fn((_delay, v) => v),
    cancelAnimation: jest.fn(),
    FadeIn: { duration: jest.fn(() => ({})) },
    FadeOut: { duration: jest.fn(() => ({})) },
    runOnJS: jest.fn((fn) => fn),
    runOnUI: jest.fn((fn) => fn),
  };
});

jest.mock('@/src/features/voice/services/voice', () => ({
  isRecording: jest.fn().mockReturnValue(false),
  cancelRecording: jest.fn().mockResolvedValue(undefined),
  startRecording: jest.fn().mockResolvedValue(undefined),
  stopRecording: jest.fn().mockResolvedValue(''),
  transcribe: jest.fn().mockResolvedValue({ text: '' }),
}));

jest.mock('@/src/features/voice/components/Waveform', () => {
  const RN = require('react-native');
  const mockReact = require('react');
  return {
    Waveform: jest
      .fn()
      .mockImplementation((props) =>
        mockReact.createElement(RN.View, { testID: 'waveform', ...props }),
      ),
  };
});

jest.mock('@/src/features/voice/services/voiceInput', () => ({
  VoiceCaptureError: class VoiceCaptureError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock('expo-linking', () => ({
  openSettings: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { RecordingOverlay } from '@/src/features/voice/components/RecordingOverlay';
import { VoiceInputButton } from '@/src/features/voice/components/VoiceInputButton';
import * as VoiceService from '@/src/features/voice/services/voice';
import { VoiceCaptureError } from '@/src/features/voice/services/voiceInput';

// ── Snapshot tests ────────────────────────────────────────────────────────────

describe('Composer — voice scaffolding snapshots', () => {
  describe('RecordingOverlay', () => {
    it('renders nothing in idle state (visible=false)', () => {
      const { toJSON } = render(
        <RecordingOverlay
          visible={false}
          audioLevel={0}
          durationMs={0}
          onCancel={jest.fn()}
          onSend={jest.fn()}
        />,
      );
      expect(toJSON()).toBeNull();
    });

    it('locks recording overlay tree when visible=true at 3.2s', () => {
      const { toJSON } = render(
        <RecordingOverlay
          visible={true}
          audioLevel={0.6}
          durationMs={3200}
          onCancel={jest.fn()}
          onSend={jest.fn()}
        />,
      );
      expect(toJSON()).toMatchSnapshot();
    });
  });

  describe('VoiceInputButton', () => {
    it('locks idle mic button tree', () => {
      const { toJSON } = render(
        <VoiceInputButton
          onTranscription={jest.fn()}
          onRecordingStart={jest.fn()}
          onRecordingStop={jest.fn()}
          disabled={false}
        />,
      );
      expect(toJSON()).toMatchSnapshot();
    });

    it('locks disabled mic button tree (during streaming)', () => {
      const { toJSON } = render(<VoiceInputButton onTranscription={jest.fn()} disabled={true} />);
      expect(toJSON()).toMatchSnapshot();
    });

    it('does not enter recording state when voice permission is denied', async () => {
      const onError = jest.fn();
      const onRecordingStart = jest.fn();
      const onRecordingStop = jest.fn();
      (VoiceService.startRecording as jest.Mock).mockRejectedValueOnce(
        new VoiceCaptureError('mic-permission-denied', 'Microphone permission denied'),
      );

      const { getByLabelText, queryByLabelText } = render(
        <VoiceInputButton
          onTranscription={jest.fn()}
          onRecordingStart={onRecordingStart}
          onRecordingStop={onRecordingStop}
          onError={onError}
          disabled={false}
        />,
      );

      const micButton = getByLabelText('Tap to record, hold for push-to-talk');
      fireEvent(micButton, 'pressIn');
      fireEvent(micButton, 'pressOut');

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          'Voice input needs microphone and speech access. You can keep typing instead.',
        );
      });
      expect(onRecordingStart).not.toHaveBeenCalled();
      expect(VoiceService.stopRecording).not.toHaveBeenCalled();
      expect(queryByLabelText('Tap to stop recording')).toBeNull();
    });
  });
});
