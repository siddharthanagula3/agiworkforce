/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

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
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(true),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (props: Record<string, unknown>) => <View {...props} />;
  return { ArrowLeft: icon, Baby: icon, ChevronRight: icon, Lock: icon, Shield: icon };
});

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

import { clearAgeGate, confirmAgeGate, isMinorMode } from '../src/features/auth/services/ageGate';
import AgeGateScreen from '../app/(public)/age-gate';
import ParentalControlsScreen from '../src/features/settings/parental-controls';

describe('minor-safe mode cannot be cleared by the device it protects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
  });

  it('keeps the minor record when an adult age is typed afterwards', () => {
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

  it('still lets an adult device record a minor age', () => {
    confirmAgeGate(30);
    expect(confirmAgeGate(12).isMinor).toBe(true);
    expect(isMinorMode()).toBe(true);
  });

  it('lets an explicit reset clear the record', () => {
    confirmAgeGate(12);
    clearAgeGate();
    expect(isMinorMode()).toBe(false);
  });

  it('offers no age input on the age-gate screen once minor mode is on', () => {
    confirmAgeGate(12);
    const { queryByTestId, getByTestId } = render(<AgeGateScreen />);

    expect(queryByTestId('age-gate-input')).toBeNull();
    expect(queryByTestId('age-gate-continue-btn')).toBeNull();
    expect(getByTestId('age-gate-minor-locked')).toBeTruthy();
  });

  it('shows the age input while no minor record exists', () => {
    const { getByTestId } = render(<AgeGateScreen />);
    expect(getByTestId('age-gate-input')).toBeTruthy();
  });

  it('does not route a protected device back to the self-declare screen', () => {
    confirmAgeGate(12);
    const { queryByRole, getByTestId } = render(<ParentalControlsScreen />);

    expect(queryByRole('button', { name: 'Review Device Age Settings' })).toBeNull();
    expect(getByTestId('parental-controls-minor-lock')).toBeTruthy();
  });

  it('still offers the age review on an adult device', () => {
    confirmAgeGate(30);
    const { getByRole } = render(<ParentalControlsScreen />);
    expect(getByRole('button', { name: 'Review Device Age Settings' })).toBeTruthy();
  });
});
