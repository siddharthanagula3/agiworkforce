import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-speech-recognition', () => {
  const listenersByEvent: Record<string, Array<(...args: unknown[]) => void>> = {};
  const getListeners = (name: string) => (listenersByEvent[name] ||= []);
  return {
    __esModule: true,
    ExpoSpeechRecognitionModule: {
      start: jest.fn(),
      stop: jest.fn(() => {
        for (const fn of getListeners('end')) fn(null);
      }),
      abort: jest.fn(() => {
        for (const fn of getListeners('end')) fn(null);
      }),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      supportsOnDeviceRecognition: jest.fn().mockReturnValue(true),
      isRecognitionAvailable: jest.fn().mockReturnValue(true),
      addListener: jest.fn((name: string, fn: (...args: unknown[]) => void) => {
        getListeners(name).push(fn);
        return {
          remove: () => {
            listenersByEvent[name] = getListeners(name).filter((cb) => cb !== fn);
          },
        };
      }),
    },
  };
});

jest.mock('expo-localization', () => ({
  __esModule: true,
  getLocales: jest.fn().mockReturnValue([{ languageTag: 'en-US' }]),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return { Mic: icon, Loader: icon, X: icon, AudioLines: icon, Info: icon };
});

import { Platform } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { VoiceInputButton } from '@/src/features/voice/components/VoiceInputButton';
import { VOICE_DISCLOSURE } from '@/src/features/voice/components/VoiceOnboardingSheet';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import * as VoiceService from '@/src/features/voice/services/voice';
import { useSettingsStore } from '@/stores/settingsStore';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const originalOS = Platform.OS;
const originalVersion = Platform.Version;

function runOn(os: 'ios' | 'android', version: number | string) {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
  Object.defineProperty(Platform, 'Version', { get: () => version, configurable: true });
}

function renderButton(props: Partial<React.ComponentProps<typeof VoiceInputButton>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <VoiceInputButton onTranscription={jest.fn()} {...props} />
    </SafeAreaProvider>,
  );
}

async function startOutcome(): Promise<unknown> {
  try {
    const session = await VoiceInput.startCaptureSession(undefined, undefined, { lang: 'en' });
    session.result.catch(() => undefined);
    await session.cancel();
    return null;
  } catch (error) {
    return error;
  }
}

describe('dictation microphone below Android 13', () => {
  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    useSettingsStore.setState({
      dictationOnboardingSeen: false,
      voiceEnabled: true,
      hapticsEnabled: false,
    });
  });

  afterEach(async () => {
    await VoiceInput.cancelCapture().catch(() => undefined);
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
    Object.defineProperty(Platform, 'Version', { get: () => originalVersion, configurable: true });
  });

  it.each([30, 32])('hides the microphone on Android API %i', (api) => {
    runOn('android', api);

    const { queryByTestId } = renderButton();

    expect(queryByTestId('voice-input-button')).toBeNull();
  });

  it.each([33, 34])('shows the microphone on Android API %i', (api) => {
    runOn('android', api);

    const { getByTestId } = renderButton();

    expect(getByTestId('voice-input-button')).toBeTruthy();
  });

  it('shows the microphone on iOS, whatever the version string', () => {
    runOn('ios', '17.5');

    const { getByTestId } = renderButton();

    expect(getByTestId('voice-input-button')).toBeTruthy();
  });

  it('never shows the on-device onboarding sheet on Android API 32', async () => {
    runOn('android', 32);

    const { queryByTestId, queryByText } = renderButton();

    expect(queryByTestId('voice-input-button')).toBeNull();
    expect(queryByText(VOICE_DISCLOSURE['on-device'])).toBeNull();
  });

  it('shows the on-device onboarding sheet on a first tap on Android API 33', async () => {
    runOn('android', 33);

    const { getByTestId, findByText } = renderButton();
    await act(async () => {
      fireEvent(getByTestId('voice-input-button'), 'pressIn');
      fireEvent(getByTestId('voice-input-button'), 'pressOut');
    });

    expect(await findByText(VOICE_DISCLOSURE['on-device'])).toBeTruthy();
  });

  it('does not start dictation on Android API 32 when a start is requested from outside', async () => {
    runOn('android', 32);
    useSettingsStore.setState({ dictationOnboardingSeen: true });
    const startRecording = jest.spyOn(VoiceService, 'startRecording');
    const view = renderButton({ startSignal: 0 });

    view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <VoiceInputButton onTranscription={jest.fn()} startSignal={1} />
      </SafeAreaProvider>,
    );

    expect(startRecording).not.toHaveBeenCalled();
  });

  it.each([26, 30, 32, 33, 34, 36])(
    'hides the microphone on API %i exactly when the voice service refuses to start there',
    async (api) => {
      runOn('android', api);

      const refused = (await startOutcome()) instanceof VoiceInput.VoiceCaptureError;

      expect(VoiceInput.onDeviceRecognizerGuaranteed()).toBe(!refused);
      expect(renderButton().queryByTestId('voice-input-button') === null).toBe(refused);
    },
  );
});
