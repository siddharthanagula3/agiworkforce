import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPending = jest.fn();
const mockComplete = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { primaryEmailAddress: { emailAddress: 'me@example.com' } } }),
}));
jest.mock('@/src/shared/hooks/useGoBack', () => ({ useGoBack: () => jest.fn() }));
jest.mock('@/src/features/cloud-code/githubInstall', () => ({
  ...jest.requireActual('@/src/features/cloud-code/githubInstall'),
  fetchPendingGitHubInstall: (...args: unknown[]) => mockPending(...args),
  completeGitHubInstall: (...args: unknown[]) => mockComplete(...args),
}));

import GitHubInstallReturnRoute from '../app/(app)/github/installed';

const STATE = 'b'.repeat(64);

describe('GitHub install confirm screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { state: STATE, code: 'one-time-code' };
    mockPending.mockResolvedValue({
      status: 'ready',
      accountLogin: 'acme',
      accountType: 'Organization',
    });
    mockComplete.mockResolvedValue('connected');
  });

  it('names the installation and this account and links nothing until confirmed', async () => {
    const screen = render(<GitHubInstallReturnRoute />);

    await waitFor(() =>
      screen.getByText('Link GitHub installation acme (organization) to me@example.com?'),
    );
    expect(mockPending).toHaveBeenCalledWith(STATE);
    expect(mockComplete).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText('Link GitHub'));
    });

    expect(mockComplete).toHaveBeenCalledWith({ state: STATE, code: 'one-time-code' });
    expect(mockReplace).toHaveBeenCalledWith('/(app)/cloud-code');
  });

  it('closes the install without the code when the user cancels', async () => {
    mockComplete.mockResolvedValue('denied');
    const screen = render(<GitHubInstallReturnRoute />);

    await waitFor(() => screen.getByText('Link GitHub'));
    await act(async () => {
      fireEvent.press(screen.getByText('Cancel'));
    });

    expect(mockComplete).toHaveBeenCalledWith({ state: STATE, error: 'denied' });
    expect(screen.getByText('GitHub was not linked.')).toBeTruthy();
  });

  it('refuses an install another account started, without offering to link it', async () => {
    mockPending.mockResolvedValue({ status: 'invalid_state' });
    const screen = render(<GitHubInstallReturnRoute />);

    await waitFor(() => screen.getByText(/started by another account/));
    expect(screen.queryByText('Link GitHub')).toBeNull();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('closes a denied authorization without asking', async () => {
    mockParams = { state: STATE, error: 'denied' };
    mockComplete.mockResolvedValue('denied');
    const screen = render(<GitHubInstallReturnRoute />);

    await waitFor(() => screen.getByText('GitHub was not linked.'));
    expect(mockPending).not.toHaveBeenCalled();
    expect(mockComplete).toHaveBeenCalledWith({ state: STATE, error: 'denied' });
  });

  it('refuses a malformed return', async () => {
    mockParams = { code: 'one-time-code' };
    const screen = render(<GitHubInstallReturnRoute />);

    await waitFor(() => screen.getByText(/Start it again/));
    expect(mockPending).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('closes the pending install when cancelled while it is still loading', async () => {
    mockPending.mockReturnValue(new Promise(() => undefined));
    mockComplete.mockResolvedValue('denied');
    const screen = render(<GitHubInstallReturnRoute />);

    await act(async () => {
      fireEvent.press(screen.getByText('Cancel'));
    });

    expect(mockComplete).toHaveBeenCalledWith({ state: STATE, error: 'denied' });
  });
});
