import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockOpenInAppBrowser = jest.fn();
jest.mock('@/lib/safeOpenURL', () => ({
  openExternalUrl: jest.fn().mockResolvedValue(true),
  openInAppBrowser: (...args: unknown[]) => mockOpenInAppBrowser(...args),
  isAllowedExternalUrl: jest.requireActual('../lib/safeOpenURL').isAllowedExternalUrl,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <View {...props} /> });
});

jest.mock('@/components/ui/Text', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Text };
});

import AboutScreen from '../app/(app)/about';
import { PairingRiskDisclosure } from '../src/features/companion/components/PairingRiskDisclosure';

const LINK_FAILURE_MESSAGE = 'Could not open the link. Please try again.';

describe('the link failure alert closes with the Android Back button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenInAppBrowser.mockResolvedValue(false);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('on the Help and About resource links', async () => {
    render(<AboutScreen />);

    fireEvent.press(screen.getByText('Privacy Policy'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Error', LINK_FAILURE_MESSAGE, undefined, {
        cancelable: true,
      }),
    );
  });

  it('on the pairing safety link', async () => {
    render(<PairingRiskDisclosure />);

    fireEvent.press(screen.getByText('Learn how to use this safely'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Error', LINK_FAILURE_MESSAGE, undefined, {
        cancelable: true,
      }),
    );
  });
});
