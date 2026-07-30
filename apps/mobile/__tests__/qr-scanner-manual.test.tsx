/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    CameraView: (props: Record<string, unknown>) => <View testID="camera-view" {...props} />,
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown) => value,
    Easing: { inOut: (value: unknown) => value, ease: 'ease' },
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <View {...props} /> });
});

jest.mock('@/src/ui/theme', () => {
  const colors = {
    teal: '#111111',
    terraCotta: '#111111',
    surfaceElevated: '#212121',
    surfaceHover: '#303030',
    transparent: 'transparent',
    textPrimary: '#f4f4f4',
    textSecondary: '#cccccc',
    textMuted: '#888888',
    border: '#333333',
    dangerBorder: '#aa0000',
    dangerSurface: '#330000',
    agentError: '#ff0000',
    agentWarning: '#ffaa00',
    accentText: '#000000',
    white: '#ffffff',
  };
  return { colors, useThemeColors: () => colors };
});

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
}));

jest.mock('@/services/companion', () => ({
  isValidPairingCode: (raw: string) => /^[A-Za-z0-9]{12}$/.test(raw.trim().replace(/[ -]/g, '')),
}));

import { QRScanner } from '../src/features/companion/components/QRScanner';

describe('QRScanner manual pairing', () => {
  it('shows the Desktop code format and submits a spaced 12-character code', () => {
    const onScan = jest.fn();
    const screen = render(<QRScanner onScan={onScan} onClose={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('Enter code manually'));
    const input = screen.getByPlaceholderText('ABCD EFGH IJKL');
    fireEvent.changeText(input, 'WXYZ 1234 ABCD');
    fireEvent.press(screen.getByLabelText('Connect'));

    expect(onScan).toHaveBeenCalledWith('WXYZ 1234 ABCD');
    expect(screen.getByText(/Settings → Connections/)).toBeTruthy();
  });

  it('rejects a legacy short code before attempting a connection', () => {
    const onScan = jest.fn();
    const screen = render(<QRScanner onScan={onScan} onClose={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('Enter code manually'));
    fireEvent.changeText(screen.getByPlaceholderText('ABCD EFGH IJKL'), 'ABCD1234');
    fireEvent.press(screen.getByLabelText('Connect'));

    expect(onScan).not.toHaveBeenCalled();
    expect(
      screen.getByText('Enter the 12-character code shown on Desktop, or scan the QR code.'),
    ).toBeTruthy();
  });
});
