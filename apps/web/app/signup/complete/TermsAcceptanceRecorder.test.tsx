import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn(),
  identity: vi.fn(),
  email: vi.fn(),
  adultEligibility: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mocks.useAuth(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
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
vi.mock('@/lib/server/adult-eligibility', async (importOriginal) => ({
  ...(await importOriginal()),
  readAdultEligibilityState: (userId: string) => mocks.adultEligibility(userId),
}));
vi.mock('../../login/complete/TermsReviewSignOut', () => ({
  TermsReviewSignOut: () => <button type="button">Sign out</button>,
}));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf-test-token',
  })),
}));

import { ADULT_ELIGIBILITY_ERROR_CODES } from '@agiworkforce/cloud-contracts';
import { ACCOUNT_AGE_FIELD_LABEL, ACCOUNT_AGE_INELIGIBLE_MESSAGE } from '@agiworkforce/types';

import { MarketingEmailGrantProvider } from '@/features/auth/marketingEmailChoice';
import { SIGN_UP_AGREEMENT_NOT_APPLICABLE_STATUS } from '@/lib/auth/new-account';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  AGE_CHECK_STORAGE_KEY,
  MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
  MARKETING_EMAIL_CHOICE_STORAGE_KEY,
  TERMS_GATE_STORAGE_KEY,
  writeSignupAttemptMarkers,
} from '../signupAttemptMarkers';
import { ContinueWithCurrentTerms, RecordTermsAcceptance } from './RecordTermsAcceptance';
import SignupCompletePage from './page';

function leaveEarlierAttemptKeys(): void {
  window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);
  window.localStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, 'earlier-attempt');
  window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, 'earlier-attempt');
  window.localStorage.setItem(AGE_CHECK_STORAGE_KEY, '18');
}

const AGE_REFUSAL_CODES = Object.values(ADULT_ELIGIBILITY_ERROR_CODES);
const REVIEW_URL = '/login/complete?redirectTo=%2Fchat';

function refusedForAge(code: string): Response {
  return Response.json({ error: { code } }, { status: 403 });
}

function everyMarker(): (string | null)[] {
  return [
    window.localStorage.getItem(TERMS_GATE_STORAGE_KEY),
    window.localStorage.getItem(AGE_CHECK_STORAGE_KEY),
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
    mocks.refresh.mockReset();
    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'new-user',
      sessionId: 'new-session',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });

  it('records the acceptance without asking the identity client, which no longer holds the finished sign-up after the page load', async () => {
    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(mocks.replace).not.toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat');
    expect(sentBodies()).toEqual([{ surface: 'web-signup', version: POLICY_LAST_UPDATED.terms }]);
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

  it('sends an account the server says this sign-up did not create to review the terms itself', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: SIGN_UP_AGREEMENT_NOT_APPLICABLE_STATUS })),
    );

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat'),
    );
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('terms-record-failed')).toBeNull();
    expect(window.localStorage.getItem('agi.terms-accepted-version')).toBeNull();
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

