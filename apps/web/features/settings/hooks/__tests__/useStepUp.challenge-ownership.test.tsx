import { createRequestAuthority } from '@/lib/identity/request-authority';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useEffect, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepUpDialogProps } from '@/features/auth/StepUpDialog';
import type { IdentityReverificationStep } from '@/lib/identity/client';

const { requestGrant, reverification } = vi.hoisted(() => ({
  requestGrant: vi.fn(),
  reverification: {
    start: vi.fn(),
    sendEmailCode: vi.fn(),
    verifyPassword: vi.fn(),
    verifyEmailCode: vi.fn(),
    verifyPasskey: vi.fn(),
    verifySecondFactor: vi.fn(),
    freshToken: vi.fn(),
  },
}));

vi.mock('@/features/auth/step-up-fetch', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  requestStepUpGrant: requestGrant,
}));
vi.mock('@/lib/identity/client', () => ({
  useSessionReverification: () => reverification,
  useSignOut: () => vi.fn(),
}));

import {
  isStepUpCancelled,
  STEP_UP_TOKEN_HEADER,
  type StepUpGrantOutcome,
} from '@/features/auth/step-up-fetch';
import { useStepUp } from '../useStepUp';

function refusal(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'STEP_UP_REQUIRED',
        details: {
          action: 'organization.transfer_ownership',
          consequence: 'Ownership moves to another member.',
          freshnessSeconds: 300,
        },
      },
    }),
    { status: 403 },
  );
}

function sender() {
  return vi
    .fn<(headers: Record<string, string>) => Promise<Response>>()
    .mockImplementationOnce(async () => refusal())
    .mockImplementation(async () => new Response('{}', { status: 200 }));
}

function dialog(element: ReactElement | null): ReactElement<StepUpDialogProps> {
  expect(element).not.toBeNull();
  return element as ReactElement<StepUpDialogProps>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  requestGrant.mockReset();
  requestGrant.mockResolvedValue({ kind: 'verify', level: 'second_factor', message: 'Confirm.' });
  for (const mock of Object.values(reverification)) mock.mockReset();
  reverification.start.mockResolvedValue({ kind: 'second_factor', methods: ['authenticator'] });
  reverification.freshToken.mockResolvedValue('fresh-session-token');
});

afterEach(cleanup);

