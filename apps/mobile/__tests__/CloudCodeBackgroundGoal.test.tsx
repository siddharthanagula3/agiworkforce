import { act, renderHook } from '@testing-library/react-native';
import type { CloudCodeSession } from '@agiworkforce/types';
import {
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { startBackgroundCloudCodeGoal } from '@/src/features/cloud-code/backgroundCloudCodeGoal';
import { useCloudCodeRequests } from '@/src/features/cloud-code/cloudCodeRequests';

const mockApi = { get: jest.fn(), startAgentTurn: jest.fn() };

jest.mock('@/src/features/cloud-code/service', () => ({
  get cloudCodeApi() {
    return mockApi;
  },
  CLOUD_CODE_SEND_ERROR: 'Send failed',
  newCloudCodeIdempotencyKey: () => 'request-1',
  describeCloudCodeError: (_error: unknown, fallback: string) => fallback,
}));

const session = {
  id: 'fixture-session',
  state: 'provisioning',
  lastError: null,
} as CloudCodeSession;

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  activateCloudAccount('fixture-account');
});

afterEach(() => {
  invalidateCloudAccount();
  jest.useRealTimers();
});

it('waits for the workspace, then sends exactly one turn', async () => {
  mockApi.get
    .mockResolvedValueOnce({ session })
    .mockResolvedValueOnce({ session: { ...session, state: 'ready' } });
  mockApi.startAgentTurn.mockResolvedValue({});
  const { result } = renderHook(useCloudCodeRequests);
  let completion!: Promise<void>;
  await act(async () => {
    completion = startBackgroundCloudCodeGoal(session, 'Inspect the README', 'model');
  });

  expect(result.current.pending.get(session.id)?.kind).toBe('send');
  expect(mockApi.startAgentTurn).not.toHaveBeenCalled();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1_000);
    await completion;
  });

  expect(mockApi.startAgentTurn).toHaveBeenCalledTimes(1);
  expect(mockApi.startAgentTurn).toHaveBeenCalledWith(
    session.id,
    { goal: 'Inspect the README', model: 'model', idempotencyKey: 'request-1' },
    expect.anything(),
  );
  expect(result.current.pending.has(session.id)).toBe(false);
});

it('keeps a refused prompt available when session provisioning fails', async () => {
  mockApi.get.mockResolvedValue({
    session: { ...session, state: 'failed', lastError: 'Could not prepare the workspace' },
  });
  const { result } = renderHook(useCloudCodeRequests);
  await act(async () => startBackgroundCloudCodeGoal(session, 'Inspect the README', 'model'));

  expect(mockApi.startAgentTurn).not.toHaveBeenCalled();
  expect(result.current.refused.get(session.id)).toEqual({
    goal: 'Inspect the README',
    message: 'Could not prepare the workspace',
  });
});

it('retires a waiting task before provisioning can finish on another account', async () => {
  mockApi.get.mockResolvedValue({ session });
  const { result } = renderHook(useCloudCodeRequests);
  let completion!: Promise<void>;
  await act(async () => {
    completion = startBackgroundCloudCodeGoal(session, 'Inspect the README', 'model');
  });
  await act(async () => {
    activateCloudAccount('another-fixture-account');
    await jest.advanceTimersByTimeAsync(1_000);
    await completion;
  });

  expect(mockApi.get).toHaveBeenCalledTimes(1);
  expect(mockApi.startAgentTurn).not.toHaveBeenCalled();
  expect(result.current.pending.size).toBe(0);
  expect(result.current.refused.size).toBe(0);
});
