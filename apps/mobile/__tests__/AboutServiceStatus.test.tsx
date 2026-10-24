jest.mock('@/lib/safeOpenURL', () => ({ openInAppBrowser: jest.fn().mockResolvedValue(true) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { openInAppBrowser } from '@/lib/safeOpenURL';
import AboutScreen from '../app/(app)/about';

describe('Help & About', () => {
  it('opens the live service status page', async () => {
    render(<AboutScreen />);
    fireEvent.press(screen.getByLabelText('Service Status'));
    await waitFor(() =>
      expect(openInAppBrowser).toHaveBeenCalledWith('https://agiworkforce.com/status'),
    );
  });

  it('opens the acceptable use policy', async () => {
    render(<AboutScreen />);
    fireEvent.press(screen.getByLabelText('Acceptable Use Policy'));
    await waitFor(() =>
      expect(openInAppBrowser).toHaveBeenCalledWith('https://agiworkforce.com/acceptable-use'),
    );
  });
});
