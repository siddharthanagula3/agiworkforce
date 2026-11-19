/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockSetCategoryIOS = jest.fn();
const mockGetCategory = jest.fn(() => ({
  category: 'playAndRecord',
  categoryOptions: ['allowBluetooth', 'defaultToSpeaker'],
  mode: 'measurement',
}));

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    setCategoryIOS: (...args: unknown[]) => mockSetCategoryIOS(...args),
    getAudioSessionCategoryAndOptionsIOS: () => mockGetCategory(),
  },
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

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({
    inputSurface: '#222',
    surfaceElevated: '#191919',
    textPrimary: '#fff',
    textSecondary: '#ccc',
    textMuted: '#888',
    scrim: 'rgba(0,0,0,0.6)',
  }),
}));

import { Platform } from 'react-native';
import { AudioRoutePicker } from '@/src/features/voice/components/AudioRoutePicker';
import {
  AUDIO_ROUTES,
  audioRouteFromCategoryOptions,
  audioRouteNotAppliedMessage,
  audioSessionCategoryFor,
  applyAudioRoute,
  readActiveAudioRoute,
} from '@/src/features/voice/services/audioRoute';
import { useSettingsStore } from '@/stores/settingsStore';

describe('audio route contract', () => {
  it('gives each route a category that actually changes the routing', () => {
    expect(audioSessionCategoryFor('auto').categoryOptions).toEqual([
      'allowBluetooth',
      'defaultToSpeaker',
    ]);
    expect(audioSessionCategoryFor('speaker').categoryOptions).toEqual(['defaultToSpeaker']);
    expect(audioSessionCategoryFor('bluetooth').categoryOptions).toEqual([
      'allowBluetooth',
      'allowBluetoothA2DP',
    ]);
    expect(audioSessionCategoryFor('headset').categoryOptions).toEqual([]);
    for (const route of AUDIO_ROUTES) {
      expect(audioSessionCategoryFor(route).category).toBe('playAndRecord');
    }
  });

  it('reads a route back out of whatever options the session is carrying', () => {
    expect(audioRouteFromCategoryOptions(['allowBluetooth', 'defaultToSpeaker'])).toBe('auto');
    expect(audioRouteFromCategoryOptions(['defaultToSpeaker'])).toBe('speaker');
    expect(audioRouteFromCategoryOptions(['allowBluetoothA2DP'])).toBe('bluetooth');
    expect(audioRouteFromCategoryOptions([])).toBe('headset');
    expect(readActiveAudioRoute()).toBe('auto');
  });

  it('does not pretend to switch a route on a platform that cannot', () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    mockSetCategoryIOS.mockClear();

    expect(applyAudioRoute('speaker')).toBe(false);
    expect(mockSetCategoryIOS).not.toHaveBeenCalled();
    expect(readActiveAudioRoute()).toBeNull();

    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });
});

describe('AudioRoutePicker', () => {
  beforeEach(() => {
    mockSetCategoryIOS.mockClear();
    useSettingsStore.setState({ audioRoute: 'auto' });
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  it('names the live route on the trigger', () => {
    const { getByLabelText } = render(<AudioRoutePicker />);
    expect(getByLabelText('Audio route, Automatic')).toBeTruthy();
  });

  it('switches the route mid-session, storing it and applying it to the audio session', () => {
    const { getByTestId } = render(<AudioRoutePicker />);

    fireEvent.press(getByTestId('audio-route-trigger'));
    fireEvent.press(getByTestId('audio-route-bluetooth'));

    expect(useSettingsStore.getState().audioRoute).toBe('bluetooth');
    expect(mockSetCategoryIOS).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'playAndRecord',
        categoryOptions: ['allowBluetooth', 'allowBluetoothA2DP'],
      }),
    );
  });

  it('does not present a route as applied when the audio session rejects it', () => {
    mockSetCategoryIOS.mockImplementationOnce(() => {
      throw new Error('session busy');
    });
    const { getByTestId, getByLabelText, queryByTestId } = render(<AudioRoutePicker />);

    fireEvent.press(getByTestId('audio-route-trigger'));
    fireEvent.press(getByTestId('audio-route-speaker'));

    expect(useSettingsStore.getState().audioRoute).toBe('speaker');
    expect(getByTestId('audio-route-not-applied').props.children).toBe(
      audioRouteNotAppliedMessage('speaker'),
    );
    expect(getByLabelText('Audio route, Speaker, not applied')).toBeTruthy();

    fireEvent.press(getByTestId('audio-route-bluetooth'));

    expect(queryByTestId('audio-route-not-applied')).toBeNull();
    expect(getByLabelText('Audio route, Bluetooth')).toBeTruthy();
  });

  it('lists every route with a hint and marks the selected one', () => {
    useSettingsStore.setState({ audioRoute: 'speaker' });
    const { getByTestId } = render(<AudioRoutePicker />);

    fireEvent.press(getByTestId('audio-route-trigger'));

    for (const route of AUDIO_ROUTES) {
      expect(getByTestId(`audio-route-${route}`)).toBeTruthy();
    }
    expect(getByTestId('audio-route-speaker').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('audio-route-headset').props.accessibilityState.selected).toBe(false);
  });

  it('renders nothing where the route cannot be switched rather than a dead control', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    const { toJSON } = render(<AudioRoutePicker />);
    expect(toJSON()).toBeNull();
  });
});
