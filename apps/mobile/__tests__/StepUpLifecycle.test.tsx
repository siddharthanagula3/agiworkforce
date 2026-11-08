import { act, renderHook } from '@testing-library/react-native';
import type { ReactElement } from 'react';

const mockSession = { id: 'session-a', user: { id: 'account-a' } };
let mockSessionCurrent = true;
let mockEpochCurrent = true;
const mockListeners = new Set<() => void>();
const mockToken = jest.fn();
const mockGrant = jest.fn();
const mockConsequence = jest.fn();

jest.mock('@clerk/expo', () => ({ useSession: () => ({ session: mockSession }) }));
jest.mock('../src/features/auth/components/StepUpModal', () => ({ StepUpModal: () => null }));
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  subscribeCloudAccountEpochChange: (listener: () => void) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  },
}));
jest.mock('../src/features/auth/services/stepUp', () => {
  class StepUpCancelledError extends Error {}
  return {
    STEP_UP_TOKEN_HEADER: 'x-step-up-token',
    StepUpCancelledError,
    captureStepUpIdentity: () => ({
      session: mockSession,
      account: { ownerId: 'account-a', epoch: 1 },
      isCurrent: () => mockSessionCurrent && mockEpochCurrent,
    }),
    currentSessionToken: (...args: unknown[]) => mockToken(...args),
    requestStepUpGrant: (...args: unknown[]) => mockGrant(...args),
    readStepUpConsequence: (...args: unknown[]) => mockConsequence(...args),
    isStepUpRequired: (error: unknown) => error === 'step-up-required',
  };
});

import { useStepUp } from '../src/features/auth/hooks/useStepUp';
import { StepUpCancelledError } from '../src/features/auth/services/stepUp';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function props(modal: ReactElement | null) {
  return modal!.props as {
    onSatisfied: (token: string) => void;
    onCancel: () => void;
    challenge: { action: string };
  };
}
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.clear();
  mockEpochCurrent = true;
  mockSessionCurrent = true;
  mockToken.mockResolvedValue('fixture-session-token');
  mockGrant.mockResolvedValue({ kind: 'verify', level: 'second_factor' });
  mockConsequence.mockResolvedValue('Fixture consequence');
});

test('independent challenge owners keep distinct modal identities and proofs', async () => {
  const { result } = renderHook(() => ({ first: useStepUp(), second: useStepUp() }));
  const firstSend = jest
    .fn()
    .mockRejectedValueOnce('step-up-required')
    .mockResolvedValueOnce('first');
  const secondSend = jest
    .fn()
    .mockRejectedValueOnce('step-up-required')
    .mockResolvedValueOnce('second');
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => {
    first = result.current.first.withStepUp('password.change', null, firstSend);
    second = result.current.second.withStepUp('two_factor.disable', null, secondSend);
  });
  await flush();
  expect(result.current.first.modal).not.toBeNull();
  expect(result.current.second.modal).not.toBeNull();
  expect(result.current.first.modal!.key).not.toBe(result.current.second.modal!.key);
  const firstModal = props(result.current.first.modal);
  const secondModal = props(result.current.second.modal);
  await act(async () => {
    firstModal.onSatisfied('first-proof');
    await first;
  });
  expect(result.current.first.modal).toBeNull();
  expect(result.current.second.modal).not.toBeNull();
  await act(async () => {
    secondModal.onSatisfied('second-proof');
    await second;
  });
  expect(firstSend).toHaveBeenLastCalledWith({ 'x-step-up-token': 'first-proof' });
  expect(secondSend).toHaveBeenLastCalledWith({ 'x-step-up-token': 'second-proof' });
  expect(result.current.second.modal).toBeNull();
});

