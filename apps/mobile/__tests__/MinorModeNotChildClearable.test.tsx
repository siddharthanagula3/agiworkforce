/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockStorage = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: (key: string) => mockStorage.get(key) ?? undefined,
    set: (key: string, value: string) => mockStorage.set(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(true),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (props: Record<string, unknown>) => <View {...props} />;
  return { ChevronRight: icon, Lock: icon, Shield: icon };
});

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ isClerkSignedIn: false, signOut: jest.fn() }),
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

const mockHandleExport = jest.fn();
jest.mock('@/src/features/settings/data-controls/useLocalDataExport', () => ({
  useLocalDataExport: () => ({ exporting: false, progress: null, handleExport: mockHandleExport }),
}));

const mockEraseDeviceData = jest.fn();
jest.mock('@/src/features/settings/data-controls/useEraseDeviceData', () => ({
  useEraseDeviceData: () => ({ isWiping: false, eraseDeviceData: mockEraseDeviceData }),
}));

import {
  ageGateStatus,
  clearAgeGate,
  confirmAgeGate,
  isMinorMode,
} from '../src/features/auth/services/ageGate';
import AgeGateScreen from '../app/(public)/age-gate';

describe('a refusal cannot be cleared by the device it protects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
  });

  it('keeps the refusal when an adult age is typed afterwards', () => {
    confirmAgeGate(12);
    expect(isMinorMode()).toBe(true);

    const rewritten = confirmAgeGate(30);

    expect(rewritten.isMinor).toBe(true);
    expect(isMinorMode()).toBe(true);
  });

  it('still lets an unconfirmed device record an adult age', () => {
    const record = confirmAgeGate(30);
    expect(record.isMinor).toBe(false);
    expect(isMinorMode()).toBe(false);
  });

  it('still lets an adult device record an under-age answer', () => {
    confirmAgeGate(30);
    expect(confirmAgeGate(12).isMinor).toBe(true);
    expect(isMinorMode()).toBe(true);
  });

  it('lets only an explicit erase clear the record', () => {
    confirmAgeGate(12);
    clearAgeGate();
    expect(isMinorMode()).toBe(false);
    expect(ageGateStatus()).toBe('required');
  });

  it('offers no age input on the age-gate screen once refused', () => {
    confirmAgeGate(12);
    const { queryByTestId, getByTestId } = render(<AgeGateScreen />);

    expect(queryByTestId('age-gate-input')).toBeNull();
    expect(queryByTestId('age-gate-continue-btn')).toBeNull();
    expect(getByTestId('age-gate-refused')).toBeTruthy();
  });

  it('says erasing the app data resets the recorded age, not only reinstalling', () => {
    confirmAgeGate(12);
    const refused = render(<AgeGateScreen />);
    expect(refused.getByText(/Only erasing AGI’s data on this device resets it\./)).toBeTruthy();
    expect(refused.queryByText(/reinstall/i)).toBeNull();
  });

  it('keeps the device data reachable from the refusal', () => {
    confirmAgeGate(12);
    const { getByTestId } = render(<AgeGateScreen />);

    fireEvent.press(getByTestId('age-gate-refused-export'));
    fireEvent.press(getByTestId('age-gate-refused-erase'));

    expect(mockHandleExport).toHaveBeenCalledTimes(1);
    expect(mockEraseDeviceData).toHaveBeenCalledTimes(1);
  });

  it('shows the age input while no refusal exists', () => {
    const { getByTestId } = render(<AgeGateScreen />);
    expect(getByTestId('age-gate-input')).toBeTruthy();
  });
});
