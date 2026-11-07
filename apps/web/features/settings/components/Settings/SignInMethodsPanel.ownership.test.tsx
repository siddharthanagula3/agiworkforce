import { StrictMode, type ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmActionRequest } from '@agiworkforce/ui';
import { deferred } from '@/lib/identity/__tests__/passkey-fixture';

const mocks = vi.hoisted(() => ({
  fixture: null as unknown,
  confirmations: [] as ConfirmActionRequest[],
  csrf: vi.fn(async (): Promise<string> => 'csrf'),
  stepUp: null as unknown,
}));
vi.mock('@clerk/nextjs', async (original) => ({
  ...(await original<typeof import('@clerk/nextjs')>()),
  useAuth: () => {
    const { clerk } = mocks.fixture as ReturnType<typeof makeFixture>;
    return { isLoaded: true, isSignedIn: true, userId: clerk.user.id, sessionId: clerk.session.id };
  },
  useClerk: () => (mocks.fixture as ReturnType<typeof makeFixture>).clerk,
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: (mocks.fixture as ReturnType<typeof makeFixture>).clerk.user,
  }),
}));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<typeof import('@/lib/client/csrf')>()),
  getCsrfToken: mocks.csrf,
}));
vi.mock('@agiworkforce/ui', async (original) => {
  const actual = await original<typeof import('@agiworkforce/ui')>();
  return {
    ...actual,
    useConfirmAction: () => {
      const native = actual.useConfirmAction();
      return {
        ...native,
        confirm: (request: ConfirmActionRequest) => {
          mocks.confirmations.push(request);
          native.confirm(request);
        },
      };
    },
  };
});
vi.mock('@/features/auth/StepUpDialog', async (original) => ({
  ...(await original<typeof import('@/features/auth/StepUpDialog')>()),
  StepUpDialog: (
    props: ComponentProps<typeof import('@/features/auth/StepUpDialog').StepUpDialog>,
  ) => {
    mocks.stepUp = props;
    return (
      <div role="dialog">
        <button onClick={() => props.onSatisfied('proof')}>Verify identity</button>
        <button onClick={props.onCancel}>Cancel verification</button>
      </div>
    );
  },
}));

import { SignInMethodsPanel } from './SignInMethodsPanel';

const ID = '00000000-0000-4000-8000-000000000002';
function makeFixture() {
  const listeners = new Set<() => void>();
  const external = {
    id: 'external-1',
    provider: 'google',
    emailAddress: 'person@example.com',
    destroy: vi.fn(async () => undefined),
  };
  const user = {
    id: 'person',
    passwordEnabled: true,
    passkeys: [],
    externalAccounts: [external],
    primaryEmailAddress: {
      emailAddress: 'person@example.com',
      verification: { status: 'verified' },
    },
    reload: vi.fn(async (): Promise<{ id: string }> => ({ id: 'person' })),
    createExternalAccount: vi.fn(
      async (): Promise<{ verification: { externalVerificationRedirectURL: URL } }> => {
        throw new Error('provider unavailable');
      },
    ),
  };
  const session = {
    id: 'session-a',
    user,
    getToken: vi.fn(async (): Promise<string | null> => 'token-a'),
  };
  const clerk = {
    loaded: true,
    user,
    session,
    addListener: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  return { user, external, session, clerk, listeners, emit };
}
const payload = () => ({
  identities: [1, 2].map((id) => ({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    provider: 'backend',
    creationSource: 'link',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastAuthenticatedAt: null,
    removable: id === 2,
  })),
  providers: [
    { id: 'google', label: 'Google' },
    { id: 'github', label: 'GitHub' },
  ],
  consequence: 'You cannot sign in with it.',
});
let fixture: ReturnType<typeof makeFixture>;
let sendDelete: (init: RequestInit) => Promise<Response>;
let sendGrant: () => Promise<Response>;
const deletes = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'DELETE');
const reads = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(
      ([url, init]) => String(url) === '/api/settings/identities' && init?.method === 'GET',
    );