describe('useStepUp hook lifetime', () => {
  it.each<StepUpGrantOutcome>([
    { kind: 'granted', token: 'late-grant' },
    { kind: 'verify', level: 'second_factor', message: 'Confirm.' },
    { kind: 'failed', message: 'Try again.' },
  ])('retires a delayed silent $kind outcome without replay or a new waiter', async (outcome) => {
    const grant = deferred<StepUpGrantOutcome>();
    requestGrant.mockReturnValueOnce(grant.promise);
    const { result, unmount } = renderHook(useStepUp);
    const send = sender();
    const operation = result.current.withStepUp(send).catch((error: unknown) => error);
    await waitFor(() => expect(requestGrant).toHaveBeenCalledTimes(1));
    expect(result.current.dialog).toBeNull();
    unmount();
    grant.resolve(outcome);
    expect(isStepUpCancelled(await operation)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(requestGrant).toHaveBeenCalledTimes(1);
  });

  it('preserves the exact delayed silent-grant rejection after retirement', async () => {
    const grant = deferred<StepUpGrantOutcome>();
    requestGrant.mockReturnValueOnce(grant.promise);
    const { result, unmount } = renderHook(useStepUp);
    const send = sender();
    const operation = result.current.withStepUp(send).catch((error: unknown) => error);
    await waitFor(() => expect(requestGrant).toHaveBeenCalledTimes(1));
    unmount();
    const failure = new Error('Grant response lost');
    grant.reject(failure);
    expect(await operation).toBe(failure);
    expect(isStepUpCancelled(failure)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('blocks replay when cleanup follows silent satisfaction in the microtask queue', async () => {
    const grant = deferred<StepUpGrantOutcome>();
    requestGrant.mockReturnValueOnce(grant.promise);
    const { result, unmount } = renderHook(useStepUp);
    const send = sender();
    const operation = result.current.withStepUp(send).catch((error: unknown) => error);
    await waitFor(() => expect(requestGrant).toHaveBeenCalledTimes(1));
    grant.resolve({ kind: 'granted', token: 'grant-before-cleanup' });
    // The satisfier resumes first, then cleanup, then fetchWithStepUp's replay.
    queueMicrotask(unmount);
    expect(isStepUpCancelled(await operation)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not start a grant when the first refusal arrives after retirement', async () => {
    const first = deferred<Response>();
    const send = vi.fn(() => first.promise);
    const { result, unmount } = renderHook(useStepUp);
    const operation = result.current.withStepUp(send).catch((error: unknown) => error);
    expect(send).toHaveBeenCalledTimes(1);
    unmount();
    first.resolve(refusal());
    expect(isStepUpCancelled(await operation)).toBe(true);
    expect(requestGrant).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not start a grant when refusal body parsing finishes after retirement', async () => {
    const parsed = deferred<unknown>();
    const response = refusal();
    const clone = response.clone();
    const json = vi.spyOn(clone, 'json').mockReturnValue(parsed.promise);
    vi.spyOn(response, 'clone').mockReturnValue(clone);
    const send = vi.fn(async () => response);
    const { result, unmount } = renderHook(useStepUp);
    const operation = result.current.withStepUp(send).catch((error: unknown) => error);
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    unmount();
    parsed.resolve(await refusal().json());
    expect(isStepUpCancelled(await operation)).toBe(true);
    expect(requestGrant).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects a saved callback invoked after actual unmount before calling its sender', async () => {
    const { result, unmount } = renderHook(useStepUp);
    const saved = result.current.withStepUp;
    unmount();
    const send = sender();
    await expect(saved(send)).rejects.toSatisfy(isStepUpCancelled);
    expect(send).not.toHaveBeenCalled();
    expect(requestGrant).not.toHaveBeenCalled();
  });

  it('preserves an ordinary refusal whose body finishes parsing after retirement', async () => {
    const parsed = deferred<unknown>();
    const response = new Response('{}', { status: 403 });
    const clone = response.clone();
    const json = vi.spyOn(clone, 'json').mockReturnValue(parsed.promise);
    vi.spyOn(response, 'clone').mockReturnValue(clone);
    const send = vi.fn(async () => response);
    const { result, unmount } = renderHook(useStepUp);
    const operation = result.current.withStepUp(send);
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    unmount();
    parsed.resolve({ error: { code: 'FORBIDDEN' } });
    expect(await operation).toBe(response);
    expect(requestGrant).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('blocks replay when cleanup occurs after satisfaction but before its continuation', async () => {
    const { result, unmount } = renderHook(useStepUp);
    const send = sender();
    const operation = result.current.withStepUp(send).catch((error: unknown) => error);
    await waitFor(() => expect(result.current.dialog).not.toBeNull());
    const installed = dialog(result.current.dialog);
    act(() => {
      void installed.props.onSatisfied('grant-before-cleanup');
      unmount();
    });
    expect(isStepUpCancelled(await operation)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['initial', 'proof'] as const)(
    'preserves the already-invoked %s sender response after retirement',
    async (stage) => {
      requestGrant.mockResolvedValue({ kind: 'granted', token: 'grant' });
      const sent = deferred<Response>();
      const send = vi.fn<(headers: Record<string, string>) => Promise<Response>>();
      if (stage === 'proof') send.mockResolvedValueOnce(refusal());
      send.mockImplementation(() => sent.promise);
      const { result, unmount } = renderHook(useStepUp);
      const operation = result.current.withStepUp(send);
      await waitFor(() => expect(send).toHaveBeenCalledTimes(stage === 'proof' ? 2 : 1));
      unmount();
      const response = new Response('{}', { status: 200 });
      sent.resolve(response);
      expect(await operation).toBe(response);
    },
  );

  it.each(['initial', 'proof'] as const)(
    'preserves the exact already-invoked %s sender error after retirement',
    async (stage) => {
      requestGrant.mockResolvedValue({ kind: 'granted', token: 'grant' });
      const sent = deferred<Response>();
      const send = vi.fn<(headers: Record<string, string>) => Promise<Response>>();
      if (stage === 'proof') send.mockResolvedValueOnce(refusal());
      send.mockImplementation(() => sent.promise);
      const { result, unmount } = renderHook(useStepUp);
      const operation = result.current.withStepUp(send).catch((error: unknown) => error);
      await waitFor(() => expect(send).toHaveBeenCalledTimes(stage === 'proof' ? 2 : 1));
      unmount();
      const uncertain = new Error('Connection lost after dispatch');
      sent.reject(uncertain);
      expect(await operation).toBe(uncertain);
      expect(isStepUpCancelled(uncertain)).toBe(false);
    },
  );

  it('keeps pre-cleanup invocations retired through real StrictMode effect re-setup', async () => {
    const oldResponse = deferred<Response>();
    const oldSend = vi.fn(() => oldResponse.promise);
    const newSend = sender();
    requestGrant.mockResolvedValue({ kind: 'granted', token: 'new-lifetime-grant' });
    const operations: Promise<unknown>[] = [];
    const callbacks: ReturnType<typeof useStepUp>['withStepUp'][] = [];
    function Consumer() {
      const { withStepUp, dialog: challenge } = useStepUp();
      useEffect(() => {
        callbacks.push(withStepUp);
        operations.push(
          withStepUp(operations.length === 0 ? oldSend : newSend).catch((error: unknown) => error),
        );
      }, [withStepUp]);
      return challenge;
    }
    render(
      <StrictMode>
        <Consumer />
      </StrictMode>,
    );
    await waitFor(() => expect(newSend).toHaveBeenCalledTimes(2));
    expect(operations).toHaveLength(2);
    expect(callbacks[0]).toBe(callbacks[1]);
    expect(await operations[1]).toHaveProperty('status', 200);
    oldResponse.resolve(refusal());
    expect(isStepUpCancelled(await operations[0])).toBe(true);
    expect(oldSend).toHaveBeenCalledTimes(1);
    expect(requestGrant).toHaveBeenCalledTimes(1);
    expect(newSend).toHaveBeenLastCalledWith({ [STEP_UP_TOKEN_HEADER]: 'new-lifetime-grant' });
  });

  it('allows independent silent grants to replay out of invocation order', async () => {
    const firstGrant = deferred<StepUpGrantOutcome>();
    const secondGrant = deferred<StepUpGrantOutcome>();
    requestGrant.mockReturnValueOnce(firstGrant.promise).mockReturnValueOnce(secondGrant.promise);
    const { result } = renderHook(useStepUp);
    const firstSend = sender();
    const first = result.current.withStepUp(firstSend, 'org-1');
    await waitFor(() => expect(requestGrant).toHaveBeenCalledTimes(1));
    const secondSend = sender();
    const second = result.current.withStepUp(secondSend, 'org-2');
    await waitFor(() => expect(requestGrant).toHaveBeenCalledTimes(2));
    secondGrant.resolve({ kind: 'granted', token: 'second-grant' });
    expect((await second).status).toBe(200);
    expect(firstSend).toHaveBeenCalledTimes(1);
    firstGrant.resolve({ kind: 'granted', token: 'first-grant' });
    expect((await first).status).toBe(200);
    expect(firstSend).toHaveBeenCalledTimes(2);
    expect(secondSend).toHaveBeenCalledTimes(2);
    expect(firstSend).toHaveBeenLastCalledWith({ [STEP_UP_TOKEN_HEADER]: 'first-grant' });
    expect(secondSend).toHaveBeenLastCalledWith({ [STEP_UP_TOKEN_HEADER]: 'second-grant' });
    expect(result.current.dialog).toBeNull();
  });
});

describe('useStepUp exact pending challenge ownership', () => {
  it('cancels a replaced waiter and ignores its saved callbacks, even for an identical challenge', async () => {
    const { result } = renderHook(useStepUp);
    const firstSend = sender();
    const secondSend = sender();
    const first = result.current.withStepUp(firstSend, 'org-1').catch((error: unknown) => error);
    await waitFor(() => expect(result.current.dialog).not.toBeNull());
    const old = dialog(result.current.dialog);

    const second = result.current.withStepUp(secondSend, 'org-1');
    await waitFor(() => expect(result.current.dialog?.key).not.toBe(old.key));
    const replacement = dialog(result.current.dialog);
    expect(isStepUpCancelled(await first)).toBe(true);
    expect(firstSend).toHaveBeenCalledTimes(1);

    act(() => {
      old.props.onCancel();
      void old.props.onSatisfied('stale-grant');
    });
    expect(result.current.dialog).toBe(replacement);
    expect(secondSend).toHaveBeenCalledTimes(1);

    act(() => {
      void replacement.props.onSatisfied('replacement-grant');
    });
    expect((await second).status).toBe(200);
    expect(result.current.dialog).toBeNull();
    expect(secondSend).toHaveBeenCalledTimes(2);
    expect(secondSend).toHaveBeenLastCalledWith({ [STEP_UP_TOKEN_HEADER]: 'replacement-grant' });
    expect(firstSend).toHaveBeenCalledTimes(1);
  });

  it('settles satisfaction once despite repeated saved callbacks', async () => {
    const { result } = renderHook(useStepUp);
    const send = sender();
    const pending = result.current.withStepUp(send);
    await waitFor(() => expect(result.current.dialog).not.toBeNull());
    const current = dialog(result.current.dialog);

    act(() => {
      void current.props.onSatisfied('first-grant');
      void current.props.onSatisfied('second-grant');
      current.props.onCancel();
    });
    expect((await pending).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ [STEP_UP_TOKEN_HEADER]: 'first-grant' });
    expect(result.current.dialog).toBeNull();
  });

  it('keeps cancellation final and gives a later identical challenge a new key', async () => {
    const { result } = renderHook(useStepUp);
    const firstSend = sender();
    const first = result.current.withStepUp(firstSend).catch((error: unknown) => error);
    await waitFor(() => expect(result.current.dialog).not.toBeNull());
    const old = dialog(result.current.dialog);
    act(() => {
      old.props.onCancel();
      void old.props.onSatisfied('too-late');
    });
    expect(isStepUpCancelled(await first)).toBe(true);
    expect(firstSend).toHaveBeenCalledTimes(1);

    const secondSend = sender();
    const second = result.current.withStepUp(secondSend).catch((error: unknown) => error);
    await waitFor(() => expect(result.current.dialog).not.toBeNull());
    const next = dialog(result.current.dialog);
    expect(next.key).not.toBe(old.key);
    act(() => {
      old.props.onCancel();
      void old.props.onSatisfied('still-too-late');
    });
    expect(result.current.dialog).toBe(next);
    act(() => {
      next.props.onCancel();
    });
    expect(isStepUpCancelled(await second)).toBe(true);
    expect(secondSend).toHaveBeenCalledTimes(1);
  });

  it('preserves unmount cancellation of an installed challenge', async () => {
    const { result, unmount } = renderHook(useStepUp);
    const send = sender();
    const pending = result.current.withStepUp(send).catch((error: unknown) => error);
    await waitFor(() => expect(result.current.dialog).not.toBeNull());
    const old = dialog(result.current.dialog);
    unmount();
    expect(isStepUpCancelled(await pending)).toBe(true);
    act(() => {
      old.props.onCancel();
      void old.props.onSatisfied('late-grant');
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not cancel an independent already-dispatched request when another challenge opens', async () => {
    const { result } = renderHook(useStepUp);
    const dispatched = deferred<Response>();
    const firstSend = vi.fn(() => dispatched.promise);
    const first = result.current.withStepUp(firstSend);
    const secondSend = sender();
    const second = result.current.withStepUp(secondSend).catch((error: unknown) => error);
    await waitFor(() => expect(result.current.dialog).not.toBeNull());
    const current = dialog(result.current.dialog);
    const response = new Response('{}', { status: 200 });
    await act(async () => {
      dispatched.resolve(response);
    });
    expect(await first).toBe(response);
    expect(result.current.dialog).toBe(current);
    expect(firstSend).toHaveBeenCalledTimes(1);
    act(() => {
      current.props.onCancel();
    });
    expect(isStepUpCancelled(await second)).toBe(true);
  });

  it('remounts the real dialog so an old verification cannot satisfy its replacement', async () => {
    const user = userEvent.setup();
    const verification = deferred<IdentityReverificationStep>();
    reverification.verifySecondFactor.mockReturnValueOnce(verification.promise);
    requestGrant
      .mockResolvedValueOnce({ kind: 'verify', level: 'second_factor', message: 'Confirm.' })
      .mockResolvedValueOnce({ kind: 'verify', level: 'second_factor', message: 'Confirm.' })
      .mockResolvedValueOnce({ kind: 'granted', token: 'old-dialog-grant' });
    const { result } = renderHook(useStepUp);
    const firstSend = sender();
    const first = result.current.withStepUp(firstSend, 'org-1').catch((error: unknown) => error);
    await waitFor(() => expect(result.current.dialog).not.toBeNull());
    const view = render(result.current.dialog);
    await user.type(await screen.findByLabelText('Code from your authenticator app'), '111111');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));
    expect(reverification.verifySecondFactor).toHaveBeenCalledTimes(1);

    const oldKey = result.current.dialog?.key;
    const secondSend = sender();
    const second = result.current.withStepUp(secondSend, 'org-2').catch((error: unknown) => error);
    await waitFor(() => expect(result.current.dialog?.key).not.toBe(oldKey));
    const replacement = dialog(result.current.dialog);
    view.rerender(replacement);
    expect(isStepUpCancelled(await first)).toBe(true);
    await user.type(await screen.findByLabelText('Code from your authenticator app'), '222222');

    await act(async () => {
      verification.resolve({ kind: 'complete' });
    });
    await waitFor(() => expect(requestGrant).toHaveBeenCalledTimes(3));
    expect(requestGrant).toHaveBeenLastCalledWith(
      'organization.transfer_ownership',
      'org-1',
      'fresh-session-token',
    );
    expect(result.current.dialog).toBe(replacement);
    expect(screen.getByLabelText('Code from your authenticator app')).toHaveValue('222222');
    expect(firstSend).toHaveBeenCalledTimes(1);
    expect(secondSend).toHaveBeenCalledTimes(1);
    act(() => {
      replacement.props.onCancel();
    });
    expect(isStepUpCancelled(await second)).toBe(true);
  });
});

describe('owned challenge retirement', () => {
  it('settles a pending challenge on abort without replay', async () => {
    const authority = createRequestAuthority({
      userId: 'a',
      sessionId: 'a',
      isCurrent: () => true,
      getToken: async () => 'fake-token',
    });
    const { result } = renderHook(useStepUp);
    const send = sender();
    const operation = result.current
      .withStepUp(send, null, { authority })
      .catch((error: unknown) => error);
    await waitFor(() => expect(result.current.dialog).not.toBeNull());
    act(() => authority.retire());
    expect(result.current.dialog).toBeNull();
    expect(isStepUpCancelled(await operation)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never presents a delayed silent grant after intent retirement', async () => {
    const grant = deferred<StepUpGrantOutcome>();
    requestGrant.mockReturnValueOnce(grant.promise);
    const authority = createRequestAuthority({
      userId: 'a',
      sessionId: 'a',
      isCurrent: () => true,
      getToken: async () => 'fake-token',
    });
    const { result } = renderHook(useStepUp);
    const send = sender();
    const operation = result.current
      .withStepUp(send, null, { authority })
      .catch((error: unknown) => error);
    await waitFor(() => expect(requestGrant).toHaveBeenCalledTimes(1));
    act(() => authority.retire());
    grant.resolve({ kind: 'granted', token: 'fake-proof' });
    expect(await operation).toMatchObject({ name: 'AbortError' });
    expect(result.current.dialog).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

it('keeps explicit owned challenge cancellation quiet while the editor remains current', async () => {
  const authority = createRequestAuthority({
    userId: 'a',
    sessionId: 'a',
    isCurrent: () => true,
    getToken: async () => 'fake-token',
  });
  const { result } = renderHook(useStepUp);
  const send = sender();
  const operation = result.current
    .withStepUp(send, null, { authority })
    .catch((error: unknown) => error);
  await waitFor(() => expect(result.current.dialog).not.toBeNull());
  act(() => dialog(result.current.dialog).props.onCancel());
  expect(isStepUpCancelled(await operation)).toBe(true);
  expect(authority.isCurrent()).toBe(true);
  expect(result.current.dialog).toBeNull();
  expect(send).toHaveBeenCalledTimes(1);
});

type ImportedModule0 = typeof import('@/features/auth/step-up-fetch');
