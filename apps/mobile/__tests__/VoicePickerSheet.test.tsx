/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockSheetProps: { current: Record<string, unknown> | null } = { current: null };
const mockSheetCalls = { snapToIndex: jest.fn(), close: jest.fn() };

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const BottomSheet = React.forwardRef(
    (
      props: { children: React.ReactNode; onChange?: (index: number) => void },
      ref: React.Ref<unknown>,
    ) => {
      mockSheetProps.current = props as Record<string, unknown>;
      React.useImperativeHandle(ref, () => ({
        snapToIndex: (index: number) => mockSheetCalls.snapToIndex(index),
        close: () => {
          mockSheetCalls.close();
          props.onChange?.(-1);
        },
      }));
      return <View testID="bottom-sheet">{props.children}</View>;
    },
  );
  BottomSheet.displayName = 'BottomSheet';
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetBackdrop: () => null,
    BottomSheetView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import {
  VoicePickerSheet,
  voicePositionLabel,
} from '@/src/features/voice/components/VoicePickerSheet';
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
    jest.clearAllMocks();
    mockSheetProps.current = null;
    useSettingsStore.setState({ selectedPresetId: null, hapticsEnabled: false });
  });

  it('is a bottom sheet that sizes to its content and drags down to dismiss', () => {
    renderSheet();

    expect(mockSheetProps.current).toMatchObject({
      enablePanDownToClose: true,
      enableDynamicSizing: true,
      index: -1,
    });
    expect(mockSheetCalls.snapToIndex).toHaveBeenCalledWith(0);
  });

  it('draws a grabber from a theme colour and reports a drag-down as a dismissal', () => {
    const onDismiss = jest.fn();
    renderSheet({ onDismiss });
    const props = mockSheetProps.current as {
      handleIndicatorStyle: { backgroundColor: string; width: number; height: number };
      onChange: (index: number) => void;
    };

    expect(props.handleIndicatorStyle.backgroundColor).toBeTruthy();
    expect(props.handleIndicatorStyle.width).toBe(36);
    props.onChange(0);
    expect(onDismiss).not.toHaveBeenCalled();
    props.onChange(-1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('closes the sheet when it is hidden by the caller', () => {
    const view = renderSheet({ visible: true });
    view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <VoicePickerSheet visible={false} onStart={jest.fn()} onDismiss={jest.fn()} />
      </SafeAreaProvider>,
    );

    expect(mockSheetCalls.close).toHaveBeenCalled();
  });

  it('does not mount the sheet until the picker is first opened', () => {
    renderSheet({ visible: false });

    expect(mockSheetProps.current).toBeNull();
  });

  it('announces which voice is showing', () => {
    expect(voicePositionLabel(0, 9)).toBe('Voice 1 of 9');
    const { getByLabelText } = renderSheet();

    expect(getByLabelText('Voices').props.accessibilityValue).toEqual({
      text: voicePositionLabel(0, VOICE_PRESETS.length),
    });
  });

  it('moves the announced position when the list pages to the next voice', () => {
    const { getByLabelText } = renderSheet();

    fireEvent(getByLabelText('Voices'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 750, y: 0 } },
    });

    expect(getByLabelText('Voices').props.accessibilityValue).toEqual({
      text: voicePositionLabel(1, VOICE_PRESETS.length),
    });
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
