/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return {
    ArrowLeft: Icon,
    Shield: Icon,
    ShieldAlert: Icon,
    ShieldCheck: Icon,
    SlidersHorizontal: Icon,
  };
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import AutoApproveScreen from '../app/(app)/settings/auto-approve';

describe('Auto-approve settings screen', () => {
  it('renders a visible disabled state instead of a blank screen when agents are unavailable', () => {
    const { getByText, getByLabelText, queryAllByRole } = render(<AutoApproveScreen />);

    expect(getByText('Action approvals')).toBeTruthy();
    expect(getByText('Review before AGI acts')).toBeTruthy();
    expect(
      getByLabelText(
        'Current behavior. AGI asks before tool actions. Advanced agent automation is not active on this device. Ask',
      ),
    ).toBeTruthy();
    expect(queryAllByRole('radio')).toHaveLength(0);
  });
});
