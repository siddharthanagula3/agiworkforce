import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useSignUp: vi.fn(),
  replace: vi.fn(),
  redirect: vi.fn(),
  identity: vi.fn(),
  email: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mocks.useAuth(),
  useSignUp: () => mocks.useSignUp(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  redirect: (url: string) => {
    mocks.redirect(url);
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal()),
  getRequestIdentity: () => mocks.identity(),
}));
vi.mock('@/lib/auth/email-confirmation', async (importOriginal) => ({
  ...(await importOriginal()),
  readPrimaryEmailState: (userId: string) => mocks.email(userId),
}));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf-test-token',
  })),
}));

import { ACCOUNT_AGE_FIELD_LABEL } from '@agiworkforce/types';

import { MarketingEmailGrantProvider } from '@/features/auth/marketingEmailChoice';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
  MARKETING_EMAIL_CHOICE_STORAGE_KEY,
  writeSignupAttemptMarkers,
} from '../signupAttemptMarkers';
import { ContinueWithCurrentTerms, RecordTermsAcceptance } from './RecordTermsAcceptance';
import SignupCompletePage from './page';

function admitTickedAttemptInThisTab(): void {
  writeSignupAttemptMarkers({ marketingEmail: true });
}

function openAnotherTab(): void {
  window.sessionStorage.clear();
}

function everyMarker(): (string | null)[] {
  return [
    window.localStorage.getItem('agi.terms-accepted-version'),
    window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY),
    window.localStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY),
    window.sessionStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY),
  ];
}

