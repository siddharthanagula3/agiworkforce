jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));
jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn().mockResolvedValue(true),
}));

import React from 'react';
import { AppState } from 'react-native';
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
const INITIAL_APP_STATE = AppState.currentState;

const NOTICE_RESPONSE = {
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
  AppState.currentState = 'active';
  useChatAppModeStore.setState({ appMode: 'cloud' });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  AppState.currentState = INITIAL_APP_STATE;
});

describe('ServiceNoticesBanner', () => {
  it('shows an incident or maintenance notice, links to it, and can be dismissed', async () => {
    (api.get as jest.Mock).mockResolvedValue(NOTICE_RESPONSE);
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

  it.each(['background', 'inactive'] as const)(
    'skips refresh while %s and fetches when the app becomes active',
    async (state) => {
      jest.useFakeTimers();
      AppState.currentState = state;
      const subscription = jest.spyOn(AppState, 'addEventListener');
      jest.mocked(api.get).mockResolvedValue(NOTICE_RESPONSE);
      renderBanner();

      jest.runOnlyPendingTimers();
      expect(api.get).not.toHaveBeenCalled();
      expect(screen.queryByTestId('service-notice')).toBeNull();

      const listener = subscription.mock.calls.find(([event]) => event === 'change')?.[1];
      expect(listener).toBeDefined();
      AppState.currentState = 'active';
      listener?.('active');

      expect(await screen.findByText(NOTICE_RESPONSE.notices[0]!.message)).toBeTruthy();
      expect(api.get).toHaveBeenCalledTimes(1);
    },
  );

  it('does not reach the cloud in Local Mode', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    renderBanner();
    await waitFor(() => expect(screen.queryByTestId('service-notice')).toBeNull());
    expect(api.get).not.toHaveBeenCalled();
  });
});
