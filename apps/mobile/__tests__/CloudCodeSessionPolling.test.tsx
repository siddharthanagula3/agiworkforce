import { AppState } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

const mockApi = {
  get: jest.fn(),
  listApprovals: jest.fn(),
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

import { useCloudCodeSession } from '@/src/features/cloud-code/useCloudCodeSession';
import {
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

const POLL_INTERVAL_MS = 4_000;
const presetCurrentState: unknown = AppState.currentState;

const runningDetail = {
  session: {
    id: 'session-1',
    title: 'Fix parser',
    state: 'running',
    archivedAt: null,
    runtimeId: null,
    repositoryUrl: 'https://github.com/acme/app',
    workingBranch: 'agi/work',
    baseBranch: 'main',
    repositoryBranch: 'main',
    pullRequestUrl: null,
    lastError: null,
  },
  terminalEntries: [],
  turns: [],
};

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe('polling a busy Code session', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    mockApi.listApprovals.mockResolvedValue([]);
  });

  afterEach(() => {
    Object.defineProperty(AppState, 'currentState', {
      value: presetCurrentState,
      configurable: true,
    });
    jest.useRealTimers();
  });

  it('waits for a slow poll to answer before it asks again', async () => {
    let answerSlowPoll!: (value: typeof runningDetail) => void;
    mockApi.get
      .mockResolvedValueOnce(runningDetail)
      .mockReturnValueOnce(new Promise((resolve) => (answerSlowPoll = resolve)))
      .mockResolvedValue(runningDetail);

    const { result, unmount } = renderHook(() => useCloudCodeSession('session-1', 'model-1'));
    await advance(0);
    expect(result.current.status).toBe('ready');
    expect(mockApi.get).toHaveBeenCalledTimes(1);

    await advance(POLL_INTERVAL_MS);
    expect(mockApi.get).toHaveBeenCalledTimes(2);

    await advance(POLL_INTERVAL_MS * 3);
    expect(mockApi.get).toHaveBeenCalledTimes(2);

    await act(async () => {
      answerSlowPoll(runningDetail);
    });
    await advance(POLL_INTERVAL_MS - 1);
    expect(mockApi.get).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(mockApi.get).toHaveBeenCalledTimes(3);

    unmount();
  });

  it('asks nothing more once the screen closes during a poll', async () => {
    let answerSlowPoll!: (value: typeof runningDetail) => void;
    mockApi.get
      .mockResolvedValueOnce(runningDetail)
      .mockReturnValueOnce(new Promise((resolve) => (answerSlowPoll = resolve)))
      .mockResolvedValue(runningDetail);

    const { unmount } = renderHook(() => useCloudCodeSession('session-1', 'model-1'));
    await advance(0);
    await advance(POLL_INTERVAL_MS);
    expect(mockApi.get).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      answerSlowPoll(runningDetail);
    });
    await advance(POLL_INTERVAL_MS * 3);
    expect(mockApi.get).toHaveBeenCalledTimes(2);
  });

  it('keeps a task pending after the session reopens before the server records it', async () => {
    const readyDetail = {
      ...runningDetail,
      session: { ...runningDetail.session, state: 'ready' },
    };
    mockApi.get.mockResolvedValue(readyDetail);
    mockApi.cancelAgentTurn.mockResolvedValue({});
    let finishSend!: () => void;
    mockApi.startAgentTurn.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSend = resolve;
        }),
    );
    const first = renderHook(() => useCloudCodeSession('session-1', 'model-1'));
    await advance(0);
    let sent!: Promise<boolean>;
    act(() => {
      sent = first.result.current.send('Inspect the mobile fixture');
    });
    first.unmount();

    const reopened = renderHook(() => useCloudCodeSession('session-1', 'model-1'));
    await advance(0);
    expect(reopened.result.current.working).toBe(true);
    expect(reopened.result.current.pendingGoal).toBe('Inspect the mobile fixture');
    await act(async () => {
      expect(await reopened.result.current.send('Do not start a second turn')).toBe(false);
      reopened.result.current.stop();
      reopened.result.current.stop();
    });
    expect(mockApi.startAgentTurn).toHaveBeenCalledTimes(1);
    expect(mockApi.cancelAgentTurn).toHaveBeenCalledTimes(1);
    expect(mockApi.cancelAgentTurn).toHaveBeenCalledWith('session-1', undefined);

    await act(async () => {
      finishSend();
      await sent;
    });
    await advance(0);
    expect(reopened.result.current.pendingGoal).toBeNull();
    expect(reopened.result.current.working).toBe(false);
  });

  it('retires pending Code requests when the Cloud account changes', async () => {
    activateCloudAccount('fixture-owner-one');
    mockApi.get.mockResolvedValue({ ...runningDetail, turns: [] });
    let finishSend!: () => void;
    mockApi.startAgentTurn.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSend = resolve;
        }),
    );
    const session = renderHook(() => useCloudCodeSession('session-1', 'model-1'));
    await advance(0);
    let sent!: Promise<boolean>;
    act(() => {
      sent = session.result.current.send('A prompt from the first account');
    });
    const signal = mockApi.startAgentTurn.mock.calls.at(-1)?.[2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    expect(session.result.current.pendingGoal).toBe('A prompt from the first account');

    act(() => {
      activateCloudAccount('fixture-owner-two');
    });
    expect(signal.aborted).toBe(true);
    expect(session.result.current.pendingGoal).toBeNull();
    session.unmount();
    await act(async () => {
      finishSend();
      await sent;
    });
    invalidateCloudAccount();
  });
});
