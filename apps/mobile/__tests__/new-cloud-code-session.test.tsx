import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockCloudCodeApi = {
  listRepositories: jest.fn(),
  listBranches: jest.fn(),
  create: jest.fn(),
};

jest.mock('@/src/features/cloud-code/service', () => ({
  get cloudCodeApi() {
    return mockCloudCodeApi;
  },
  newCloudCodeIdempotencyKey: () => 'request-1',
  describeCloudCodeError: (_error: unknown, fallback: string) => fallback,
}));

const mockConnectGitHubInApp = jest.fn();

jest.mock('@/src/features/cloud-code/githubInstall', () => ({
  connectGitHubInApp: () => mockConnectGitHubInApp(),
  describeGitHubInstallOutcome: (outcome: string) =>
    outcome === 'connected' || outcome === 'dismissed' ? null : `outcome:${outcome}`,
}));

import {
  NewCloudCodeSessionSheet,
  titleFromTask,
} from '@/src/features/cloud-code/components/NewCloudCodeSessionSheet';

const repository = {
  installationId: 7,
  owner: 'acme',
  name: 'app',
  fullName: 'acme/app',
  defaultBranch: 'main',
  isPrivate: true,
};

describe('new cloud code session', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [repository],
      installationCount: 1,
      truncated: false,
      unreachable: [],
    });
    mockCloudCodeApi.listBranches.mockResolvedValue({ branches: [], truncated: false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('titles a session from the first words of its task', () => {
    expect(titleFromTask('  fix the flaky login test in the auth suite please ')).toBe(
      'fix the flaky login test in',
    );
  });

  it('creates a session on the chosen repository and hands back the task', async () => {
    const session = { id: 'session-1', state: 'provisioning' };
    mockCloudCodeApi.create.mockResolvedValue({ session, terminalEntries: [] });
    const onCreated = jest.fn();
    const { getByTestId } = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => getByTestId('new-cloud-code-repo-acme/app'));

    fireEvent.changeText(getByTestId('new-cloud-code-task'), 'Add a dark mode toggle');
    fireEvent.press(getByTestId('new-cloud-code-repo-acme/app'));
    await act(async () => {
      fireEvent.press(getByTestId('new-cloud-code-start'));
    });

    expect(mockCloudCodeApi.create).toHaveBeenCalledWith({
      requestId: 'request-1',
      title: 'Add a dark mode toggle',
      repository: { installationId: 7, fullName: 'acme/app', branch: null },
      networkAccess: 'trusted',
    });
    expect(onCreated).toHaveBeenCalledWith(session, 'Add a dark mode toggle');
  });

  it('does not start without a task', async () => {
    const { getByTestId } = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={jest.fn()} />,
    );
    await act(async () => {
      fireEvent.press(getByTestId('new-cloud-code-start'));
    });
    expect(mockCloudCodeApi.create).not.toHaveBeenCalled();
  });

  it('connects GitHub in the app and reloads the repositories when it links', async () => {
    mockCloudCodeApi.listRepositories.mockResolvedValueOnce({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    });
    mockConnectGitHubInApp.mockResolvedValue('connected');
    const { getByText, getByTestId } = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={jest.fn()} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => getByText('Connect GitHub'));

    await act(async () => {
      fireEvent.press(getByText('Connect GitHub'));
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(mockConnectGitHubInApp).toHaveBeenCalledTimes(1);
    await waitFor(() => getByTestId('new-cloud-code-repo-acme/app'));
  });

  it('says why GitHub did not link and keeps the connect action', async () => {
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    });
    mockConnectGitHubInApp.mockResolvedValue('ownership_failed');
    const { getByText } = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={jest.fn()} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => getByText('Connect GitHub'));
    await act(async () => {
      fireEvent.press(getByText('Connect GitHub'));
    });

    expect(getByText('outcome:ownership_failed')).toBeTruthy();
    expect(getByText('Connect GitHub')).toBeTruthy();
  });
});
