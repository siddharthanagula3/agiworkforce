
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { VoicePickerSheet } from '@/src/features/voice/components/VoicePickerSheet';
import { useSettingsStore } from '@/stores/settingsStore';
import { VOICE_PRESETS } from '@/src/features/voice/voicePresets';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSheet(props: Partial<React.ComponentProps<typeof VoicePickerSheet>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <VoicePickerSheet visible onStart={jest.fn()} onDismiss={jest.fn()} {...props} />
    </SafeAreaProvider>,
  );
}

describe('VoicePickerSheet', () => {
  beforeEach(() => {
    useSettingsStore.setState({ selectedPresetId: null, hapticsEnabled: false });
  });

  it('shows the picker title and a Start Voice commit action', () => {
    const { getByText } = renderSheet();
    getByText('Choose your voice');
    getByText('Start Voice');
  });

  it('renders each preset with its name and description', () => {
    const { getByText } = renderSheet();
    for (const preset of VOICE_PRESETS) {
      getByText(preset.name);
      getByText(preset.description);
    }
  });

  it('commits the highlighted voice and starts on Start Voice', () => {
    const onStart = jest.fn();
    const { getByLabelText } = renderSheet({ onStart });
    const first = VOICE_PRESETS[0]!;

    fireEvent.press(getByLabelText(`Start voice with ${first.name}`));

    expect(useSettingsStore.getState().selectedPresetId).toBe(first.id);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('does NOT change the saved voice when dismissed', () => {
    const existing = VOICE_PRESETS[1]!;
    useSettingsStore.setState({ selectedPresetId: existing.id });
    const onStart = jest.fn();
    const onDismiss = jest.fn();
    const { getByLabelText } = renderSheet({ onStart, onDismiss });

    fireEvent.press(getByLabelText('Close voice picker'));

    expect(useSettingsStore.getState().selectedPresetId).toBe(existing.id);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });
});
