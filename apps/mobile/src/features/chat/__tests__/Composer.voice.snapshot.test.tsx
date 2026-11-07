jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: jest.fn(() => null),
  subscribeCloudAccountEpochChange: jest.fn(() => () => undefined),
}));

/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    colors: tokens.colors,
    useTheme: () => ({ colors: tokens.colors, isDark: true }),
    useThemeColors: () => tokens.colors,
  };
});

jest.mock('@/components/ui/Text', () => {
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

let mockVoiceEnabled = true;

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) =>
      sel({ hapticsEnabled: false, voiceEnabled: mockVoiceEnabled, dictationOnboardingSeen: true }),
    { getState: () => ({ voiceEnabled: mockVoiceEnabled }) },
  ),
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
  startRecording: jest.fn().mockImplementation(async () => ({
    result: new Promise(() => undefined),
    stop: jest.fn(async () => undefined),
    cancel: jest.fn(async () => undefined),
  })),
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-linking', () => ({
  openSettings: jest.fn().mockResolvedValue(undefined),
}));

import {
  VoiceInputButton,
  type VoiceInputHandle,
} from '@/src/features/voice/components/VoiceInputButton';
import * as VoiceService from '@/src/features/voice/services/voice';
import { VoiceCaptureError } from '@/src/features/voice/services/voiceInput';

describe('Composer, voice scaffolding snapshots', () => {
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
          true,
        );
      });
      expect(onRecordingStart).not.toHaveBeenCalled();
      expect(queryByLabelText('Tap to stop recording')).toBeNull();
    });
  });
});

