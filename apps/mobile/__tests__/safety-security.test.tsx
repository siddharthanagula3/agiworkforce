/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockSetItemAsync = jest.fn();
const mockGetEnrolledLevelAsync = jest.fn();
const mockAuthenticateAsync = jest.fn();
const mockPush = jest.fn();
const mockSetReduceSensitiveContent = jest.fn();
let mockMinorMode = false;
let mockReduceSensitiveContent = false;

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

jest.mock('../src/features/auth/services/ageGate', () => ({
  isMinorMode: () => mockMinorMode,
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (props: Record<string, unknown>) => <View {...props} />;
  return {
    ArrowLeft: icon,
    ChevronRight: icon,
    EyeOff: icon,
    Fingerprint: icon,
    Shield: icon,
    Smartphone: icon,
    UserRound: icon,
  };
});

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (
    selector: (state: {
      hapticsEnabled: boolean;
      reduceSensitiveContent: boolean;
      setReduceSensitiveContent: typeof mockSetReduceSensitiveContent;
    }) => unknown,
  ) =>
    selector({
      hapticsEnabled: false,
      reduceSensitiveContent: mockReduceSensitiveContent,
      setReduceSensitiveContent: mockSetReduceSensitiveContent,
    }),
}));

jest.mock('@/components/ui/switch', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Switch: ({
      value,
      onValueChange,
      disabled,
      accessibilityLabel,
      accessibilityHint,
    }: {
      value: boolean;
      onValueChange: (next: boolean) => void;
      disabled?: boolean;
      accessibilityLabel?: string;
      accessibilityHint?: string;
    }) => (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
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
    mockMinorMode = false;
    mockReduceSensitiveContent = false;
    useBiometricFlag.setState({ hydrated: true, enabled: false });
    mockGetEnrolledLevelAsync.mockResolvedValue(2);
    mockAuthenticateAsync.mockResolvedValue({ success: true });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('shows the app-lock toggle with Face ID and passcode copy', () => {
    const { getByText, getByRole } = render(<SafetySecurityScreen />);

    expect(getByText('App Lock')).toBeTruthy();
    expect(getByText('Require Face ID, Touch ID, or passcode to open AGI.')).toBeTruthy();
    expect(getByRole('switch', { name: 'App Lock. Off' })).toBeTruthy();
  });

  it('states that no trusted contact or automatic notification is configured', () => {
    const { getByText } = render(<SafetySecurityScreen />);

    expect(getByText('Trusted contact · Not configured')).toBeTruthy();
    expect(
      getByText(
        'AGI does not monitor chats to automatically notify another person. No trusted contact is enrolled, and no contact receives conversation content or safety alerts.',
      ),
    ).toBeTruthy();
  });

  it('lets an adult enable stricter content filtering', () => {
    const { getByText, getByRole } = render(<SafetySecurityScreen />);

    expect(getByText('Reduce sensitive content')).toBeTruthy();
    expect(
      getByText(
        'Filter clearly explicit and harmful requests before they reach Local or Cloud models.',
      ),
    ).toBeTruthy();

    fireEvent.press(getByRole('switch', { name: 'Reduce sensitive content. Off' }));

    expect(mockSetReduceSensitiveContent).toHaveBeenCalledWith(true);
  });

  it('keeps stricter content filtering on and disabled in minor-safe mode', () => {
    mockMinorMode = true;
    const { getByText, getByRole } = render(<SafetySecurityScreen />);
    const safetySwitch = getByRole('switch', { name: 'Reduce sensitive content. On' });

    expect(
      getByText('Required by age settings. It stays on while minor-safe mode is active.'),
    ).toBeTruthy();
    expect(safetySwitch.props.accessibilityState).toEqual({ checked: true, disabled: true });

    fireEvent.press(safetySwitch);
    expect(mockSetReduceSensitiveContent).not.toHaveBeenCalled();
  });

  it('requires successful OS authentication before enabling app lock', async () => {
    const { getByRole } = render(<SafetySecurityScreen />);

    fireEvent.press(getByRole('switch', { name: 'App Lock. Off' }));

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

    fireEvent.press(getByRole('switch', { name: 'App Lock. Off' }));

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

    fireEvent.press(getByRole('switch', { name: 'App Lock. Off' }));

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
