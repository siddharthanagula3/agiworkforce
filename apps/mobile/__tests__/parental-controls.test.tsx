/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockMinorMode = false;

jest.mock('expo-router', () => ({
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
  });

  it('states that v1 age review is device-only and does not imply family governance', () => {
    const { getByText, getByRole } = render(<ParentalControlsScreen />);

    expect(getByText('Adult profile')).toBeTruthy();
    expect(getByText('Device age settings only')).toBeTruthy();
    expect(
      getByText(
        'This release does not link parent and teen accounts or provide remote usage, quiet-hour, model, or content controls. Reviewing age changes only this device.',
      ),
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
});