const remove = () => screen.getByRole('button', { name: 'Remove', hidden: true });
async function ready() {
  return screen.findByRole('button', { name: 'Remove' });
}
async function confirmRemoval() {
  await userEvent.click(remove());
  await userEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
  );
}
function replaceSession(userId = 'replacement', sessionId = 'session-b') {
  const user = { ...fixture.user, id: userId };
  fixture.clerk.user = user;
  fixture.clerk.session = {
    ...fixture.session,
    id: sessionId,
    user,
    getToken: vi.fn(async () => 'token-b'),
  };
  fixture.emit();
}
beforeEach(() => {
  fixture = makeFixture();
  mocks.fixture = fixture;
  mocks.confirmations = [];
  mocks.stepUp = null;
  mocks.csrf.mockReset().mockResolvedValue('csrf');
  sendDelete = async () => Response.json({ removed: ID });
  sendGrant = async () => Response.json({ token: 'proof' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/auth/step-up') return sendGrant();
      if (init?.method === 'DELETE') return sendDelete(init);
      return Response.json(payload());
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('SignInMethodsPanel application lifetime', () => {
  it('uses captured bearer DELETE, exact receipt, and a read-only refresh after real confirmation', async () => {
    render(<SignInMethodsPanel />);
    await ready();
    await confirmRemoval();
    await waitFor(() => expect(reads()).toHaveLength(2));
    expect(deletes()).toHaveLength(1);
    const init = deletes()[0]![1]!;
    expect(init).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({ identityId: ID }),
      credentials: 'omit',
    });
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token-a');
    expect(new Headers(init.headers).get('x-csrf-token')).toBe('csrf');
    expect(new Headers(init.headers).has('x-organization-id')).toBe(false);
  });
  it('reserves one lane before confirmation and ignores a retained cancel after dispatch', async () => {
    const pending = deferred<Response>();
    sendDelete = () => pending.promise;
    render(<SignInMethodsPanel />);
    await ready();
    await userEvent.click(remove());
    expect(screen.getByRole('button', { name: 'Disconnect', hidden: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Connect', hidden: true })).toBeDisabled();
    const retained = mocks.confirmations[0]!;
    let completion: unknown;
    act(() => {
      completion = retained.onConfirm();
      retained.onCancel?.();
      retained.onConfirm();
    });
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Disconnect', hidden: true })).toBeDisabled();
    await act(async () => {
      pending.resolve(Response.json({ removed: ID }));
      await completion;
    });
  });
  it('cancels a confirmation without dispatch and allows another intent', async () => {
    render(<SignInMethodsPanel />);
    await ready();
    await userEvent.click(remove());
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(deletes()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
  });
  it('admits only one initial intent from same-turn remove and native clicks', async () => {
    render(<SignInMethodsPanel />);
    await ready();
    const initialRemove = remove();
    const disconnect = screen.getByRole('button', { name: 'Disconnect' });
    const connect = screen.getByRole('button', { name: 'Connect' });
    act(() => {
      fireEvent.click(initialRemove);
      fireEvent.click(initialRemove);
      fireEvent.click(disconnect);
      fireEvent.click(connect);
    });
    expect(mocks.confirmations).toHaveLength(1);
    expect(fixture.external.destroy).not.toHaveBeenCalled();
    expect(fixture.user.createExternalAccount).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
  });
  it.each(['different-account', 'same-account', 'aba', 'inactive', 'unmount'] as const)(
    'rejects retained confirmation after %s retirement',
    async (kind) => {
      const view = render(<SignInMethodsPanel />);
      await ready();
      await userEvent.click(remove());
      const retained = mocks.confirmations[0]!;
      act(() => {
        if (kind === 'unmount') view.unmount();
        else if (kind === 'inactive') view.rerender(<SignInMethodsPanel active={false} />);
        else if (kind === 'same-account') replaceSession('person');
        else if (kind === 'aba') {
          replaceSession();
          fixture.clerk.user = fixture.user;
          fixture.clerk.session = fixture.session;
          fixture.emit();
        } else replaceSession();
      });
      await act(async () => {
        await retained.onConfirm();
        retained.onCancel?.();
      });
      expect(deletes()).toHaveLength(0);
      if (kind === 'inactive' || kind === 'unmount') expect(fixture.listeners.size).toBe(0);
    },
  );
  it.each(['csrf', 'token'] as const)(
    'does not dispatch after a deferred %s loses admission',
    async (stage) => {
      const pending = deferred<string>();
      const view = render(<SignInMethodsPanel />);
      await ready();
      if (stage === 'csrf') mocks.csrf.mockReturnValueOnce(pending.promise);
      else fixture.session.getToken.mockReturnValueOnce(pending.promise);
      await confirmRemoval();
      view.rerender(<SignInMethodsPanel active={false} />);
      await act(async () => pending.resolve(stage));
      expect(deletes()).toHaveLength(0);
    },
  );
  it.each(['response', 'json', 'rejection'] as const)(
    'drops obsolete deferred %s completion without a read or error',
    async (stage) => {
      const response = deferred<Response>();
      const body = deferred<unknown>();
      sendDelete = () =>
        stage === 'json'
          ? Promise.resolve({ ok: true, json: () => body.promise } as Response)
          : response.promise;
      const view = render(<SignInMethodsPanel />);
      await ready();
      await confirmRemoval();
      await waitFor(() => expect(deletes()).toHaveLength(1));
      view.rerender(<SignInMethodsPanel active={false} />);
      await act(async () => {
        if (stage === 'json') body.resolve({ removed: ID });
        else if (stage === 'rejection') response.reject(new Error('late failure'));
        else response.resolve(Response.json({ removed: ID }));
      });
      expect(reads()).toHaveLength(1);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );
  it('detects silent session replacement during a deferred DELETE settlement', async () => {
    const pending = deferred<Response>();
    sendDelete = () => pending.promise;
    render(<SignInMethodsPanel />);
    await ready();
    await confirmRemoval();
    await waitFor(() => expect(deletes()).toHaveLength(1));
    const replacement = { ...fixture.user, id: 'replacement' };
    fixture.clerk.user = replacement;
    fixture.clerk.session = {
      ...fixture.session,
      id: 'session-b',
      user: replacement,
      getToken: vi.fn(async () => 'token-b'),
    };
    await act(async () => pending.resolve(Response.json({ removed: ID })));
    await ready();
    expect(deletes()).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect((deletes()[0]![1]!.signal as AbortSignal).aborted).toBe(true);
  });
  it.each(['busy', 'error'] as const)(
    'cannot clear a replacement view %s with an old completion',
    async (kind) => {
      const old = deferred<Response>();
      const replacement = deferred<Response>();
      let attempt = 0;
      sendDelete = () =>
        ++attempt === 1
          ? old.promise
          : kind === 'busy'
            ? replacement.promise
            : Promise.reject(new Error('new failure'));
      render(<SignInMethodsPanel />);
      await ready();
      await confirmRemoval();
      await waitFor(() => expect(deletes()).toHaveLength(1));
      act(() => replaceSession());
      await ready();
      await confirmRemoval();
      await waitFor(() => expect(deletes()).toHaveLength(2));
      if (kind === 'error') await screen.findByRole('alert');
      await act(async () => old.resolve(Response.json({ removed: ID })));
      expect(screen.getByRole('button', { name: 'Connect', hidden: true })).toBeDisabled();
      if (kind === 'error')
        expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
      else await act(async () => replacement.resolve(Response.json({ removed: ID })));
    },
  );
  it.each(['wrong-id', 'empty', 'malformed', 'server-error', 'late-client-error'] as const)(
    'latches uncertain %s and does not clear it on read-only refresh',
    async (kind) => {
      sendDelete = async () =>
        kind === 'empty'
          ? new Response(null, { status: 204 })
          : kind === 'malformed'
            ? new Response('not json')
            : kind === 'server-error'
              ? Response.json({ error: 'late audit' }, { status: 500 })
              : kind === 'late-client-error'
                ? Response.json({ error: 'late security policy' }, { status: 403 })
                : Response.json({ removed: 'other' });
      render(<SignInMethodsPanel />);
      await ready();
      await confirmRemoval();
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/),
      );
      expect(remove()).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: 'Refresh sign-in methods' }));
      await ready();
      expect(remove()).toBeDisabled();
      expect(deletes()).toHaveLength(1);
      expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
    },
  );
  it('keeps uncertainty across modal close/reopen without dispatching again', async () => {
    sendDelete = async () => {
      throw new Error('network');
    };
    const view = render(<SignInMethodsPanel />);
    await ready();
    await confirmRemoval();
    await screen.findByRole('alert');
    view.rerender(<SignInMethodsPanel active={false} />);
    view.rerender(<SignInMethodsPanel />);
    await ready();
    expect(remove()).toBeDisabled();
    expect(deletes()).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
  });
  it.each(['pending', 'failed'] as const)(
    'requires a readable current page before acknowledging an uncertain %s read',
    async (kind) => {
      sendDelete = async () => {
        throw new Error('network');
      };
      const view = render(<SignInMethodsPanel />);
      await ready();
      await confirmRemoval();
      await screen.findByRole('alert');
      view.rerender(<SignInMethodsPanel active={false} />);
      const pending = deferred<Response>();
      vi.mocked(fetch).mockImplementationOnce(() =>
        kind === 'pending' ? pending.promise : Promise.resolve(new Response(null, { status: 500 })),
      );
      view.rerender(<SignInMethodsPanel />);
      const acknowledge = await screen.findByRole('button', {
        name: 'I have reviewed my sign-in methods',
      });
      expect(acknowledge).toBeDisabled();
      await act(async () => pending.resolve(Response.json(payload())));
      if (kind === 'pending') await waitFor(() => expect(acknowledge).toBeEnabled());
      else expect(acknowledge).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
    },
  );
  it('requires a new explicit acknowledgement after owner replacement and never repeats the mutation', async () => {
    sendDelete = async () => {
      throw new Error('network');
    };
    render(<SignInMethodsPanel />);
    await ready();
    await confirmRemoval();
    const oldAcknowledgement = await screen.findByRole('button', {
      name: 'I have reviewed my sign-in methods',
    });
    act(() => {
      const replacement = { ...fixture.user };
      fixture.clerk.user = replacement;
      fixture.session.user = replacement;
      fixture.emit();
    });
    await ready();
    fireEvent.click(oldAcknowledgement);
    expect(remove()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
    await userEvent.click(
      screen.getByRole('button', { name: 'I have reviewed my sign-in methods' }),
    );
    expect(remove()).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(deletes()).toHaveLength(1);
  });
  it('survives StrictMode replay and admits only one new operation', async () => {
    render(
      <StrictMode>
        <SignInMethodsPanel />
      </StrictMode>,
    );
    await ready();
    await confirmRemoval();
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('uses immutable target/body on owned proof replay', async () => {
    let attempt = 0;
    sendDelete = async () => (++attempt === 1 ? challenge() : Response.json({ removed: ID }));
    render(<SignInMethodsPanel />);
    await ready();
    await confirmRemoval();
    await waitFor(() => expect(deletes()).toHaveLength(2));
    expect(deletes().map(([, init]) => init?.body)).toEqual([
      JSON.stringify({ identityId: ID }),
      JSON.stringify({ identityId: ID }),
    ]);
    expect(new Headers(deletes()[1]![1]!.headers).get('x-step-up-token')).toBe('proof');
  });
  it('cancels step-up without uncertain mutation or replay', async () => {
    sendDelete = async () => challenge();
    sendGrant = async () =>
      Response.json(
        { error: { code: 'STEP_UP_VERIFICATION_REQUIRED', details: { level: 'first_factor' } } },
        { status: 403 },
      );
    render(<SignInMethodsPanel />);
    await ready();
    await confirmRemoval();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel verification' }));
    await waitFor(() => expect(remove()).toBeEnabled());
    expect(deletes()).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('retires an open challenge and rejects its retained proof after closing', async () => {
    sendDelete = async () => challenge();
    sendGrant = async () =>
      Response.json(
        { error: { code: 'STEP_UP_VERIFICATION_REQUIRED', details: { level: 'first_factor' } } },
        { status: 403 },
      );
    const view = render(<SignInMethodsPanel />);
    await ready();
    await confirmRemoval();
    await screen.findByRole('button', { name: 'Verify identity' });
    const retained = mocks.stepUp as ComponentProps<
      typeof import('@/features/auth/StepUpDialog').StepUpDialog
    >;
    view.rerender(<SignInMethodsPanel active={false} />);
    act(() => retained.onSatisfied('stale-proof'));
    expect(deletes()).toHaveLength(1);
    expect(retained.authority?.signal.aborted).toBe(true);
  });
  it('rejects late grant acquisition after SDK-only replacement', async () => {
    const pending = deferred<Response>();
    sendDelete = async () => challenge();
    sendGrant = () => pending.promise;
    render(<SignInMethodsPanel />);
    await ready();
    await confirmRemoval();
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url) === '/api/auth/step-up')).toBe(
        true,
      ),
    );
    act(() => replaceSession());
    await act(async () => pending.resolve(Response.json({ token: 'late-proof' })));
    expect(deletes()).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('shares its lane with native destruction and prevents late native reload on close', async () => {
    const pending = deferred();
    fixture.external.destroy.mockReturnValueOnce(pending.promise);
    const view = render(<SignInMethodsPanel />);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Disconnect' }),
    );
    expect(remove()).toBeDisabled();
    expect(deletes()).toHaveLength(0);
    view.rerender(<SignInMethodsPanel active={false} />);
    await act(async () => pending.resolve());
    expect(fixture.user.reload).not.toHaveBeenCalled();
  });
  it('does not dispatch a native target replaced during confirmation', async () => {
    render(<SignInMethodsPanel />);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fixture.user.externalAccounts = [{ ...fixture.external }];
    await act(async () => {
      await mocks.confirmations[0]!.onConfirm();
    });
    expect(fixture.external.destroy).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
  });
  it('latches an uncertain native connect failure without an automatic retry', async () => {
    render(<SignInMethodsPanel />);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(fixture.user.createExternalAccount).toHaveBeenCalledTimes(1);
    expect(fixture.user.createExternalAccount).toHaveBeenCalledWith({
      strategy: 'oauth_github',
      redirectUrl: window.location.href,
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
    expect(remove()).toBeDisabled();
    expect(deletes()).toHaveLength(0);
  });
  it('suppresses a native rejection after silent same-ID native-user replacement', async () => {
    const pending = deferred<{ verification: { externalVerificationRedirectURL: URL } }>();
    fixture.user.createExternalAccount.mockReturnValueOnce(pending.promise);
    render(<SignInMethodsPanel />);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    fixture.clerk.user = { ...fixture.user };
    await act(async () => pending.reject(new Error('old provider detail')));
    expect(screen.queryByText(/old provider detail/)).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
    expect(fixture.user.reload).not.toHaveBeenCalled();
  });
});

function challenge() {
  return Response.json(
    {
      error: {
        code: 'STEP_UP_REQUIRED',
        details: {
          action: 'identity.unlink',
          consequence: 'Remove this sign-in method',
          freshnessSeconds: 300,
        },
      },
    },
    { status: 403 },
  );
}
