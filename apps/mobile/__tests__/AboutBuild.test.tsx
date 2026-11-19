import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '0.0.1', ios: { buildNumber: '2' }, android: { versionCode: 1 } },
    platform: { ios: { buildNumber: '57' } },
  },
}));
jest.mock('@/lib/safeOpenURL', () => ({ openInAppBrowser: jest.fn().mockResolvedValue(true) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import AboutScreen from '../app/(app)/about';

describe('Help & About build', () => {
  it('shows the build number embedded in the binary, not the configured placeholder', () => {
    render(<AboutScreen />);

    expect(screen.getByText('0.0.1 (57)')).toBeTruthy();
    expect(screen.queryByText('0.0.1 (2)')).toBeNull();
  });
});
