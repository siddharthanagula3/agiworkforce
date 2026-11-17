import React from 'react';
import { render, fireEvent, within } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import {
  VoiceOnboardingSheet,
  VOICE_DISCLOSURE,
} from '@/src/features/voice/components/VoiceOnboardingSheet';
import { useSettingsStore } from '@/stores/settingsStore';
import { sitsInColumn } from '../test-utils/sheetColumn';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSheet(props: Partial<React.ComponentProps<typeof VoiceOnboardingSheet>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <VoiceOnboardingSheet
        visible
        mode="on-device"
        onContinue={jest.fn()}
        onDismiss={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );
}

describe('VoiceOnboardingSheet', () => {
  beforeEach(() => {
    useSettingsStore.setState({ voiceOnboardingSeen: false, hapticsEnabled: false });
  });

  it('renders the intro and the on-device disclosure for turn-based voice', () => {
    const { getByText, queryByText } = renderSheet();
    getByText('Meet Voice');
    getByText("Talk with AGI the way you'd talk to anyone.");
    getByText(VOICE_DISCLOSURE['on-device']);
    expect(queryByText(VOICE_DISCLOSURE.live)).toBeNull();
  });

  it('discloses the direct provider stream and the saved transcript before live voice', () => {
    const { getByText, queryByText } = renderSheet({ mode: 'live' });
    getByText(VOICE_DISCLOSURE.live);
    expect(queryByText(VOICE_DISCLOSURE['on-device'])).toBeNull();
    expect(VOICE_DISCLOSURE.live).toContain(
      'streams directly between this device and the voice provider',
    );
    expect(VOICE_DISCLOSURE.live).toContain('The transcript is saved to the chat.');
    expect(VOICE_DISCLOSURE.live).not.toMatch(/streams to AGI Cloud|only the transcript/);
  });

  it('scrolls the intro and disclosure while Continue stays pinned below them', () => {
    const { getByTestId, getByLabelText } = renderSheet({ mode: 'live' });
    const body = getByTestId('voice-onboarding-body');
    within(body).getByText(VOICE_DISCLOSURE.live);
    within(body).getByText('Meet Voice');
    expect(within(body).queryByLabelText('Continue to voice')).toBeNull();
    getByLabelText('Continue to voice');
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

  it('stops the intro sheet at the reading column on a wide window', () => {
    const { getByText } = renderSheet();

    expect(sitsInColumn(getByText('Meet Voice'), 'reading')).toBe(true);
  });
});
