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
jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));
jest.mock('@/src/features/companion/remote-code/service', () => ({
  listCodeSessions: jest.fn(),
  startCodeSession: jest.fn(),
}));

import {
  NewCloudCodeSessionSheet,
  titleFromTask,
} from '@/src/features/cloud-code/components/NewCloudCodeSessionSheet';
import {
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

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
    invalidateCloudAccount();
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

  it('keeps a session created after the sheet was closed from navigating or starting its task', async () => {
    const session = { id: 'session-2', state: 'provisioning' };
    let finishCreate: (value: unknown) => void = () => undefined;
    mockCloudCodeApi.create.mockReturnValue(
      new Promise((resolve) => {
        finishCreate = resolve;
      }),
    );
    const onCreated = jest.fn();
    const onCreatedInBackground = jest.fn();
    const sheet = (visible: boolean) => (
      <NewCloudCodeSessionSheet
        visible={visible}
        onClose={jest.fn()}
        onCreated={onCreated}
        onCreatedInBackground={onCreatedInBackground}
      />
    );
    const { getByTestId, rerender } = render(sheet(true));

    fireEvent.changeText(getByTestId('new-cloud-code-task'), 'Add a dark mode toggle');
    await act(async () => {
      fireEvent.press(getByTestId('new-cloud-code-start'));
    });
    rerender(sheet(false));
    rerender(sheet(true));
    await act(async () => {
      finishCreate({ session, terminalEntries: [] });
    });

    expect(onCreated).not.toHaveBeenCalled();
    expect(onCreatedInBackground).toHaveBeenCalledWith(session);
  });

  it('sends the task to the background action and closes the sheet when explicitly selected', async () => {
    activateCloudAccount('fixture-account');
    const session = { id: 'stay-session', state: 'ready' };
    mockCloudCodeApi.create.mockResolvedValue({ session, terminalEntries: [] });
    const onClose = jest.fn();
    const onCreated = jest.fn();
    const onSendAndStay = jest.fn();
    const { getByTestId } = render(
      <NewCloudCodeSessionSheet
        visible
        onClose={onClose}
        onCreated={onCreated}
        onSendAndStay={onSendAndStay}
      />,
    );

    fireEvent.changeText(getByTestId('new-cloud-code-task'), 'Look over the README');
    await act(async () => {
      fireEvent.press(getByTestId('new-cloud-code-send-and-stay'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSendAndStay).toHaveBeenCalledWith(session, 'Look over the README');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('does not submit a created background task after the account changes', async () => {
    activateCloudAccount('fixture-account');
    let finishCreate!: (value: unknown) => void;
    mockCloudCodeApi.create.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCreate = resolve;
      }),
    );
    const onSendAndStay = jest.fn();
    const { getByTestId } = render(
      <NewCloudCodeSessionSheet
        visible
        onClose={jest.fn()}
        onCreated={jest.fn()}
        onSendAndStay={onSendAndStay}
      />,
    );
    fireEvent.changeText(getByTestId('new-cloud-code-task'), 'Look over the README');
    await act(async () => {
      fireEvent.press(getByTestId('new-cloud-code-send-and-stay'));
    });
    await act(async () => {
      activateCloudAccount('another-fixture-account');
      finishCreate({ session: { id: 'old-account-session', state: 'ready' } });
    });

    expect(onSendAndStay).not.toHaveBeenCalled();
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

  it('lists a harness with its summary and credential note without a stray full stop', async () => {
    const { getByText } = render(
      <NewCloudCodeSessionSheet
        visible
        onClose={jest.fn()}
        onCreated={jest.fn()}
        runtimes={[
          {
            id: 'droid',
            name: 'Droid',
            kind: 'harness',
            summary: 'Factory’s software engineering agent.',
            agentCommand: 'droid',
            cpuCount: 0,
            memoryMB: 0,
            diskSizeMB: 0,
            isPublic: true,
            needsUserCredential: true,
          },
        ]}
      />,
    );

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(
      getByText('Droid, Factory’s software engineering agent, needs your own API key'),
    ).toBeTruthy();
  });
});
