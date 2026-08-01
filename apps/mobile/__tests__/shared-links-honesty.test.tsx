import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

const mockGet = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => ({ statusBarStyle: 'dark', colors: tokens.lightColors }),
    useThemeColors: () => tokens.lightColors,
  };
});

import SharedLinksScreen from '../app/(app)/settings/shared-links';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

describe('Shared Links capability honesty', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ shares: [] });
    // Shared links are Managed Cloud data; Local Mode is covered separately.
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('does not advertise a waitlist or invitation path', async () => {
    render(<SharedLinksScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    expect(screen.queryByText('Join waitlist')).toBeNull();
    expect(screen.queryByLabelText(/invitation code/i)).toBeNull();
  });

  it('no longer claims the feature is unavailable on mobile', async () => {
    // It was never unavailable — web has shipped /share/[token] and /api/share
    // for some time. Only the list endpoint was missing.
    render(<SharedLinksScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    expect(screen.queryByText(/isn’t available on mobile yet/i)).toBeNull();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.queryByText(/once this feature ships/i)).toBeNull();
  });

  it('reads the account own shares from the real endpoint', async () => {
    render(<SharedLinksScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/share'));
  });

  it('renders a published link with its revoke control', async () => {
    mockGet.mockResolvedValue({
      shares: [
        {
          token: 'tok-1',
          title: 'Planning session',
          shareUrl: 'https://agiworkforce.com/share/tok-1',
          messageCount: 3,
          createdAt: '2026-07-01T00:00:00.000Z',
          expiresAt: '2026-08-01T00:00:00.000Z',
          expired: false,
        },
      ],
    });

    render(<SharedLinksScreen />);

    expect(await screen.findByText('Planning session')).toBeTruthy();
    expect(screen.getByLabelText('Revoke link to Planning session')).toBeTruthy();
    expect(screen.getByLabelText('Share link to Planning session')).toBeTruthy();
  });

  it('does not offer to re-share a link that has expired', async () => {
    mockGet.mockResolvedValue({
      shares: [
        {
          token: 'tok-2',
          title: 'Old session',
          shareUrl: 'https://agiworkforce.com/share/tok-2',
          messageCount: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-02-01T00:00:00.000Z',
          expired: true,
        },
      ],
    });

    render(<SharedLinksScreen />);

    expect(await screen.findByText('Old session')).toBeTruthy();
    // Sharing it again would hand someone a URL that no longer opens.
    expect(screen.queryByLabelText('Share link to Old session')).toBeNull();
    // But it must still be revocable, so the user can clean it up.
    expect(screen.getByLabelText('Revoke link to Old session')).toBeTruthy();
  });

  it('surfaces a load failure instead of showing an empty list', async () => {
    mockGet.mockRejectedValue(new Error('network unreachable'));

    render(<SharedLinksScreen />);

    // An empty state here would read as "you have never shared anything",
    // which is a different and wrong statement.
    expect(await screen.findByText(/Could not load shared links/i)).toBeTruthy();
    expect(screen.queryByText('No shared links yet')).toBeNull();
  });

  it('never renders the failure message it was handed', async () => {
    // The egress guard's refusal and any HTTP/transport text are developer
    // strings; the screen must render its own sentence instead.
    mockGet.mockRejectedValue(new Error('Request failed with status 503 at https://api.example'));

    render(<SharedLinksScreen />);

    expect(await screen.findByText(/Could not load shared links/i)).toBeTruthy();
    expect(screen.queryByText(/status 503/)).toBeNull();
    expect(screen.queryByText(/https:\/\//)).toBeNull();
  });
});

describe('Shared Links in Local Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('renders the Local Mode banner and never attempts the request', async () => {
    render(<SharedLinksScreen />);

    expect(await screen.findByText('Chat is set to Local Mode')).toBeTruthy();
    expect(screen.getByLabelText('Switch to AGI Cloud')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.queryByText('No shared links yet')).toBeNull();
  });

  it('maps a refused request to the banner instead of the guard message', async () => {
    // Entering the screen in Cloud mode and having the guard refuse mid-flight
    // is the same user-facing situation as starting in Local mode.
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const blocked = Object.assign(
      new Error(
        'egressGuard refused: outbound request to our managed-cloud host "api.agiworkforce.com" ' +
          'is blocked in Local mode.',
      ),
      { code: 'EGRESS_BLOCKED_LOCAL_MODE' },
    );
    mockGet.mockRejectedValue(blocked);

    render(<SharedLinksScreen />);

    expect(await screen.findByText('Chat is set to Local Mode')).toBeTruthy();
    expect(screen.queryByText(/egressGuard refused/)).toBeNull();
    expect(screen.queryByText(/Could not load shared links/i)).toBeNull();
  });
});
