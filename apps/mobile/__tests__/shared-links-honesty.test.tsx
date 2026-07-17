import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/ui/theme', () => ({
  useTheme: () => ({
    statusBarStyle: 'dark',
    colors: {
      surfaceBase: '#fff',
      surfaceHover: '#eee',
      transparent: 'transparent',
      textPrimary: '#111',
      textSecondary: '#555',
      warningBorder: '#f90',
      warningSurface: '#fff8e8',
      agentWarning: '#a60',
      accentSurface: '#eef',
      teal: '#077',
      white: '#fff',
    },
  }),
  useThemeColors: () => ({
    surfaceElevated: '#fff',
    border: '#ddd',
  }),
}));

jest.mock('@/src/features/cloud-bridge/InviteCodeModal', () => ({
  InviteCodeModal: () => null,
}));

import SharedLinksScreen from '../app/(app)/settings/shared-links';

describe('Shared Links capability honesty', () => {
  it('does not advertise a waitlist or invitation path that has no implementation', () => {
    render(<SharedLinksScreen />);

    expect(screen.queryByText('Join waitlist')).toBeNull();
    expect(screen.queryByLabelText(/invitation code/i)).toBeNull();
    expect(screen.getByText(/isn’t available on mobile yet/i)).toBeTruthy();
  });
});