describe('VoiceInputButton recording ownership', () => {
  function recording() {
    let resolve!: (result: { text: string; confidence: number; isOnDevice: true }) => void;
    const result = new Promise<{ text: string; confidence: number; isOnDevice: true }>((accept) => {
      resolve = accept;
    });
    return {
      result,
      resolve,
      stop: jest.fn(async () => undefined),
      cancel: jest.fn(async () => undefined),
    };
  }

  it('does not report cancellation when mounted or unmounted without a capture', () => {
    const onRecordingStop = jest.fn();
    const onProcessingChange = jest.fn();
    const view = render(
      <VoiceInputButton
        onTranscription={jest.fn()}
        onRecordingStop={onRecordingStop}
        onProcessingChange={onProcessingChange}
      />,
    );
    expect(onRecordingStop).not.toHaveBeenCalled();
    expect(onProcessingChange).not.toHaveBeenCalled();
    view.unmount();
    expect(onRecordingStop).not.toHaveBeenCalled();
    expect(onProcessingChange).not.toHaveBeenCalled();
  });

  it('reads canonical Voice Input state before starting without a rerender', () => {
    const view = render(<VoiceInputButton onTranscription={jest.fn()} />);
    const callsBefore = (VoiceService.startRecording as jest.Mock).mock.calls.length;
    try {
      mockVoiceEnabled = false;
      fireEvent(view.getByTestId('voice-input-button'), 'pressIn');
      fireEvent(view.getByTestId('voice-input-button'), 'pressOut');
      expect(VoiceService.startRecording).toHaveBeenCalledTimes(callsBefore);
    } finally {
      mockVoiceEnabled = true;
      view.unmount();
    }
  });

  it('does not publish a queued result after canonical settings disable before rerender', async () => {
    const session = recording();
    (VoiceService.startRecording as jest.Mock).mockResolvedValueOnce(session);
    const onTranscription = jest.fn();
    const controlRef = React.createRef<VoiceInputHandle>();
    const view = render(
      <VoiceInputButton
        controlRef={controlRef}
        onTranscription={onTranscription}
        startSignal={0}
      />,
    );
    try {
      await act(async () =>
        view.rerender(
          <VoiceInputButton
            controlRef={controlRef}
            onTranscription={onTranscription}
            startSignal={1}
          />,
        ),
      );
      await act(async () => controlRef.current?.stop('send'));
      mockVoiceEnabled = false;
      await act(async () =>
        session.resolve({ text: 'queued words', confidence: 1, isOnDevice: true }),
      );
      expect(onTranscription).not.toHaveBeenCalled();
    } finally {
      mockVoiceEnabled = true;
      view.unmount();
    }
  });

  it('consumes a native final once through its own stop handle', async () => {
    const session = recording();
    (VoiceService.startRecording as jest.Mock).mockResolvedValueOnce(session);
    const onTranscription = jest.fn();
    const controlRef = React.createRef<VoiceInputHandle>();
    const view = render(
      <VoiceInputButton
        controlRef={controlRef}
        onTranscription={onTranscription}
        startSignal={0}
      />,
    );
    await act(async () => {
      view.rerender(
        <VoiceInputButton
          controlRef={controlRef}
          onTranscription={onTranscription}
          startSignal={1}
        />,
      );
    });
    await act(async () =>
      session.resolve({ text: 'completed words', confidence: 1, isOnDevice: true }),
    );
    expect(onTranscription).not.toHaveBeenCalled();
    await act(async () => {
      controlRef.current?.stop('insert');
      controlRef.current?.stop('send');
    });
    expect(onTranscription).toHaveBeenCalledTimes(1);
    expect(onTranscription).toHaveBeenCalledWith('completed words', 'insert');
  });

  it('drops a finishing result after destination replacement', async () => {
    const session = recording();
    (VoiceService.startRecording as jest.Mock).mockResolvedValueOnce(session);
    const onTranscription = jest.fn();
    const controlRef = React.createRef<VoiceInputHandle>();
    const view = render(
      <VoiceInputButton
        scopeKey="first"
        controlRef={controlRef}
        onTranscription={onTranscription}
        startSignal={0}
      />,
    );
    await act(async () =>
      view.rerender(
        <VoiceInputButton
          scopeKey="first"
          controlRef={controlRef}
          onTranscription={onTranscription}
          startSignal={1}
        />,
      ),
    );
    await act(async () => controlRef.current?.stop('send'));
    view.rerender(
      <VoiceInputButton
        scopeKey="second"
        controlRef={controlRef}
        onTranscription={onTranscription}
        startSignal={1}
      />,
    );
    await act(async () => session.resolve({ text: 'old draft', confidence: 1, isOnDevice: true }));
    expect(onTranscription).not.toHaveBeenCalled();
    expect(session.cancel).toHaveBeenCalled();
  });

  it('cancels an active session when Voice Input is switched off', async () => {
    const session = recording();
    (VoiceService.startRecording as jest.Mock).mockResolvedValueOnce(session);
    const onTranscription = jest.fn();
    const view = render(<VoiceInputButton onTranscription={onTranscription} startSignal={0} />);
    try {
      await act(async () =>
        view.rerender(<VoiceInputButton onTranscription={onTranscription} startSignal={1} />),
      );
      mockVoiceEnabled = false;
      await act(async () =>
        view.rerender(<VoiceInputButton onTranscription={onTranscription} startSignal={1} />),
      );
      await act(async () =>
        session.resolve({ text: 'disabled words', confidence: 1, isOnDevice: true }),
      );
      expect(session.cancel).toHaveBeenCalled();
      expect(onTranscription).not.toHaveBeenCalled();
      expect(view.queryByTestId('voice-input-button')).toBeNull();
    } finally {
      mockVoiceEnabled = true;
    }
  });

  it('finishes push-to-talk released while permission is pending', async () => {
    jest.useFakeTimers();
    let finishStart!: (session: ReturnType<typeof recording>) => void;
    (VoiceService.startRecording as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStart = resolve;
        }),
    );
    const onTranscription = jest.fn();
    const view = render(<VoiceInputButton onTranscription={onTranscription} />);
    try {
      act(() => {
        fireEvent(view.getByTestId('voice-input-button'), 'pressIn');
        jest.advanceTimersByTime(300);
      });
      fireEvent(view.getByTestId('voice-input-button'), 'pressOut');
      const session = recording();
      await act(async () => finishStart(session));
      expect(session.stop).toHaveBeenCalledTimes(1);
      await act(async () =>
        session.resolve({ text: 'held words', confidence: 1, isOnDevice: true }),
      );
      expect(onTranscription).toHaveBeenCalledWith('held words', 'insert');
    } finally {
      view.unmount();
      jest.useRealTimers();
    }
  });

  it('aborts a tap start while permission is pending on unmount', async () => {
    let finishStart!: (session: ReturnType<typeof recording>) => void;
    (VoiceService.startRecording as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStart = resolve;
        }),
    );
    const onRecordingStart = jest.fn();
    const onTranscription = jest.fn();
    const view = render(
      <VoiceInputButton
        onRecordingStart={onRecordingStart}
        onTranscription={onTranscription}
        startSignal={0}
      />,
    );
    await act(async () =>
      view.rerender(
        <VoiceInputButton
          onRecordingStart={onRecordingStart}
          onTranscription={onTranscription}
          startSignal={1}
        />,
      ),
    );
    const calls = (VoiceService.startRecording as jest.Mock).mock.calls;
    const signal = calls[calls.length - 1]?.[1] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    const session = recording();
    await act(async () => finishStart(session));
    expect(session.cancel).toHaveBeenCalled();
    expect(onRecordingStart).not.toHaveBeenCalled();
    expect(onTranscription).not.toHaveBeenCalled();
  });
});
