
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { VoiceOnboardingSheet } from '@/src/features/voice/components/VoiceOnboardingSheet';
import { useSettingsStore } from '@/stores/settingsStore';

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
    const onDismiss = jest.fn();
    const onContinue = jest.fn();
    const { getByLabelText } = renderSheet({ onContinue, onDismiss });

    fireEvent.press(getByLabelText('Close voice introduction'));

    expect(useSettingsStore.getState().voiceOnboardingSeen).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('does not re-show once acknowledged', () => {
    useSettingsStore.setState({ voiceOnboardingSeen: true });
    expect(useSettingsStore.getState().voiceOnboardingSeen).toBe(true);
  });
});
