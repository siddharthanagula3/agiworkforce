import React from 'react';
import { Keyboard, RefreshControl } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockApi = {
  get: jest.fn(),
  listApprovals: jest.fn(),
  changes: jest.fn(),
  startAgentTurn: jest.fn(),
  cancelAgentTurn: jest.fn(),
};

jest.mock('@/src/features/cloud-code/service', () => ({
  get cloudCodeApi() {
    return mockApi;
  },
  CLOUD_CODE_OPEN_ERROR: 'open',
  CLOUD_CODE_SEND_ERROR: 'send',
  CLOUD_CODE_STOP_ERROR: 'stop',
  CLOUD_CODE_DECISION_ERROR: 'decision',
  CLOUD_CODE_UNARCHIVE_ERROR: 'unarchive',
  describeCloudCodeError: (_error: unknown, fallback: string) => fallback,
  isMissingCloudCodeSession: () => false,
  newCloudCodeIdempotencyKey: () => 'request-1',
}));

jest.mock('@/src/features/cloud-code/useCloudCodeAccess', () => ({
  useCloudCodeAccess: () => ({
    ready: true,
    signedIn: true,
    accountKey: 'account-1',
    activate: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    setParams: jest.fn(),
  }),
}));

jest.mock('@/src/lib/Capabilities', () => ({
  useCapability: () => false,
}));

import { CloudCodeSessionScreen } from '@/src/features/cloud-code/CloudCodeSessionScreen';
import { useCodePreferences } from '@/src/features/settings/code/store';

const session = {
  id: 'session-1',
  title: 'Fix parser',
  state: 'ready',
  archivedAt: null,
  runtimeId: null,
  repositoryUrl: 'https://github.com/acme/app',
  workingBranch: 'agi/work',
  baseBranch: 'main',
  repositoryBranch: 'main',
  pullRequestUrl: null,
  lastError: null,
  contextInputTokens: 40_000,
  contextOutputTokens: 2_000,
};

function turn(id: string) {
  return {
    turnId: id,
    goal: `goal ${id}`,
    mode: 'agent',
    stopReason: 'done',
    stepsUsed: 1,
    inputTokens: 0,
    outputTokens: 0,
    cancelRequestedAt: null,
    finalMessage: `reply ${id}`,
    errorMessage: null,
    createdAt: `2026-10-22T00:00:0${id}Z`,
    steps: [],
  };
}

function numberedTurn(n: number, open = false) {
  const id = String(n).padStart(2, '0');
  return {
    ...turn('1'),
    turnId: `turn-${id}`,
    goal: `goal ${id}`,
    finalMessage: `reply ${id}`,
    stopReason: open ? null : 'done',
    createdAt: `2026-10-22T00:${id}:00Z`,
  };
}

function detail(turns: ReturnType<typeof turn>[]) {
  return { session, terminalEntries: [], turns };
}

async function openSession() {
  const screen = render(<CloudCodeSessionScreen sessionId="session-1" />);
  await screen.findByText('reply 1');
  return screen;
}

async function sendMessage(screen: Awaited<ReturnType<typeof openSession>>, text: string) {
  fireEvent.changeText(screen.getByLabelText('Message for this session'), text);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Send to this session'));
  });
}

