/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { BackHandler, FlatList, StyleSheet, View } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';

let mockWindowWidth = 750;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWindowWidth, height: 1334, scale: 2, fontScale: 1 }),
}));

const mockSheetProps: { current: Record<string, unknown> | null } = { current: null };
const mockSheetCalls = { snapToIndex: jest.fn(), close: jest.fn() };
const mockSheetState = { index: -1 };

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const BottomSheet = React.forwardRef(
    (
      props: {
        children: React.ReactNode;
        onChange?: (index: number) => void;
        onClose?: () => void;
      },
      ref: React.Ref<unknown>,
    ) => {
      mockSheetProps.current = props as Record<string, unknown>;
      React.useImperativeHandle(ref, () => ({
        snapToIndex: (index: number) => mockSheetCalls.snapToIndex(index),
        close: () => {
          mockSheetCalls.close();
          if (mockSheetState.index !== -1) props.onChange?.(-1);
          mockSheetState.index = -1;
          props.onClose?.();
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
const mockGetVoicesForLanguage = jest.fn();
jest.mock('@/src/features/voice/services/tts', () => ({
  ...jest.requireActual('@/src/features/voice/services/tts'),
  getVoicesForLanguage: (...args: unknown[]) => mockGetVoicesForLanguage(...args),
}));
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

function layoutPager(view: ReturnType<typeof render>, width: number) {
  fireEvent(view.getByTestId('voice-picker-pager'), 'layout', {
    nativeEvent: { layout: { width, height: 300, x: 0, y: 0 } },
  });
}

function renderSheet(props: Partial<React.ComponentProps<typeof VoicePickerSheet>> = {}) {
  const view = render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <VoicePickerSheet visible onStart={jest.fn()} onDismiss={jest.fn()} {...props} />
    </SafeAreaProvider>,
  );
  if (props.visible !== false) layoutPager(view, 750);
  return view;
}

describe('VoicePickerSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSheetProps.current = null;
    mockSheetState.index = 0;
    mockWindowWidth = 750;
    mockGetVoicesForLanguage.mockReset().mockResolvedValue([]);
    useSettingsStore.setState({
      selectedPresetId: null,
      selectedVoiceId: null,
      speechRate: 1,
      speechPitch: 1,
      hapticsEnabled: false,
    });
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
      onChange?: (index: number) => void;
      onClose: () => void;
    };

    expect(props.handleIndicatorStyle.backgroundColor).toBeTruthy();
    expect(props.handleIndicatorStyle.width).toBe(36);
    props.onChange?.(0);
    expect(onDismiss).not.toHaveBeenCalled();
    props.onChange?.(-1);
    props.onClose();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('tells the caller it closed when Back arrives before the opening animation settles', () => {
    mockSheetState.index = -1;
    const remove = jest.fn();
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove }));
    const onDismiss = jest.fn();
    renderSheet({ onDismiss });
    const handler = add.mock.calls.at(-1)?.[1] as () => boolean;

    expect(handler()).toBe(true);
    expect(mockSheetCalls.close).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    add.mockRestore();
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

  it('applies the preset speed, pitch and installed voice that the Voice settings apply', async () => {
    const preset = VOICE_PRESETS[1]!;
    const matchingVoice = {
      identifier: 'com.apple.voice.match',
      name: preset.voiceKeywords[0]!,
      quality: 'Default',
      language: 'en-US',
    };
    mockGetVoicesForLanguage.mockResolvedValue([matchingVoice]);
    const onStart = jest.fn();
    const { getByLabelText } = renderSheet({ onStart });
    await waitFor(() => expect(mockGetVoicesForLanguage).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent(getByLabelText('Voices'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 750, y: 0 } },
    });
    fireEvent.press(getByLabelText(`Start voice with ${preset.name}`));

    const settings = useSettingsStore.getState();
    expect(settings.selectedPresetId).toBe(preset.id);
    expect(settings.speechRate).toBe(preset.rate);
    expect(settings.speechPitch).toBe(preset.pitch);
    expect(settings.selectedVoiceId).toBe(matchingVoice.identifier);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('keeps the chosen system voice when the installed voices could not be read', async () => {
    mockGetVoicesForLanguage.mockRejectedValue(new Error('no voices'));
    useSettingsStore.setState({ selectedVoiceId: 'com.apple.voice.kept' });
    const first = VOICE_PRESETS[0]!;
    const { getByLabelText } = renderSheet();
    await waitFor(() => expect(mockGetVoicesForLanguage).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(getByLabelText(`Start voice with ${first.name}`));

    const settings = useSettingsStore.getState();
    expect(settings.selectedPresetId).toBe(first.id);
    expect(settings.speechRate).toBe(first.rate);
    expect(settings.speechPitch).toBe(first.pitch);
    expect(settings.selectedVoiceId).toBe('com.apple.voice.kept');
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

  it('closes on the hardware back button only while it is open', () => {
    const remove = jest.fn();
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove }));
    const onDismiss = jest.fn();
    const view = renderSheet({ visible: false, onDismiss });
    expect(add).not.toHaveBeenCalled();

    view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <VoicePickerSheet visible onStart={jest.fn()} onDismiss={onDismiss} />
      </SafeAreaProvider>,
    );
    const handler = add.mock.calls.at(-1)?.[1] as () => boolean;

    expect(add).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    expect(handler()).toBe(true);
    expect(mockSheetCalls.close).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);

    view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <VoicePickerSheet visible={false} onStart={jest.fn()} onDismiss={onDismiss} />
      </SafeAreaProvider>,
    );
    expect(remove).toHaveBeenCalledTimes(1);
    add.mockRestore();
  });
  describe('on a window wider than the pane beside the permanent sidebar', () => {
    const PANE = 752;
    const WINDOW = 1032;

    beforeEach(() => {
      mockWindowWidth = WINDOW;
    });

    it('draws the pages on the first frame at the width the sheet is inset to, then follows the measured list', () => {
      const view = render(
        <SafeAreaProvider initialMetrics={METRICS}>
          <VoicePickerSheet visible onStart={jest.fn()} onDismiss={jest.fn()} />
        </SafeAreaProvider>,
      );
      const seeded = view.UNSAFE_getByType(FlatList).props.getItemLayout as (
        data: unknown,
        index: number,
      ) => { length: number };
      expect(seeded(null, 1).length).toBe(720);

      layoutPager(view, PANE);
      const measured = view.UNSAFE_getByType(FlatList).props.getItemLayout as (
        data: unknown,
        index: number,
      ) => { length: number };
      expect(measured(null, 1).length).toBe(PANE);
    });

    it('draws the pages at the window width on a phone before the list is measured', () => {
      mockWindowWidth = 402;
      const view = render(
        <SafeAreaProvider initialMetrics={METRICS}>
          <VoicePickerSheet visible onStart={jest.fn()} onDismiss={jest.fn()} />
        </SafeAreaProvider>,
      );

      const getItemLayout = view.UNSAFE_getByType(FlatList).props.getItemLayout as (
        data: unknown,
        index: number,
      ) => { length: number; offset: number };
      expect(getItemLayout(null, 1)).toMatchObject({ length: 402, offset: 402 });
    });

    it('sizes every page and its offset to the measured list, not to the window', () => {
      const view = renderSheet();
      layoutPager(view, PANE);

      const list = view.UNSAFE_getByType(FlatList);
      const getItemLayout = list.props.getItemLayout as (
        data: unknown,
        index: number,
      ) => { length: number; offset: number; index: number };
      expect(getItemLayout(null, 1)).toEqual({ length: PANE, offset: PANE, index: 1 });

      const pageWidths = view
        .UNSAFE_getAllByType(View)
        .map((node) => StyleSheet.flatten(node.props.style)?.width)
        .filter((width) => width === PANE || width === WINDOW);
      expect(pageWidths.length).toBeGreaterThan(0);
      expect(pageWidths.every((width) => width === PANE)).toBe(true);
    });

    it('turns one swipe of the list into the next voice', () => {
      const view = renderSheet();
      layoutPager(view, PANE);

      fireEvent(view.getByLabelText('Voices'), 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: PANE, y: 0 } },
      });

      expect(view.getByLabelText('Voices').props.accessibilityValue).toEqual({
        text: voicePositionLabel(1, VOICE_PRESETS.length),
      });
    });

    it('insets the sheet to the reading column of the pane', () => {
      renderSheet();

      expect(mockSheetProps.current).toMatchObject({
        style: { marginHorizontal: (PANE - 720) / 2 },
      });
    });

    it('leaves the sheet edge to edge on a phone window', () => {
      mockWindowWidth = 402;
      renderSheet();

      expect(mockSheetProps.current).toMatchObject({ style: { marginHorizontal: 0 } });
    });
  });
});
