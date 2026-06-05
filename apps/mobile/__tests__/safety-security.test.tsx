/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockSetItemAsync = jest.fn();
const mockGetEnrolledLevelAsync = jest.fn();
const mockAuthenticateAsync = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

jest.mock('expo-local-authentication', () => ({
  getEnrolledLevelAsync: () => mockGetEnrolledLevelAsync(),
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
  SecurityLevel: {
    NONE: 0,
    SECRET: 1,
    BIOMETRIC: 2,
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    back: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (props: Record<string, unknown>) => <View {...props} />;
  return {
    ArrowLeft: icon,
    ChevronRight: icon,
    Fingerprint: icon,
    Shield: icon,
    Smartphone: icon,
  };
});

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

jest.mock('@/components/ui/switch', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Switch: ({
      value,
      onValueChange,
      disabled,
    }: {
      value: boolean;
      onValueChange: (next: boolean) => void;
      disabled?: boolean;
    }) => (
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={() => onValueChange(!value)}
      >
        <Text>{value ? 'On' : 'Off'}</Text>
      </Pressable>
    ),
  };
});

import SafetySecurityScreen from '../src/features/settings/safety-security';
import { useBiometricFlag } from '../lib/biometricFlagStore';

describe('Safety & Security settings', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    useBiometricFlag.setState({ hydrated: true, enabled: false });
    mockGetEnrolledLevelAsync.mockResolvedValue(2);
    mockAuthenticateAsync.mockResolvedValue({ success: true });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('shows the app-lock toggle with Face ID and passcode copy', () => {
    const { getByText, getByLabelText } = render(<SafetySecurityScreen />);

    expect(getByText('App Lock')).toBeTruthy();
    expect(getByText('Require Face ID, Touch ID, or passcode to open AGI.')).toBeTruthy();
    expect(getByLabelText('App Lock. Off')).toBeTruthy();
  });

  it('requires successful OS authentication before enabling app lock', async () => {
    const { getByRole } = render(<SafetySecurityScreen />);

    fireEvent.press(getByRole('switch'));

    await waitFor(() => {
      expect(mockAuthenticateAsync).toHaveBeenCalledWith({
        promptMessage: 'Turn On AGI App Lock',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      expect(mockSetItemAsync).toHaveBeenCalledWith('agi_biometric_lock_enabled_v1', 'true', {
        keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
      });
    });
    expect(useBiometricFlag.getState().enabled).toBe(true);
  });

  it('does not enable app lock when the device has no enrolled auth', async () => {
    mockGetEnrolledLevelAsync.mockResolvedValue(0);
    const { getByRole } = render(<SafetySecurityScreen />);

    fireEvent.press(getByRole('switch'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Set up a device lock first',
        'Turn on Face ID, Touch ID, or a device passcode in system settings before enabling AGI app lock.',
      );
    });
    expect(mockAuthenticateAsync).not.toHaveBeenCalled();
    expect(mockSetItemAsync).not.toHaveBeenCalled();
    expect(useBiometricFlag.getState().enabled).toBe(false);
  });

  it('does not enable app lock when OS authentication is cancelled', async () => {
    mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
    const { getByRole } = render(<SafetySecurityScreen />);

    fireEvent.press(getByRole('switch'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'App lock was not turned on',
        'AGI could not confirm your device lock.',
      );
    });
    expect(mockSetItemAsync).not.toHaveBeenCalled();
    expect(useBiometricFlag.getState().enabled).toBe(false);
  });
});