describe('AGI Code composer preferences in a session', () => {
  let dismiss: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    useCodePreferences.setState({ dismissKeyboardAfterSend: false, showContextUsage: true });
    mockApi.get.mockResolvedValue(detail([turn('1')]));
    mockApi.listApprovals.mockResolvedValue([]);
    mockApi.changes.mockResolvedValue({
      session,
      base: 'main',
      workingBranch: 'agi/work',
      files: [],
      diff: '',
      diffTruncated: false,
    });
  });

  afterEach(() => {
    dismiss.mockRestore();
  });

  it('shows Send only for a nonempty draft and shows Stop for an active turn', async () => {
    const screen = await openSession();
    const input = screen.getByLabelText('Message for this session');
    const send = () => screen.queryByRole('button', { name: 'Send to this session' });

    expect(send()).toBeNull();
    fireEvent.changeText(input, '  ');
    expect(send()).toBeNull();
    fireEvent.changeText(input, 'Read the notes.\nSummarize the changes.');
    expect(send()).toBeEnabled();
    fireEvent.changeText(input, '');
    expect(send()).toBeNull();

    mockApi.get.mockResolvedValue(detail([turn('1'), { ...turn('2'), stopReason: null }]));
    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    expect(await screen.findByRole('button', { name: 'Stop the task' })).toBeEnabled();
  });

  it('marks Stop unavailable during cancellation and restores it if cancellation fails', async () => {
    mockApi.get.mockResolvedValue(detail([turn('1'), { ...turn('2'), stopReason: null }]));
    let failCancellation!: (error: Error) => void;
    mockApi.cancelAgentTurn.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        failCancellation = reject;
      }),
    );
    const screen = await openSession();
    const stop = await screen.findByRole('button', { name: 'Stop the task' });
    fireEvent.press(stop);

    const stopping = screen.getByRole('button', { name: 'Stopping the task' });
    expect(stopping).toBeDisabled();
    expect(stopping).toHaveProp('accessibilityState', expect.objectContaining({ busy: true }));
    fireEvent.press(stopping);
    expect(mockApi.cancelAgentTurn).toHaveBeenCalledTimes(1);

    await act(async () => failCancellation(new Error('Stop could not reach the service')));
    expect(await screen.findByRole('button', { name: 'Stop the task' })).toBeEnabled();
  });

  it('shows a pending stop acknowledged by the server when reopening the session', async () => {
    mockApi.get.mockResolvedValue(
      detail([
        turn('1'),
        { ...turn('2'), stopReason: null, cancelRequestedAt: '2026-10-22T00:00:03Z' },
      ]),
    );
    const screen = await openSession();
    const stopping = await screen.findByRole('button', { name: 'Stopping the task' });

    expect(stopping).toBeDisabled();
    fireEvent.press(stopping);
    expect(mockApi.cancelAgentTurn).not.toHaveBeenCalled();
  });

  it('leaves the keyboard up after a send by default', async () => {
    mockApi.startAgentTurn.mockResolvedValue({});
    const screen = await openSession();

    await sendMessage(screen, 'first request');

    await waitFor(() => expect(mockApi.startAgentTurn).toHaveBeenCalledTimes(1));
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('dismisses the keyboard once the send is accepted when the switch is on', async () => {
    useCodePreferences.setState({ dismissKeyboardAfterSend: true });
    mockApi.startAgentTurn.mockResolvedValue({});
    const screen = await openSession();

    await sendMessage(screen, 'first request');

    await waitFor(() => expect(dismiss).toHaveBeenCalledTimes(1));
  });

  it('dismisses the keyboard when the turn starts although the request is still open', async () => {
    useCodePreferences.setState({ dismissKeyboardAfterSend: true });
    let finishSend!: () => void;
    mockApi.startAgentTurn.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSend = resolve;
        }),
    );
    const screen = await openSession();

    await sendMessage(screen, 'first request');
    expect(dismiss).not.toHaveBeenCalled();

    mockApi.get.mockResolvedValue(detail([turn('1'), { ...turn('2'), stopReason: null }]));
    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    await waitFor(() => expect(dismiss).toHaveBeenCalledTimes(1));
    await act(async () => finishSend());
  });

  it('dismisses the keyboard when a full window of turns slides to include the new one', async () => {
    useCodePreferences.setState({ dismissKeyboardAfterSend: true });
    let finishSend!: () => void;
    mockApi.startAgentTurn.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSend = resolve;
        }),
    );
    const firstWindow = Array.from({ length: 50 }, (_, index) => numberedTurn(index + 1));
    mockApi.get.mockResolvedValue(detail(firstWindow));
    const screen = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await screen.findByText('reply 50');

    await sendMessage(screen, 'next request');
    expect(dismiss).not.toHaveBeenCalled();

    const nextWindow = Array.from({ length: 50 }, (_, index) =>
      numberedTurn(index + 2, index === 49),
    );
    mockApi.get.mockResolvedValue(detail(nextWindow));
    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    await waitFor(() => expect(dismiss).toHaveBeenCalledTimes(1));
    await act(async () => finishSend());
  });

  it('keeps the keyboard up when the send is refused and the draft comes back', async () => {
    useCodePreferences.setState({ dismissKeyboardAfterSend: true });
    mockApi.startAgentTurn.mockRejectedValueOnce(new Error('rate limited'));
    const screen = await openSession();

    await sendMessage(screen, 'first request');

    await waitFor(() =>
      expect(screen.getByLabelText('Message for this session').props.value).toBe('first request'),
    );
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('shows the context percent in the composer by default', async () => {
    const screen = await openSession();

    expect(screen.getByText(/% context/)).toBeTruthy();
  });

  it('leaves the percent out of the composer when the switch is off', async () => {
    useCodePreferences.setState({ showContextUsage: false });
    const screen = await openSession();

    expect(screen.queryByText(/% context/)).toBeNull();
  });
});