test('an older acquisition cannot replace the newer challenge or settle its retry', async () => {
  const oldToken = deferred<string>();
  mockToken.mockReturnValueOnce(oldToken.promise);
  const { result } = renderHook(useStepUp);
  const oldSend = jest.fn().mockRejectedValue('step-up-required');
  const newSend = jest
    .fn()
    .mockRejectedValueOnce('step-up-required')
    .mockResolvedValue('new-result');
  let old!: Promise<unknown>;
  let newer!: Promise<unknown>;
  act(() => {
    old = result.current.withStepUp('password.change', null, oldSend).catch((error) => error);
  });
  await flush();
  act(() => {
    newer = result.current.withStepUp('two_factor.disable', null, newSend);
  });
  await flush();
  expect(props(result.current.modal).challenge.action).toBe('two_factor.disable');
  await act(async () => {
    oldToken.resolve('fixture-old-token');
    await old;
  });
  expect(await old).toBeInstanceOf(StepUpCancelledError);
  expect(props(result.current.modal).challenge.action).toBe('two_factor.disable');
  await act(async () => {
    props(result.current.modal).onSatisfied('fixture-new-grant');
    await newer;
  });
  expect(newSend).toHaveBeenLastCalledWith({ 'x-step-up-token': 'fixture-new-grant' });
  expect(oldSend).toHaveBeenCalledTimes(1);
});

test('retained modal callbacks cannot settle a replacement pending attempt', async () => {
  const { result } = renderHook(useStepUp);
  const firstSend = jest.fn().mockRejectedValue('step-up-required');
  const secondSend = jest.fn().mockRejectedValueOnce('step-up-required').mockResolvedValue('done');
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => {
    first = result.current.withStepUp('password.change', null, firstSend).catch((error) => error);
  });
  await flush();
  const retained = props(result.current.modal);
  act(() => {
    second = result.current.withStepUp('two_factor.disable', null, secondSend);
  });
  await flush();
  act(() => {
    retained.onSatisfied('fixture-stale-grant');
    retained.onCancel();
  });
  expect(props(result.current.modal).challenge.action).toBe('two_factor.disable');
  expect(secondSend).toHaveBeenCalledTimes(1);
  await act(async () => {
    props(result.current.modal).onSatisfied('fixture-current-grant');
    await second;
    await first;
  });
});

test('unmount during token acquisition cannot dispatch a grant or resurrect a modal', async () => {
  const token = deferred<string>();
  mockToken.mockReturnValue(token.promise);
  const { result, unmount } = renderHook(useStepUp);
  const send = jest.fn().mockRejectedValue('step-up-required');
  const pending = result.current.withStepUp('password.change', null, send).catch((error) => error);
  await flush();
  unmount();
  await act(async () => {
    token.resolve('fixture-token');
    await pending;
  });
  expect(await pending).toBeInstanceOf(StepUpCancelledError);
  expect(mockGrant).not.toHaveBeenCalled();
});

test('account invalidation retires a pending challenge without mutation retry', async () => {
  const { result } = renderHook(useStepUp);
  const send = jest.fn().mockRejectedValue('step-up-required');
  const pending = result.current.withStepUp('password.change', null, send).catch((error) => error);
  await flush();
  await act(async () => {
    mockEpochCurrent = false;
    for (const listener of mockListeners) listener();
    await pending;
  });
  expect(result.current.modal).toBeNull();
  expect(send).toHaveBeenCalledTimes(1);
});

test('replacement preserves an already-dispatched initial mutation outcome', async () => {
  const dispatched = deferred<string>();
  const { result } = renderHook(useStepUp);
  const first = result.current.withStepUp('password.change', null, () => dispatched.promise);
  await act(async () => {
    await result.current.withStepUp('two_factor.disable', null, async () => 'second');
    dispatched.resolve('original-success');
    await expect(first).resolves.toBe('original-success');
  });
});

test('replacement preserves an already-dispatched retry failure as unknown, not cancelled', async () => {
  const dispatched = deferred<string>();
  const failure = new Error('connection lost after dispatch');
  const send = jest
    .fn()
    .mockRejectedValueOnce('step-up-required')
    .mockReturnValueOnce(dispatched.promise);
  const { result } = renderHook(useStepUp);
  const first = result.current.withStepUp('password.change', null, send).catch((error) => error);
  await flush();
  act(() => props(result.current.modal).onSatisfied('fixture-grant'));
  await flush();
  await act(async () => {
    await result.current.withStepUp('two_factor.disable', null, async () => 'second');
    dispatched.reject(failure);
    expect(await first).toBe(failure);
  });
});
