import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useSignUp: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mocks.useAuth(),
  useSignUp: () => mocks.useSignUp(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf-test-token',
  })),
}));

import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { ContinueWithCurrentTerms, RecordTermsAcceptance } from './RecordTermsAcceptance';
import SignupCompletePage from './page';

describe('signup terms recorder', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);
    mocks.replace.mockReset();
    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'new-user',
      sessionId: 'new-session',
    });
    mocks.useSignUp.mockReturnValue({
      fetchStatus: 'idle',
      signUp: {
        status: 'complete',
        createdUserId: 'new-user',
        createdSessionId: 'new-session',
        legalAcceptedAt: Date.now(),
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });

  it('records the acceptance before handing the new account on to the app', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);
    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/terms/accept');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'csrf-test-token' });
    expect(init.body).toBe(
      JSON.stringify({ surface: 'web-signup', version: POLICY_LAST_UPDATED.terms }),
    );
    expect(window.localStorage.getItem('agi.terms-accepted-version')).toBeNull();
  });

  it('does not record acceptance when a signed-in account visits the completion URL without starting signup', async () => {
    window.localStorage.clear();
    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not record a stale signup marker for a different signed-in account', async () => {
    mocks.useSignUp.mockReturnValue({
      fetchStatus: 'idle',
      signUp: {
        status: 'complete',
        createdUserId: 'previous-user',
        createdSessionId: 'previous-session',
        legalAcceptedAt: Date.now(),
      },
    });

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('agi.terms-accepted-version')).toBeNull();
  });

  it('does not attribute a previous signup to a later session of the same user', async () => {
    mocks.useSignUp.mockReturnValue({
      fetchStatus: 'idle',
      signUp: {
        status: 'complete',
        createdUserId: 'new-user',
        createdSessionId: 'previous-session',
        legalAcceptedAt: Date.now(),
      },
    });

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not auto-record when Clerk has not confirmed legal acceptance', async () => {
    mocks.useSignUp.mockReturnValue({
      fetchStatus: 'idle',
      signUp: {
        status: 'complete',
        createdUserId: 'new-user',
        createdSessionId: 'new-session',
        legalAcceptedAt: null,
      },
    });

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not auto-record a marker left by an abandoned signup', async () => {
    mocks.useSignUp.mockReturnValue({
      fetchStatus: 'idle',
      signUp: {
        status: 'abandoned',
        createdUserId: null,
        createdSessionId: null,
        legalAcceptedAt: null,
      },
    });

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('still records an explicitly confirmed login acceptance without a signup marker', async () => {
    window.localStorage.clear();
    render(<RecordTermsAcceptance redirectTo="/chat" surface="web-login" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/terms/accept',
      expect.objectContaining({ body: expect.stringContaining('"web-login"') }),
    );
  });

  it('consumes the pre-auth marker without rewriting a current acceptance', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);

    render(<ContinueWithCurrentTerms redirectTo="/chat" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(window.localStorage.getItem('agi.terms-accepted-version')).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('surfaces a failed record instead of continuing as if it had been written', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500 })),
    );

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    expect(await screen.findByTestId('terms-record-failed')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /continue without recording/i })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('requires a reload and fresh review when the displayed revision is stale', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'TERMS_VERSION_OUTDATED' }, currentVersion: '2099-01-01' },
          { status: 409 },
        ),
      ),
    );

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    expect(await screen.findByTestId('terms-version-outdated')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reload and review current policies/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('does not call the recorder when there is no account to attribute it to', async () => {
    mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('/signup/complete agreement record', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.replace.mockReset();
    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'new-user',
      sessionId: 'new-session',
    });
    mocks.useSignUp.mockReturnValue({
      fetchStatus: 'idle',
      signUp: {
        status: 'complete',
        createdUserId: 'new-user',
        createdSessionId: 'new-session',
        legalAcceptedAt: Date.now(),
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });

  async function renderComplete() {
    render(await SignupCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));
  }

  it('records the agreement for the new account without asking again', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);
    await renderComplete();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/terms/accept', expect.anything());
  });

  it('consumes the pre-auth marker once the account record is written', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);

    await renderComplete();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(window.localStorage.getItem('agi.terms-accepted-version')).toBeNull();
  });
});
