import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
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
  ...(await importOriginal<typeof import('@/features/auth/step-up-fetch')>()),
  requestStepUpGrant: requestGrant,
}));
vi.mock('@/lib/identity/client', () => ({
  useSessionReverification: () => reverification,
  useSignOut: () => vi.fn(),
}));

import { isStepUpCancelled, STEP_UP_TOKEN_HEADER } from '@/features/auth/step-up-fetch';
import { useStepUp } from '../useStepUp';

function refusal(): Response {
  return new Response(JSON.stringify({
    error: {
      code: 'STEP_UP_REQUIRED',
      details: {
        action: 'organization.transfer_ownership',
        consequence: 'Ownership moves to another member.',
        freshnessSeconds: 300,
      },
    },
  }), { status: 403 });
}

function sender() {
  return vi.fn<(headers: Record<string, string>) => Promise<Response>>()
    .mockImplementationOnce(async () => refusal())
    .mockImplementation(async () => new Response('{}', { status: 200 }));
}

function dialog(element: ReactElement | null): ReactElement<StepUpDialogProps> {
  expect(element).not.toBeNull();
  return element as ReactElement<StepUpDialogProps>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  requestGrant.mockReset();
  requestGrant.mockResolvedValue({ kind: 'verify', level: 'second_factor', message: 'Confirm.' });
  for (const mock of Object.values(reverification)) mock.mockReset();
  reverification.start.mockResolvedValue({ kind: 'second_factor', methods: ['authenticator'] });
  reverification.freshToken.mockResolvedValue('fresh-session-token');
});

afterEach(cleanup);

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

    act(() => { void replacement.props.onSatisfied('replacement-grant'); });
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
    act(() => { next.props.onCancel(); });
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
    await act(async () => { dispatched.resolve(response); });
    expect(await first).toBe(response);
    expect(result.current.dialog).toBe(current);
    expect(firstSend).toHaveBeenCalledTimes(1);
    act(() => { current.props.onCancel(); });
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

    await act(async () => { verification.resolve({ kind: 'complete' }); });
    await waitFor(() => expect(requestGrant).toHaveBeenCalledTimes(3));
    expect(requestGrant).toHaveBeenLastCalledWith(
      'organization.transfer_ownership', 'org-1', 'fresh-session-token',
    );
    expect(result.current.dialog).toBe(replacement);
    expect(screen.getByLabelText('Code from your authenticator app')).toHaveValue('222222');
    expect(firstSend).toHaveBeenCalledTimes(1);
    expect(secondSend).toHaveBeenCalledTimes(1);
    act(() => { replacement.props.onCancel(); });
    expect(isStepUpCancelled(await second)).toBe(true);
  });
});
