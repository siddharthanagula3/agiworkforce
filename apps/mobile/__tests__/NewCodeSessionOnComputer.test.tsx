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
jest.mock('@/src/features/cloud-code/githubInstall', () => ({
  startGitHubInstallInApp: jest.fn(),
}));
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

const mockStartCodeSession = jest.fn();
jest.mock('@/src/features/companion/remote-code/service', () => ({
  listCodeSessions: jest.fn(async () => true),
  startCodeSession: (...args: unknown[]) => mockStartCodeSession(...args),
}));

import { NewCloudCodeSessionSheet } from '@/src/features/cloud-code/components/NewCloudCodeSessionSheet';
import {
  beginCodeSessionStart,
  ingestRemoteCodeControl,
  useRemoteCodeStore,
} from '@/src/features/companion/remote-code/store';
import { useConnectionStore } from '@/stores/connectionStore';

const SENT_AT = '2026-09-17T12:00:00.000Z';

function pairComputer(status: 'connected' | 'disconnected' = 'connected') {
  useConnectionStore.setState({
    status,
    desktopName: 'Studio',
    desktopMetadata: { capabilities: ['code-sessions'] } as never,
  });
  ingestRemoteCodeControl('code.sessions', {
    action: 'code.sessions',
    version: 1,
    sessions: [],
    unavailable: [],
    roots: [
      { rootId: 'root-1', name: 'api', branch: 'main', available: true },
      { rootId: 'root-2', name: 'web', branch: null, available: true },
      { rootId: 'root-3', name: 'asleep', branch: null, available: false },
    ],
    syncedAt: SENT_AT,
  });
}

function sheet(onStartedOnComputer?: (rootId: string, threadId: string) => void) {
  return render(
    <NewCloudCodeSessionSheet
      visible
      onClose={jest.fn()}
      onCreated={jest.fn()}
      {...(onStartedOnComputer ? { onStartedOnComputer } : {})}
    />,
  );
}

describe('starting a session on the paired computer from the new session sheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRemoteCodeStore.getState().reset();
    useConnectionStore.setState({
      status: 'disconnected',
      desktopName: null,
      desktopMetadata: null,
    });
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    });
    mockCloudCodeApi.listBranches.mockResolvedValue({ branches: [], truncated: false });
    mockStartCodeSession.mockImplementation(async (rootId: string) => {
      beginCodeSessionStart('start-1', rootId);
      return 'start-1';
    });
  });

  it('offers only the cloud when no computer is connected', async () => {
    pairComputer('disconnected');
    const view = sheet(jest.fn());

    await waitFor(() => expect(view.getByText('New cloud session')).toBeTruthy());
    expect(view.queryByText('Where it runs')).toBeNull();
    expect(view.queryByText('On Studio')).toBeNull();
  });

  it('starts in the chosen folder and opens the session the computer reports', async () => {
    pairComputer();
    const onStarted = jest.fn();
    const view = sheet(onStarted);

    expect(await view.findByText('Where it runs')).toBeTruthy();
    expect(view.getByText('Repository')).toBeTruthy();
    fireEvent.press(view.getByTestId('new-code-session-on-computer'));
    expect(view.queryByText('Repository')).toBeNull();
    expect(view.queryByText('Network access')).toBeNull();
    expect(view.queryByText('asleep')).toBeNull();

    fireEvent.press(view.getByLabelText('web'));
    fireEvent.changeText(view.getByTestId('new-cloud-code-task'), ' fix the build ');
    fireEvent.press(view.getByTestId('new-cloud-code-start'));
    await waitFor(() =>
      expect(mockStartCodeSession).toHaveBeenCalledWith('root-2', 'fix the build'),
    );
    expect(mockCloudCodeApi.create).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();

    act(() => {
      ingestRemoteCodeControl('code.session.started', {
        action: 'code.session.started',
        version: 1,
        requestId: 'start-1',
        rootId: 'root-2',
        threadId: 'thread-9',
        error: null,
        sentAt: SENT_AT,
      });
    });
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('root-2', 'thread-9'));
    expect(useRemoteCodeStore.getState().starts).toEqual({});
  });

  it('shows why the computer did not start it and lets the task be sent again', async () => {
    pairComputer();
    const onStarted = jest.fn();
    const view = sheet(onStarted);

    fireEvent.press(await view.findByTestId('new-code-session-on-computer'));
    fireEvent.changeText(view.getByTestId('new-cloud-code-task'), 'fix the build');
    fireEvent.press(view.getByTestId('new-cloud-code-start'));
    await waitFor(() =>
      expect(mockStartCodeSession).toHaveBeenCalledWith('root-1', 'fix the build'),
    );

    act(() => {
      ingestRemoteCodeControl('code.session.started', {
        action: 'code.session.started',
        version: 1,
        requestId: 'start-1',
        rootId: 'root-1',
        threadId: null,
        error: 'That folder is not approved for remote sessions.',
        sentAt: SENT_AT,
      });
    });

    expect(await view.findByText('That folder is not approved for remote sessions.')).toBeTruthy();
    expect(onStarted).not.toHaveBeenCalled();
    expect(view.getByTestId('new-cloud-code-task').props.value).toBe('fix the build');
  });

  it('says so when the request never left the phone', async () => {
    pairComputer();
    mockStartCodeSession.mockResolvedValue(null);
    const view = sheet(jest.fn());

    fireEvent.press(await view.findByTestId('new-code-session-on-computer'));
    fireEvent.changeText(view.getByTestId('new-cloud-code-task'), 'fix the build');
    fireEvent.press(view.getByTestId('new-cloud-code-start'));

    expect(
      await view.findByText(
        'The session was not started. Check the Desktop connection and try again.',
      ),
    ).toBeTruthy();
  });
});
