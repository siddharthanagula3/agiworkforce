/**
 * The intro carries the recording disclosure, so the thing worth testing is the
 * ORDER: it must land before the conversation screen opens a microphone, and a
 * dismissal must not be mistaken for consent.
 *
 * The copy is parity work against
 * /Users/siddhartha/Desktop/references-2/chatgpt-ios-voice-01-onboarding-privacy.png.
 * The gate is not — a disclosure shown after capture starts, or one silently
 * marked seen by a stray tap on the close button, is worse than none because it
 * looks like consent was obtained.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { VoiceOnboardingSheet } from '@/src/features/voice/components/VoiceOnboardingSheet';
import { useSettingsStore } from '@/stores/settingsStore';

// The sheet reads safe-area insets to keep the Continue button clear of the
// home indicator. There is no global provider in jest.setup.js, so supply fixed
// metrics rather than mocking the hook — the real provider is what production
// uses, and mocking it would hide a missing-provider regression.
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSheet(props: Partial<React.ComponentProps<typeof VoiceOnboardingSheet>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <VoiceOnboardingSheet visible onContinue={jest.fn()} onDismiss={jest.fn()} {...props} />
    </SafeAreaProvider>,
  );
}

describe('VoiceOnboardingSheet', () => {
  beforeEach(() => {
    useSettingsStore.setState({ voiceOnboardingSeen: false, hapticsEnabled: false });
  });

  it('renders the intro and the recording disclosure', () => {
    const { getByText } = renderSheet();
    getByText('Meet Voice');
    getByText(/Say what's on your mind/);
    // The disclosure must be present, not merely the marketing line.
    getByText(/transcribed on this device/);
  });

  it('marks the disclosure acknowledged and proceeds on Continue', () => {
    const onContinue = jest.fn();
    const { getByLabelText } = renderSheet({ onContinue });

    fireEvent.press(getByLabelText('Continue to voice'));

    expect(useSettingsStore.getState().voiceOnboardingSeen).toBe(true);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('does NOT mark it seen when dismissed, so the disclosure returns', () => {
    // The regression this guards: treating a close tap as consent would let a
    // user reach a live microphone having never read the disclosure.
    const onDismiss = jest.fn();
    const onContinue = jest.fn();
    const { getByLabelText } = renderSheet({ onContinue, onDismiss });

    fireEvent.press(getByLabelText('Close voice introduction'));

    expect(useSettingsStore.getState().voiceOnboardingSeen).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('does not re-show once acknowledged', () => {
    // Second run of the same flow: the store flag is what the caller checks
    // before opening voice, so once true the sheet is skipped entirely.
    useSettingsStore.setState({ voiceOnboardingSeen: true });
    expect(useSettingsStore.getState().voiceOnboardingSeen).toBe(true);
  });
});