describe('what the sign-up recorder sends', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    writeSignupAttemptMarkers();
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'new-user',
      sessionId: 'new-session',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });

  it('sends no age evidence and no marketing email choice, even where an earlier screen left them', async () => {
    leaveEarlierAttemptKeys();

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    const [body] = sentBodies();
    expect(body).toEqual({
      surface: 'web-signup',
      version: POLICY_LAST_UPDATED.terms,
    });
    expect(body).not.toHaveProperty('eligibility');
    expect(body).not.toHaveProperty('marketingEmailNoticeVersion');
    expect(everyMarker()).toEqual([null, null, null, null, null]);
  });

  it('ignores a choice from the review screen on the sign-up surface', async () => {
    render(
      <MarketingEmailGrantProvider value={POLICY_LAST_UPDATED.privacy}>
        <RecordTermsAcceptance redirectTo="/chat" />
      </MarketingEmailGrantProvider>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(sentBodies()).toEqual([{ surface: 'web-signup', version: POLICY_LAST_UPDATED.terms }]);
  });

  it('sends the same request again on Try again after a failed write', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    expect(await screen.findByTestId('terms-record-failed')).toBeInTheDocument();
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    const expected = {
      surface: 'web-signup',
      version: POLICY_LAST_UPDATED.terms,
    };
    expect(sentBodies()).toEqual([expected, expected]);
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
    leaveEarlierAttemptKeys();

    render(<RecordTermsAcceptance redirectTo="/chat" surface="web-login" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(sentBodies()).toEqual([{ surface: 'web-login', version: POLICY_LAST_UPDATED.terms }]);
  });

  it('clears every marker when an account that already accepted is waved through', async () => {
    leaveEarlierAttemptKeys();

    render(<ContinueWithCurrentTerms redirectTo="/chat" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(everyMarker()).toEqual([null, null, null, null, null]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(AGE_REFUSAL_CODES)(
    'follows a sign-up refused with %s to the review screen and clears every marker',
    async (code) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => refusedForAge(code)),
      );

      render(<RecordTermsAcceptance redirectTo="/chat" />);

      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(REVIEW_URL));
      expect(mocks.replace).toHaveBeenCalledTimes(1);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('terms-record-failed')).toBeNull();
      expect(everyMarker()).toEqual([null, null, null, null, null]);
    },
  );

  it.each(AGE_REFUSAL_CODES)(
    'refreshes the screen instead of leaving it when a sign-in is refused with %s',
    async (code) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => refusedForAge(code)),
      );

      render(<RecordTermsAcceptance redirectTo="/chat" surface="web-login" />);

      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(screen.queryByTestId('terms-record-failed')).toBeNull();
      expect(everyMarker()).toEqual([null, null, null, null, null]);
    },
  );

  it.each([
    ['a refusal with another code', () => refusedForAge('FORBIDDEN')],
    ['a refusal with no body', () => new Response(null, { status: 403 })],
    ['a refusal whose body is not JSON', () => new Response('no', { status: 403 })],
    [
      'an age code on another status',
      () => Response.json({ error: { code: 'age_ineligible' } }, { status: 400 }),
    ],
  ])('treats %s as a failed write, keeping the marker for Try again', async (_case, respond) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond()),
    );

    render(<RecordTermsAcceptance redirectTo="/chat" />);

    expect(await screen.findByTestId('terms-record-failed')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
  });
});
describe('/signup/complete agreement record', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.redirect.mockReset();
    mocks.identity.mockResolvedValue({ subject: 'new-user' });
    mocks.email.mockReset().mockResolvedValue({ confirmed: true, email: 'person@example.com' });
    mocks.adultEligibility.mockReset().mockResolvedValue('confirmed');
    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'new-user',
      sessionId: 'new-session',
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
    expect(screen.queryByLabelText(ACCOUNT_AGE_FIELD_LABEL)).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat'));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/terms/accept', expect.anything());
    expect(mocks.adultEligibility).toHaveBeenCalledWith('new-user');
  });

  it('asks a new account its age, once, before recording anything', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);
    mocks.adultEligibility.mockResolvedValue('unconfirmed');

    await renderComplete();

    expect(screen.getByRole('heading', { name: 'Confirm your age' })).toBeInTheDocument();
    expect(screen.getAllByLabelText(ACCOUNT_AGE_FIELD_LABEL)).toHaveLength(1);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('agi.terms-accepted-version')).toBe(
      POLICY_LAST_UPDATED.terms,
    );
  });

  it('sends the answer as the sign-up surface and lets the server decide what comes next', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);
    mocks.adultEligibility.mockResolvedValue('unconfirmed');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ minimumAge: 18, state: 'confirmed' })),
    );
    await renderComplete();

    await userEvent.type(screen.getByLabelText(ACCOUNT_AGE_FIELD_LABEL), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('/api/eligibility');
    expect(sentBodies()).toEqual([
      { surface: 'web-signup', evidence: { kind: 'declared_age', age: 30 } },
    ]);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('tells an account under 18 it cannot be used, and records nothing', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);
    mocks.adultEligibility.mockResolvedValue('ineligible');

    await renderComplete();

    expect(screen.getByTestId('age-ineligible-notice')).toHaveTextContent(
      ACCOUNT_AGE_INELIGIBLE_MESSAGE,
    );
    expect(screen.queryByLabelText(ACCOUNT_AGE_FIELD_LABEL)).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
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
