/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const themeColors = {
  textPrimary: '#fff',
  textSecondary: '#aaa',
  textMuted: '#777',
  border: '#333',
  teal: '#2dd4bf',
  background: '#0e0e0e',
  surfaceBase: '#0e0e0e',
  surfaceElevated: '#1a1a1a',
  successBorder: '#0f766e',
  successSurface: '#052e2b',
  neutralSurface: '#222',
  agentSuccess: '#22c55e',
  agentError: '#ef4444',
};

jest.mock('@/src/features/chat/components/WorkModeSwitch', () => ({ HEADER_TEXT_SCALE_LIMIT: 2 }));
jest.mock('@/src/ui/theme', () => ({
  colors: themeColors,
  useTheme: () => ({ colors: themeColors, isDark: true, statusBarStyle: 'light' }),
  useThemeColors: () => themeColors,
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return new Proxy(
    {},
    { get: (_t, name: string) => (name === '__esModule' ? true : factory(name)) },
  );
});

let mockPermissionParam = 'faceId';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({ permission: mockPermissionParam }),
}));

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) => (
      <RN.View {...props}>{children as React.ReactNode}</RN.View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

const undetermined = { status: 'undetermined', canAskAgain: true };

jest.mock('expo-camera', () => ({
  Camera: {
    getMicrophonePermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
    requestMicrophonePermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
    getCameraPermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
    requestCameraPermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
  },
  CameraView: 'CameraView',
}));

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
}));

jest.mock('expo-notifications', () => ({
  ...jest.requireActual('@/__mocks__/expo-notifications.mock').expoNotificationsMock(),
  getPermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
  requestPermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
}));

jest.mock('expo-calendar/legacy', () => ({
  getCalendarPermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
  requestCalendarPermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
  getRemindersPermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
  requestRemindersPermissionsAsync: jest.fn(() => Promise.resolve(undetermined)),
}));

const mockSpeech = {
  getSpeechRecognizerPermissionsAsync: jest.fn(),
  requestSpeechRecognizerPermissionsAsync: jest.fn(),
};

jest.mock('expo-speech-recognition', () => ({
  __esModule: true,
  ExpoSpeechRecognitionModule: {
    getSpeechRecognizerPermissionsAsync: () => mockSpeech.getSpeechRecognizerPermissionsAsync(),
    requestSpeechRecognizerPermissionsAsync: () =>
      mockSpeech.requestSpeechRecognizerPermissionsAsync(),
  },
}));

const mockBiometrics = {
  supportedAuthenticationTypesAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
};

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  supportedAuthenticationTypesAsync: () => mockBiometrics.supportedAuthenticationTypesAsync(),
  isEnrolledAsync: () => mockBiometrics.isEnrolledAsync(),
  authenticateAsync: (options: unknown) => mockBiometrics.authenticateAsync(options),
}));

jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import PermissionsScreen from '@/src/features/settings/permissions';
import PermissionDetailScreen from '@/src/features/settings/permissions/Detail';
import {
  PERMISSION_KINDS,
  PERMISSION_REGISTRY,
  permissionStatusLabel,
} from '@/src/features/settings/permissions/registry';

const FACE_ID = 2;
const TOUCH_ID = 1;

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissionParam = 'faceId';
  mockSpeech.getSpeechRecognizerPermissionsAsync.mockResolvedValue(undetermined);
  mockSpeech.requestSpeechRecognizerPermissionsAsync.mockResolvedValue({
    status: 'granted',
    canAskAgain: false,
  });
  mockBiometrics.supportedAuthenticationTypesAsync.mockResolvedValue([FACE_ID]);
  mockBiometrics.isEnrolledAsync.mockResolvedValue(true);
  mockBiometrics.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
});

afterEach(async () => {
  mockBiometrics.isEnrolledAsync.mockResolvedValue(false);
  await PERMISSION_REGISTRY.faceId.getStatus();
});

