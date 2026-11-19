/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

let mockCameraGranted = true;

jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    CameraView: (props: Record<string, unknown>) => <View testID="camera-view" {...props} />,
    useCameraPermissions: () => [{ granted: mockCameraGranted }, jest.fn()],
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
  return { colors, useThemeColors: () => colors, useTheme: () => ({ colors, isDark: true }) };
});

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
}));

jest.mock('@/stores/connectionStore', () => ({
  useConnectionStore: { getState: jest.fn(() => ({ status: 'disconnected' })) },
}));

jest.mock('@/stores/dispatchTaskStore', () => ({
  useDispatchTaskStore: { getState: jest.fn(() => ({})) },
}));

import { QRScanner } from '../src/features/companion/components/QRScanner';
import { PAIRING_SECRET_REQUIRED_MESSAGE } from '../services/manualPairing';

const PAIRING_SECRET = '9f'.repeat(32);
const DESKTOP_PAIRING_PAYLOAD = `agiw3:WXYZ1234ABCD:${PAIRING_SECRET}`;

function scan(screen: ReturnType<typeof render>, data: string): void {
  const camera = screen.getByTestId('camera-view');
  (camera.props.onBarcodeScanned as (result: { data: string }) => void)({ data });
}

describe('QRScanner pairing', () => {
  beforeEach(() => {
    mockCameraGranted = true;
  });

  it('hands the scanned pairing link to the store instead of silently ignoring it', () => {
    const onScan = jest.fn();
    const screen = render(<QRScanner onScan={onScan} onClose={jest.fn()} />);

    scan(screen, DESKTOP_PAIRING_PAYLOAD);

    expect(onScan).toHaveBeenCalledWith(DESKTOP_PAIRING_PAYLOAD);
  });

  it('ignores a QR code that is not a pairing payload', () => {
    const onScan = jest.fn();
    const screen = render(<QRScanner onScan={onScan} onClose={jest.fn()} />);

    scan(screen, 'https://example.com/not-a-pairing-code');

    expect(onScan).not.toHaveBeenCalled();
  });

  it('offers no way to type or paste a code, since only the QR code carries the pairing secret', () => {
    const screen = render(<QRScanner onScan={jest.fn()} onClose={jest.fn()} />);

    expect(screen.queryByLabelText('Enter code manually')).toBeNull();
    expect(screen.queryByPlaceholderText('Paste the pairing link')).toBeNull();
    expect(screen.queryByLabelText('Paste pairing link')).toBeNull();
  });

  it('tells a user without camera access to enable it and scan, with no manual route', () => {
    mockCameraGranted = false;
    const onClose = jest.fn();
    const screen = render(<QRScanner onScan={jest.fn()} onClose={onClose} />);

    expect(
      screen.getByText(/Pairing needs the QR code in the pairing window on Desktop/),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Enter Code Manually')).toBeNull();
    expect(screen.queryByText(/paste/i)).toBeNull();

    fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks for the QR code, not a copied link, when a bare code reaches the connection', () => {
    expect(PAIRING_SECRET_REQUIRED_MESSAGE).toMatch(/Scan the QR code/);
    expect(PAIRING_SECRET_REQUIRED_MESSAGE).not.toMatch(/Copy pairing link|paste/i);
  });
});
