import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    back: jest.fn(),
  }),
  useFocusEffect: () => undefined,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

import PermissionsScreen from '../src/features/settings/permissions';

describe('Permissions list footer', () => {
  it('keeps one short sentence and the help link below the permission list', () => {
    const { getByText } = render(<PermissionsScreen />);

    expect(getByText('AGI asks only when a feature you started needs access.')).toBeTruthy();
    expect(getByText('Get help with permissions')).toBeTruthy();
  });
});
