import { AppState } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

const mockApi = {
  get: jest.fn(),
  listApprovals: jest.fn(),
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
});