describe('speech recognition permission row', () => {
  it('is listed on iOS beside the microphone', () => {
    expect(PERMISSION_KINDS).toContain('speechRecognition');
    expect(PERMISSION_KINDS.indexOf('speechRecognition')).toBe(
      PERMISSION_KINDS.indexOf('microphone') + 1,
    );
  });

  it('reads the status the speech recognizer reports, without asking', async () => {
    mockSpeech.getSpeechRecognizerPermissionsAsync.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
      restricted: true,
    });

    await expect(PERMISSION_REGISTRY.speechRecognition.getStatus()).resolves.toBe('denied');
    expect(mockSpeech.requestSpeechRecognizerPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks the speech recognizer only from the request action', async () => {
    await expect(PERMISSION_REGISTRY.speechRecognition.requestPermission()).resolves.toBe(
      'granted',
    );
    expect(mockSpeech.requestSpeechRecognizerPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('says it turns voice input into text on this device', () => {
    expect(PERMISSION_REGISTRY.speechRecognition.description).toBe(
      'Used to turn your voice input into text on this device.',
    );
  });
});

describe('Face ID permission row', () => {
  it('is offered only on a device with Face ID', async () => {
    await expect(PERMISSION_REGISTRY.faceId.isAvailable?.()).resolves.toBe(true);

    mockBiometrics.supportedAuthenticationTypesAsync.mockResolvedValue([TOUCH_ID]);
    await expect(PERMISSION_REGISTRY.faceId.isAvailable?.()).resolves.toBe(false);
  });

  it('does not claim access before a Face ID check has succeeded', async () => {
    await expect(PERMISSION_REGISTRY.faceId.getStatus()).resolves.toBe('undetermined');
    expect(permissionStatusLabel('undetermined', 'faceId')).toBe('Ask');
    expect(mockBiometrics.authenticateAsync).not.toHaveBeenCalled();
  });

  it('reads Face ID turned off for the app, or not set up, as denied', async () => {
    mockBiometrics.isEnrolledAsync.mockResolvedValue(false);

    await expect(PERMISSION_REGISTRY.faceId.getStatus()).resolves.toBe('denied');
  });

  it('checks with Face ID alone, so a passcode cannot stand in for it', async () => {
    mockBiometrics.authenticateAsync.mockResolvedValue({ success: true });

    await expect(PERMISSION_REGISTRY.faceId.requestPermission()).resolves.toBe('granted');
    expect(mockBiometrics.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: true }),
    );
    await expect(PERMISSION_REGISTRY.faceId.getStatus()).resolves.toBe('granted');
    expect(permissionStatusLabel('granted', 'faceId')).toBe('Allowed');
  });

  it('stays unconfirmed when the person cancels the check', async () => {
    await expect(PERMISSION_REGISTRY.faceId.requestPermission()).resolves.toBe('undetermined');
  });
});

describe('Permissions list', () => {
  it('shows both rows and asks for nothing when it opens', async () => {
    const { findByText, getByText } = render(<PermissionsScreen />);

    expect(await findByText('Face ID')).toBeTruthy();
    expect(getByText('Speech Recognition')).toBeTruthy();
    expect(mockSpeech.requestSpeechRecognizerPermissionsAsync).not.toHaveBeenCalled();
    expect(mockBiometrics.authenticateAsync).not.toHaveBeenCalled();
  });

  it('leaves Face ID out on a device without it', async () => {
    mockBiometrics.supportedAuthenticationTypesAsync.mockResolvedValue([TOUCH_ID]);

    const { getByText, queryByText } = render(<PermissionsScreen />);

    await waitFor(() =>
      expect(mockBiometrics.supportedAuthenticationTypesAsync).toHaveBeenCalled(),
    );
    expect(getByText('Speech Recognition')).toBeTruthy();
    expect(queryByText('Face ID')).toBeNull();
  });
});

describe('Face ID detail', () => {
  it('states what the device has not yet told the app and checks only on a tap', async () => {
    const { findByText, getByLabelText } = render(<PermissionDetailScreen />);

    expect(await findByText('Not Confirmed')).toBeTruthy();
    expect(mockBiometrics.authenticateAsync).not.toHaveBeenCalled();

    mockBiometrics.authenticateAsync.mockResolvedValue({ success: true });
    fireEvent.press(getByLabelText('Check Face ID'));

    expect(await findByText('Access Granted')).toBeTruthy();
    expect(mockBiometrics.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('asks the speech recognizer only when the person taps Allow', async () => {
    mockPermissionParam = 'speechRecognition';
    const { findByLabelText } = render(<PermissionDetailScreen />);

    const allow = await findByLabelText('Allow Speech Recognition');
    expect(mockSpeech.requestSpeechRecognizerPermissionsAsync).not.toHaveBeenCalled();

    fireEvent.press(allow);

    await waitFor(() =>
      expect(mockSpeech.requestSpeechRecognizerPermissionsAsync).toHaveBeenCalledTimes(1),
    );
  });
});
