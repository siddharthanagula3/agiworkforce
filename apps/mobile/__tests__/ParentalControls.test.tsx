/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockMinorMode = false;
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: mockPush,
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
    Baby: icon,
    ChevronRight: icon,
    Shield: icon,
  };
});

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

import ParentalControlsScreen from '../src/features/settings/parental-controls';

describe('Parental Controls settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMinorMode = false;
    mockSearchParams = {};
  });

  it('states that v1 age review is device-only and does not imply family governance', () => {
    const { getByText, getByRole } = render(<ParentalControlsScreen />);

    expect(getByText('Adult profile')).toBeTruthy();
    expect(getByText('Device age settings only')).toBeTruthy();
    expect(
      getByText('Age settings apply only to this device; parent accounts can’t be linked.'),
    ).toBeTruthy();

    fireEvent.press(getByRole('button', { name: 'Review Device Age Settings' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(public)/age-gate',
      params: { returnTo: '/(app)/settings/parental-controls' },
    });
  });

  it('describes mandatory minor-safe filtering without claiming a linked parent account', () => {
    mockMinorMode = true;
    const { getByText } = render(<ParentalControlsScreen />);

    expect(getByText('Minor-safe mode is active')).toBeTruthy();
    expect(
      getByText(
        'AGI filters clearly unsafe adult-only requests before Local or Cloud processing on this device.',
      ),
    ).toBeTruthy();
    expect(getByText('Device age settings only')).toBeTruthy();
  });

  it('is titled Parental Controls when opened from the Parental Controls row', () => {
    const { getByText } = render(<ParentalControlsScreen />);

    expect(getByText('Parental Controls')).toBeTruthy();
  });

  it('carries the Age entry through the device age review so the title survives the round trip', () => {
    mockSearchParams = { entry: 'age' };
    const { getByRole } = render(<ParentalControlsScreen />);

    fireEvent.press(getByRole('button', { name: 'Review Device Age Settings' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(public)/age-gate',
      params: { returnTo: '/(app)/settings/parental-controls', entry: 'age' },
    });
  });

  it('does not carry an entry it does not know through the device age review', () => {
    mockSearchParams = { entry: 'elsewhere' };
    const { getByRole } = render(<ParentalControlsScreen />);

    fireEvent.press(getByRole('button', { name: 'Review Device Age Settings' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(public)/age-gate',
      params: { returnTo: '/(app)/settings/parental-controls' },
    });
  });

  it('is titled Age when opened from the Age row, so the header says what the row said', () => {
    mockSearchParams = { entry: 'age' };
    const { getByText, queryByText } = render(<ParentalControlsScreen />);

    expect(getByText('Age')).toBeTruthy();
    expect(queryByText('Parental Controls')).toBeNull();
  });
});
