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

const mockStartGitHubInstall = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('@/src/features/cloud-code/githubInstall', () => ({
  startGitHubInstallInApp: () => mockStartGitHubInstall(),
}));
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockRouterPush, replace: jest.fn(), back: jest.fn() }),
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

  it('sends an iOS GitHub return to the confirm screen instead of linking it', async () => {
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    });
    mockStartGitHubInstall.mockResolvedValue({
      kind: 'returned',
      result: { state: 'b'.repeat(64), code: 'one-time-code' },
    });
    const onClose = jest.fn();
    const { getByText } = render(
      <NewCloudCodeSessionSheet visible onClose={onClose} onCreated={jest.fn()} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => getByText('Connect GitHub'));
    await act(async () => {
      fireEvent.press(getByText('Connect GitHub'));
    });

    expect(onClose).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(app)/github/installed',
      params: { state: 'b'.repeat(64), code: 'one-time-code' },
    });
  });

  it('says so when GitHub could not be started and keeps the connect action', async () => {
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    });
    mockStartGitHubInstall.mockResolvedValue({ kind: 'failed' });
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

    expect(getByText('GitHub could not be connected')).toBeTruthy();
    expect(getByText('Connect GitHub')).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
