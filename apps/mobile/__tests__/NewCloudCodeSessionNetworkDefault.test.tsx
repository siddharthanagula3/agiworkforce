import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

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
jest.mock('@/src/features/companion/remote-code/service', () => ({
  listCodeSessions: jest.fn(),
  startCodeSession: jest.fn(),
}));
jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

import { NewCloudCodeSessionSheet } from '@/src/features/cloud-code/components/NewCloudCodeSessionSheet';
import { useCodePreferences } from '@/src/features/settings/code/store';

const session = { id: 'session-1', state: 'provisioning' };

async function startWith(
  screen: ReturnType<typeof render>,
  onCreated: jest.Mock,
  task = 'Fix the build',
) {
  fireEvent.changeText(screen.getByTestId('new-cloud-code-task'), task);
  await act(async () => {
    fireEvent.press(screen.getByTestId('new-cloud-code-start'));
  });
  return onCreated;
}

describe('new cloud session network access', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    });
    mockCloudCodeApi.listBranches.mockResolvedValue({ branches: [], truncated: false });
    mockCloudCodeApi.create.mockResolvedValue({ session, terminalEntries: [] });
    useCodePreferences.setState({ defaultNetworkAccess: 'trusted' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts from the saved default', async () => {
    useCodePreferences.setState({ defaultNetworkAccess: 'none' });
    const onCreated = jest.fn();
    const screen = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />,
    );

    await startWith(screen, onCreated);

    expect(mockCloudCodeApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ networkAccess: 'none' }),
    );
  });

  it('follows a default changed while the sheet stays mounted', async () => {
    const onCreated = jest.fn();
    const screen = render(
      <NewCloudCodeSessionSheet visible={false} onClose={jest.fn()} onCreated={onCreated} />,
    );

    act(() => {
      useCodePreferences.setState({ defaultNetworkAccess: 'none' });
    });
    screen.rerender(<NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />);
    await startWith(screen, onCreated);

    expect(mockCloudCodeApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ networkAccess: 'none' }),
    );
  });

  it('keeps a choice made in the sheet over a later default', async () => {
    const onCreated = jest.fn();
    const screen = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />,
    );

    fireEvent.press(screen.getByLabelText(/^Isolated\./));
    act(() => {
      useCodePreferences.setState({ defaultNetworkAccess: 'full' });
    });
    await startWith(screen, onCreated);

    expect(mockCloudCodeApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ networkAccess: 'none' }),
    );
  });

  it('still needs the acknowledgement when the default is Full internet', async () => {
    useCodePreferences.setState({ defaultNetworkAccess: 'full' });
    const onCreated = jest.fn();
    const screen = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />,
    );

    await startWith(screen, onCreated);

    expect(mockCloudCodeApi.create).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(false);

    fireEvent.press(screen.getByRole('checkbox'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('new-cloud-code-start'));
    });

    expect(mockCloudCodeApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ networkAccess: 'full', fullNetworkAcknowledged: true }),
    );
  });

  it('asks for the acknowledgement again on the next session', async () => {
    useCodePreferences.setState({ defaultNetworkAccess: 'full' });
    const onCreated = jest.fn();
    const screen = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />,
    );
    fireEvent.press(screen.getByRole('checkbox'));
    await startWith(screen, onCreated);
    expect(mockCloudCodeApi.create).toHaveBeenCalledTimes(1);

    await startWith(screen, onCreated, 'Another task');

    expect(mockCloudCodeApi.create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(false);
  });

  it('moves an Isolated default to Trusted hosts when a repository URL is entered', async () => {
    useCodePreferences.setState({ defaultNetworkAccess: 'none' });
    const onCreated = jest.fn();
    const screen = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />,
    );

    fireEvent.press(screen.getByText('Use a public repository URL'));
    fireEvent.changeText(
      screen.getByLabelText('Repository URL'),
      'https://github.com/owner/repository',
    );
    await startWith(screen, onCreated);

    expect(mockCloudCodeApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ networkAccess: 'trusted' }),
    );
  });

  it('does not clear a repository choice with an Isolated default set while closed', async () => {
    const repository = {
      installationId: 1,
      fullName: 'owner/repository',
      isPrivate: false,
    };
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [repository],
      installationCount: 1,
      truncated: false,
      unreachable: [],
    });
    const onCreated = jest.fn();
    const screen = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />,
    );
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    fireEvent.press(screen.getByTestId('new-cloud-code-repo-owner/repository'));
    screen.rerender(
      <NewCloudCodeSessionSheet visible={false} onClose={jest.fn()} onCreated={onCreated} />,
    );

    act(() => {
      useCodePreferences.setState({ defaultNetworkAccess: 'none' });
    });
    screen.rerender(<NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />);
    await startWith(screen, onCreated);

    expect(mockCloudCodeApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ networkAccess: 'trusted' }),
    );
  });

  it('drops an acknowledgement given under an earlier Full internet default', async () => {
    useCodePreferences.setState({ defaultNetworkAccess: 'full' });
    const onCreated = jest.fn();
    const screen = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />,
    );
    fireEvent.press(screen.getByRole('checkbox'));

    act(() => {
      useCodePreferences.setState({ defaultNetworkAccess: 'trusted' });
    });
    act(() => {
      useCodePreferences.setState({ defaultNetworkAccess: 'full' });
    });
    await startWith(screen, onCreated);

    expect(mockCloudCodeApi.create).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(false);
  });
});
