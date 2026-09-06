import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({ useAuth: () => mocks.useAuth() }));
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
    mocks.replace.mockReset();
    mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
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
    mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });

  async function renderComplete() {
    render(await SignupCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));
  }

  it('records the agreement for the new account without asking again', async () => {
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