function sentBodies(): Record<string, unknown>[] {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
    ([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
  );
}

describe('signup terms recorder', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  it('records the sign-up page agreement when the identity provider keeps no consent time', async () => {
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

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(mocks.replace).not.toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/terms/accept',
      expect.objectContaining({
        body: JSON.stringify({ surface: 'web-signup', version: POLICY_LAST_UPDATED.terms }),
      }),
    );
  });

  it('sends a new account to the terms screen when the provider dropped the finished sign-up', async () => {
    mocks.useSignUp.mockReturnValue({
      fetchStatus: 'idle',
      signUp: {
        status: null,
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
    expect(window.localStorage.getItem('agi.terms-accepted-version')).toBeNull();
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

  it('records a sign-in acceptance at once, leaving the age question to the terms screen', async () => {
    window.localStorage.clear();
    mocks.useSignUp.mockReturnValue({
      fetchStatus: 'idle',
      signUp: {
        status: 'complete',
        createdUserId: 'new-user',
        createdSessionId: 'new-session',
        legalAcceptedAt: null,
      },
    });

    render(<RecordTermsAcceptance redirectTo="/chat" surface="web-login" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/terms/accept',
      expect.objectContaining({ body: expect.stringContaining('"web-login"') }),
    );
    expect(screen.queryByLabelText(ACCOUNT_AGE_FIELD_LABEL)).not.toBeInTheDocument();
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

describe('the marketing email choice carried to the recorder', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  it('sends a ticked choice in the request that records the terms, then forgets it', async () => {
    admitTickedAttemptInThisTab();

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(sentBodies()).toEqual([
      {
        surface: 'web-signup',
        version: POLICY_LAST_UPDATED.terms,
        marketingEmailNoticeVersion: POLICY_LAST_UPDATED.privacy,
      },
    ]);
    expect(everyMarker()).toEqual([null, null, null, null]);
  });

  it('sends no choice when the box was left unticked', async () => {
    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(sentBodies()).toEqual([{ surface: 'web-signup', version: POLICY_LAST_UPDATED.terms }]);
  });

  it('records nothing for a choice made against an earlier notice, and sends the person to review', async () => {
    admitTickedAttemptInThisTab();
    window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, '1970-01-01');

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('agi.terms-accepted-version')).toBeNull();
  });

  it('records nothing for a choice ticked in another tab, and sends the person to be asked again', async () => {
    admitTickedAttemptInThisTab();
    openAnotherTab();

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(everyMarker()).toEqual([null, null, null, null]);
  });

  it('records nothing when this tab ticked the box in a different attempt from the one carried', async () => {
    admitTickedAttemptInThisTab();
    const thisTabsAttempt = window.sessionStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
    openAnotherTab();
    admitTickedAttemptInThisTab();
    window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, String(thisTabsAttempt));

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(everyMarker()).toEqual([null, null, null, null]);
  });

  it('records nothing for a ticked attempt whose choice another tab removed, and sends the person to be asked again', async () => {
    admitTickedAttemptInThisTab();
    const thisTabsAttempt = window.sessionStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
    openAnotherTab();
    writeSignupAttemptMarkers({ marketingEmail: false });
    window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, String(thisTabsAttempt));

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(everyMarker()).toEqual([null, null, null, null]);
  });

  it('records nothing for a choice that carries no attempt id at all', async () => {
    window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(everyMarker()).toEqual([null, null, null, null]);
  });

  it('never attributes a choice left by another sign-up to the account now signed in', async () => {
    admitTickedAttemptInThisTab();
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
    expect(window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
  });

  it('drops a carried choice when nobody is signed in to attribute it to', async () => {
    admitTickedAttemptInThisTab();
    mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
  });

  it('keeps the choice through a failed write, so Try again records both or neither', async () => {
    admitTickedAttemptInThisTab();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    expect(await screen.findByTestId('terms-record-failed')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBe(
      POLICY_LAST_UPDATED.privacy,
    );
    window.localStorage.removeItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    const expected = {
      surface: 'web-signup',
      version: POLICY_LAST_UPDATED.terms,
      marketingEmailNoticeVersion: POLICY_LAST_UPDATED.privacy,
    };
    expect(sentBodies()).toEqual([expected, expected]);
  });

  it('asks for a reload, keeping nothing recorded, when the server says the notice moved on', async () => {
    admitTickedAttemptInThisTab();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'NOTICE_VERSION_OUTDATED' }, currentNoticeVersion: '2099-01-01' },
          { status: 409 },
        ),
      ),
    );

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    expect(await screen.findByTestId('terms-version-outdated')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('sends the choice made on the terms review screen with the login surface', async () => {
    window.localStorage.clear();

    render(
      <MarketingEmailGrantProvider value={POLICY_LAST_UPDATED.privacy}>
        <RecordTermsAcceptance redirectTo="/chat" surface="web-login" />
      </MarketingEmailGrantProvider>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(sentBodies()).toEqual([
      {
        surface: 'web-login',
        version: POLICY_LAST_UPDATED.terms,
        marketingEmailNoticeVersion: POLICY_LAST_UPDATED.privacy,
      },
    ]);
  });

  it('never reads a choice out of the browser for the login surface', async () => {
    admitTickedAttemptInThisTab();

    render(<RecordTermsAcceptance redirectTo="/chat" surface="web-login" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(sentBodies()).toEqual([{ surface: 'web-login', version: POLICY_LAST_UPDATED.terms }]);
    expect(window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
  });

  it('ignores a choice from the review screen on the sign-up surface, which carries its own', async () => {
    render(
      <MarketingEmailGrantProvider value={POLICY_LAST_UPDATED.privacy}>
        <RecordTermsAcceptance redirectTo="/chat" />
      </MarketingEmailGrantProvider>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(sentBodies()).toEqual([{ surface: 'web-signup', version: POLICY_LAST_UPDATED.terms }]);
  });

  it('clears a carried choice when an account that already accepted is waved through', async () => {
    admitTickedAttemptInThisTab();

    render(<ContinueWithCurrentTerms redirectTo="/chat" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(everyMarker()).toEqual([null, null, null, null]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('/signup/complete agreement record', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.replace.mockReset();
    mocks.redirect.mockReset();
    mocks.identity.mockResolvedValue({ subject: 'new-user' });
    mocks.email.mockReset().mockResolvedValue({ confirmed: true, email: 'person@example.com' });
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

  it('records it on an instance without express legal consent, with no second terms screen', async () => {
    mocks.useSignUp.mockReturnValue({
      fetchStatus: 'idle',
      signUp: {
        status: 'complete',
        createdUserId: 'new-user',
        createdSessionId: 'new-session',
        legalAcceptedAt: null,
      },
    });
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);

    await renderComplete();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it('sends an account whose address was never proved to confirm it, recording nothing', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);
    mocks.email.mockResolvedValue({ confirmed: false, email: 'victim@corp.example' });

    await expect(renderComplete()).rejects.toThrow('redirect:/login/complete?redirectTo=%2Fchat');

    expect(mocks.email).toHaveBeenCalledWith('new-user');
    expect(mocks.redirect).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('leaves a signed-out visitor to the recorder without asking the provider about them', async () => {
    mocks.identity.mockResolvedValue({ subject: null });
    mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });

    await renderComplete();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(mocks.email).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('consumes the pre-auth marker once the account record is written', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);

    await renderComplete();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(window.localStorage.getItem('agi.terms-accepted-version')).toBeNull();
  });
});
