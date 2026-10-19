jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));
jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn().mockResolvedValue(true),
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { ServiceNoticesBanner } from '@/src/features/service-notices/ServiceNoticesBanner';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderBanner() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ServiceNoticesBanner />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useChatAppModeStore.setState({ appMode: 'cloud' });
});

describe('ServiceNoticesBanner', () => {
  it('shows an incident or maintenance notice, links to it, and can be dismissed', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      notices: [
        {
          id: 'maintenance:2026-10-20T02:00:00.000Z',
          kind: 'maintenance',
          tone: 'info',
          scope: 'product',
          message: 'Planned maintenance from Oct 20 to Oct 20.',
          href: '/maintenance',
          linkLabel: 'Details',
        },
      ],
    });
    renderBanner();

    expect(await screen.findByText('Planned maintenance from Oct 20 to Oct 20.')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/api/status/notices', expect.anything());
    fireEvent.press(screen.getByText('Details'));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith(
      expect.stringMatching(/\/maintenance$/),
    );
    fireEvent.press(screen.getByLabelText('Dismiss this notice'));
    expect(screen.queryByTestId('service-notice')).toBeNull();
  });

  it('does not reach the cloud in Local Mode', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    renderBanner();
    await waitFor(() => expect(screen.queryByTestId('service-notice')).toBeNull());
    expect(api.get).not.toHaveBeenCalled();
  });
});
