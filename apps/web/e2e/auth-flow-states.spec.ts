import {
  MOCK_ACCOUNT_PASSWORD,
  MOCK_CODE_ACCOUNT,
  MOCK_EMAILED_CODE,
  MOCK_PASSWORD_ACCOUNT,
  MOCK_SHORT_PASSWORD_REFUSAL,
  MOCK_SIGNUP_CODE_ONLY_ACCOUNT,
  MOCK_SIGNUP_PASSWORD_ACCOUNT,
  holdMockDevBrowser,
  isMockedProviderScript,
  mockAuthProvider,
  mockAuthProviderCalls,
  mockAuthProviderProgress,
  mockAuthProviderSignIn,
} from './lib/mock-auth-provider';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { POLICY_LAST_UPDATED } from '../lib/legal-constants';

// Vendor-response states are covered in features/auth/__tests__/AuthFlow.states.test.tsx.
// Here is what only a browser answers: real focus order, real event order, real
// layout at real widths, and what the one screen sends where.
const ROUTES = ['/login', '/signup'] as const;

const PHONE = { width: 390, height: 844 };
const ZOOMED = { width: 640, height: 512 };
const HEADING = 'Log in or sign up';
const AGREEMENT = 'By continuing, you agree to our Terms and Privacy Policy.';
const FOOTER_LINKS = ['Help', 'Privacy', 'Terms', 'Contact'];
const MOCK_CODE = MOCK_EMAILED_CODE;
const WRONG_CODE = '000000';
const CODE_REFUSED = /check the last code we emailed you/i;
const MOCK_PASSWORD = 'a long passphrase nobody reuses';
const TOO_SHORT_PASSWORD = 'short';
const PASSWORD_RULE = /use at least \d+ characters/i;
const GENERIC_FAILURE = /something went wrong/i;
const WRONG_PASSWORD = 'not the password this account has';
const PASSWORD_REFUSED = /email and password do not match/i;
const NEW_ACCOUNT_DESTINATION = '/chat';
const NOTHING_CARRIED = {
  terms: null,
  ageCheckedAgainst: null,
  choice: null,
  attempt: null,
  attemptInThisTab: null,
};
const NEXT_DOCUMENT_TIMEOUT_MS = 30_000;

function passwordField(page: Page) {
  return page.getByLabel('Password', { exact: true });
}

function submitButton(page: Page) {
  return page.getByRole('button', { name: 'Continue', exact: true });
}

async function openAuth(
  page: Page,
  route: string,
  provider: Parameters<typeof mockAuthProvider>[1] = {},
): Promise<void> {
  await holdMockDevBrowser(page, String(test.info().project.use.baseURL));
  await mockAuthProvider(page, provider);
  await page.goto(route, { waitUntil: 'load' });
  await expect(submitButton(page)).toBeEnabled();
  await expect(page.getByTestId('auth-layout')).toHaveCount(1);
  await expect(page.getByTestId('auth-layout')).toBeVisible();
  for (const button of await page.getByTestId('auth-layout').getByRole('button').all()) {
    await expect(button).toBeEnabled();
  }
}

async function continueWith(page: Page, email: string): Promise<void> {
  await page.getByLabel('Email address').fill(email);
  await submitButton(page).click();
}

async function openCodeStep(page: Page): Promise<Locator> {
  await openAuth(page, '/login');
  await continueWith(page, MOCK_CODE_ACCOUNT);
  const code = page.getByLabel('Code', { exact: true });
  await expect(code).toBeEditable();
  return code;
}

async function expectCheckedOnce(page: Page, code: Locator): Promise<void> {
  await expect(page.getByTestId('auth-layout').getByRole('alert')).toBeVisible();
  await expect(code).toBeEditable();
  expect(
    (await mockAuthProviderProgress(page)).signInCodeChecks,
    'the code reached the identity provider once',
  ).toBe(1);
}

async function openSignUpCodeStep(
  page: Page,
  email: string,
  route: (typeof ROUTES)[number] = '/signup',
  provider: Parameters<typeof mockAuthProvider>[1] = {},
): Promise<Locator> {
  await openAuth(page, route, provider);
  await continueWith(page, email);
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  const code = page.getByLabel('Code', { exact: true });
  await expect(code).toBeEditable();
  return code;
}

/**
 * Lists, and refuses where a route can, every request that would leave this
 * machine or reach an identity API path. The provider scripts the harness
 * answers are not among them; a redirect hop is, because it is listed even
 * though no route sees it.
 */
async function keepEveryRequestOnThisMachine(page: Page): Promise<string[]> {
  const leaving: string[] = [];
  const leaves = (url: URL): boolean => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (isMockedProviderScript(url)) return false;
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return !local || url.pathname.startsWith('/v1/');
  };
  page.on('request', (request) => {
    if (leaves(new URL(request.url()))) leaving.push(request.url());
  });
  await page.route(leaves, (route) => route.abort());
  return leaving;
}

/** Answers the terms request in the browser, where the mocked sign-up has no server session. */
async function answerTermsRequests(page: Page): Promise<Record<string, unknown>[]> {
  const sent: Record<string, unknown>[] = [];
  await page.route('**/api/terms/accept', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    sent.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: POLICY_LAST_UPDATED.terms,
        acceptedAt: '2026-10-05T00:00:00.000Z',
      }),
    });
  });
  return sent;
}

async function stopWhereTheFlowHandsOn(page: Page, path: string): Promise<Locator> {
  await page.route(
    (url) => url.pathname === path,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><title>Handed on</title><main data-testid="handed-on">${path}</main>`,
      }),
  );
  return page.getByTestId('handed-on');
}

function carriedMarkers(page: Page) {
  return page.evaluate(() => ({
    terms: window.localStorage.getItem('agi.terms-accepted-version'),
    ageCheckedAgainst: window.localStorage.getItem('agi.age-checked-minimum'),
    choice: window.localStorage.getItem('agi.marketing-email-notice-version'),
    attempt: window.localStorage.getItem('agi.marketing-email-attempt-id'),
    attemptInThisTab: window.sessionStorage.getItem('agi.marketing-email-attempt-id'),
  }));
}

async function expectSessionOpening(page: Page): Promise<void> {
  await expect(page.getByTestId('auth-phase')).toHaveText('Signing you in');
  await expect(page.getByTestId('auth-layout').getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('auth-layout').getByText(GENERIC_FAILURE)).toHaveCount(0);
}

test.describe('auth flow states', () => {
  for (const route of ROUTES) {
    test(`${route} shows the one log-in or sign-up screen with nothing entered or refused`, async ({
      page,
    }) => {
      await openAuth(page, route);
      const layout = page.getByTestId('auth-layout');

      await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
      const email = page.getByLabel('Email address');
      await expect(email).toBeVisible();
      await expect(email).not.toBeFocused();
      await expect(page.getByTestId('auth-signup-agreement')).toHaveText(AGREEMENT);
      await expect(layout.getByRole('checkbox')).toHaveCount(0);
      await expect(passwordField(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Forgot password?' })).toHaveCount(0);
      await expect(page.getByTestId('auth-age-field')).toHaveCount(0);
      await expect(layout.getByRole('link', { name: /^(Sign up|Log in)$/ })).toHaveCount(0);
      await expect(layout.getByText(/have an account\?/)).toHaveCount(0);
      await expect(page.getByTestId('auth-legal-footer').getByRole('link')).toHaveText(
        FOOTER_LINKS,
      );
    });

    test(`${route} keeps a live region in the tree before it has anything to say`, async ({
      page,
    }) => {
      await openAuth(page, route);

      const status = page.getByTestId('auth-phase');
      await expect(status).toHaveAttribute('aria-live', 'polite');
      await expect(status).toHaveText('');
    });

    test(`${route} reaches every control from the keyboard alone`, async ({ page }) => {
      await openAuth(page, route);

      const controls = await page
        .getByTestId('auth-layout')
        .locator('button, input, a[href], summary')
        .all();
      const targets = [];
      for (const control of controls) {
        if ((await control.isVisible()) && (await control.isEnabled())) targets.push(control);
      }
      expect(targets.length).toBeGreaterThan(0);
      const reached = new Set<number>();
      for (let step = 0; step < targets.length * 2 + 4; step += 1) {
        for (const [index, control] of targets.entries()) {
          if (await control.evaluate((element) => element === document.activeElement))
            reached.add(index);
        }
        if (reached.size === targets.length) break;
        await page.keyboard.press('Tab');
      }
      expect(reached.size, 'every visible auth control is reachable by Tab').toBe(targets.length);
    });

    test(`${route} fits a phone with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await openAuth(page, route);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test(`${route} survives a 200% zoom without clipping its controls`, async ({ page }) => {
      await page.setViewportSize(ZOOMED);
      await openAuth(page, route);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const box = await submitButton(page).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
    });
  }

  test('/login and /signup render the same screen', async ({ page }) => {
    await openAuth(page, '/login');
    const fromLogin = await page.getByTestId('auth-layout').innerText();
    await page.goto('/signup', { waitUntil: 'load' });
    await expect(submitButton(page)).toBeEnabled();

    expect(await page.getByTestId('auth-layout').innerText()).toBe(fromLogin);
  });

  test('an address no account uses goes on to sign-up with no error and no question', async ({
    page,
  }) => {
    await openSignUpCodeStep(page, MOCK_SIGNUP_CODE_ONLY_ACCOUNT, '/login');

    await expect(page.getByTestId('auth-layout').getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /instead/ })).toHaveCount(0);
    expect(await mockAuthProviderCalls(page)).toEqual({
      signInCreate: 1,
      signUpCreate: 1,
      signUpSso: 0,
      signInSso: 0,
    });
    expect((await carriedMarkers(page)).terms).toBe(POLICY_LAST_UPDATED.terms);
  });

  test('an address an account uses goes to its password step, which opens the session', async ({
    page,
  }) => {
    await openAuth(page, '/signup');

    await continueWith(page, MOCK_PASSWORD_ACCOUNT);

    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
    await expect(passwordField(page)).toBeFocused();
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
    expect(await mockAuthProviderCalls(page)).toEqual({
      signInCreate: 1,
      signUpCreate: 0,
      signUpSso: 0,
      signInSso: 0,
    });
    expect(await carriedMarkers(page)).toEqual(NOTHING_CARRIED);

    await passwordField(page).fill(MOCK_ACCOUNT_PASSWORD);
    await submitButton(page).click();

    await expectSessionOpening(page);
    expect(await mockAuthProviderSignIn(page)).toEqual({
      passwordChecks: 1,
      sessionsOpened: 1,
      resetCodesSent: 0,
    });
    expect(
      await page.evaluate(() => window.localStorage.getItem('agiworkforce-auth-last-method')),
    ).toBe('method:password');
  });

  test('a wrong password is refused on the password step, against the password field', async ({
    page,
  }) => {
    await openAuth(page, '/login');
    await continueWith(page, MOCK_PASSWORD_ACCOUNT);
    const password = passwordField(page);
    await expect(password).toBeFocused();

    await password.fill(WRONG_PASSWORD);
    await password.press('Enter');

    const alert = page.getByTestId('auth-layout').getByRole('alert');
    await expect(alert).toHaveText(PASSWORD_REFUSED);
    await expect(password).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (await password.getAttribute('aria-describedby')) ?? '';
    expect(describedBy.split(' ')).toContain(await alert.getAttribute('id'));
    await expect(password).toBeFocused();
    await expect(password).toHaveValue(WRONG_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
    await expect(page.locator('svg.auth-scene')).toHaveAttribute('data-mood', 'error');
    expect(new URL(page.url()).search).not.toContain(encodeURIComponent(WRONG_PASSWORD));

    await password.fill(MOCK_ACCOUNT_PASSWORD);
    await submitButton(page).click();

    await expectSessionOpening(page);
    expect(await mockAuthProviderSignIn(page)).toEqual({
      passwordChecks: 2,
      sessionsOpened: 1,
      resetCodesSent: 0,
    });
  });

  test('Forgot password on the password step emails that address a reset code', async ({
    page,
  }) => {
    await openAuth(page, '/login');
    await continueWith(page, MOCK_PASSWORD_ACCOUNT);

    await page.getByRole('button', { name: 'Forgot password?' }).click();

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await expect(
      page.getByTestId('auth-layout').getByText(`We sent a code to ${MOCK_PASSWORD_ACCOUNT}`),
    ).toBeVisible();
    expect(await mockAuthProviderSignIn(page)).toEqual({
      passwordChecks: 0,
      sessionsOpened: 0,
      resetCodesSent: 1,
    });
  });

  test('an address whose account has no password goes straight to its code step', async ({
    page,
  }) => {
    await openCodeStep(page);

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await expect(
      page.getByTestId('auth-layout').getByText(`We sent a code to ${MOCK_CODE_ACCOUNT}`),
    ).toBeVisible();
    await expect(passwordField(page)).toHaveCount(0);
    expect((await mockAuthProviderCalls(page)).signUpCreate).toBe(0);
  });

  test('an address the browser filled in before the page hydrated is kept', async ({ page }) => {
    await page.addInitScript((address: string) => {
      const observer = new MutationObserver(() => {
        const email = document.querySelector<HTMLInputElement>('input[name="email"]');
        if (!email) return;
        observer.disconnect();
        email.value = address;
      });
      observer.observe(document, { childList: true, subtree: true });
    }, MOCK_PASSWORD_ACCOUNT);
    await openAuth(page, '/login');

    await expect(page.getByLabel('Email address')).toHaveValue(MOCK_PASSWORD_ACCOUNT);
    await submitButton(page).click();

    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
  });

  test('a code typed in full and followed at once by Enter is checked once', async ({ page }) => {
    const code = await openCodeStep(page);

    await code.pressSequentially(MOCK_CODE);
    await page.keyboard.press('Enter');

    await expectCheckedOnce(page, code);
  });

  test('a filled code confirmed with Continue is checked once when the step after it fails', async ({
    page,
  }) => {
    const code = await openCodeStep(page);

    await code.fill(MOCK_CODE);
    await submitButton(page).click();

    await expectCheckedOnce(page, code);
    await expect(page.getByRole('heading', { name: 'This link was already used' })).toHaveCount(0);
  });

  test('an autofilled code that submits in the same task is checked once', async ({ page }) => {
    const code = await openCodeStep(page);

    await code.evaluate((input: HTMLInputElement, value: string) => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.form?.requestSubmit();
    }, MOCK_CODE);

    await expectCheckedOnce(page, code);
  });

  test('a sign-up the provider asks nothing more of opens its session once the code is accepted', async ({
    page,
  }) => {
    const code = await openSignUpCodeStep(page, MOCK_SIGNUP_CODE_ONLY_ACCOUNT);

    await code.pressSequentially(MOCK_CODE);

    await expectSessionOpening(page);
    await expect(page.getByRole('heading', { name: 'Create a password' })).toHaveCount(0);
    expect(await mockAuthProviderProgress(page)).toEqual({
      signInCodeChecks: 0,
      signUpCodeChecks: 1,
      signUpPasswords: 0,
      signUpFinalizes: 1,
    });
  });

  test('a sign-up that still needs a password asks for one after the code, then opens its session', async ({
    page,
  }) => {
    const code = await openSignUpCodeStep(page, MOCK_SIGNUP_PASSWORD_ACCOUNT, '/login');

    await code.pressSequentially(MOCK_CODE);

    await expect(page.getByRole('heading', { name: 'Create a password' })).toBeVisible();
    const password = passwordField(page);
    await expect(password).toBeFocused();
    await expect(page.getByText(PASSWORD_RULE)).toBeVisible();
    await expect(page.getByTestId('auth-layout').getByText(GENERIC_FAILURE)).toHaveCount(0);
    expect(await mockAuthProviderProgress(page)).toEqual({
      signInCodeChecks: 0,
      signUpCodeChecks: 1,
      signUpPasswords: 0,
      signUpFinalizes: 0,
    });

    await password.fill(MOCK_PASSWORD);
    await submitButton(page).click();

    await expectSessionOpening(page);
    expect(await mockAuthProviderProgress(page)).toEqual({
      signInCodeChecks: 0,
      signUpCodeChecks: 1,
      signUpPasswords: 1,
      signUpFinalizes: 1,
    });
  });

  test('a wrong sign-up code is refused against the code field, and the right one still opens the session', async ({
    page,
  }) => {
    const code = await openSignUpCodeStep(page, MOCK_SIGNUP_CODE_ONLY_ACCOUNT);

    await code.pressSequentially(WRONG_CODE);

    const alert = page.getByTestId('auth-layout').getByRole('alert');
    await expect(alert).toHaveText(CODE_REFUSED);
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (await code.getAttribute('aria-describedby')) ?? '';
    expect(describedBy.split(' ')).toContain(await alert.getAttribute('id'));
    await expect(code).toBeEditable();
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await expect(page.getByTestId('auth-phase')).toHaveText('');
    expect(await mockAuthProviderProgress(page)).toEqual({
      signInCodeChecks: 0,
      signUpCodeChecks: 1,
      signUpPasswords: 0,
      signUpFinalizes: 0,
    });

    await code.fill('');
    await code.pressSequentially(MOCK_CODE);

    await expectSessionOpening(page);
    expect(await mockAuthProviderProgress(page)).toEqual({
      signInCodeChecks: 0,
      signUpCodeChecks: 2,
      signUpPasswords: 0,
      signUpFinalizes: 1,
    });
  });

  test('a new password the provider refuses is refused against the password field, and a longer one is accepted', async ({
    page,
  }) => {
    const code = await openSignUpCodeStep(page, MOCK_SIGNUP_PASSWORD_ACCOUNT);
    await code.pressSequentially(MOCK_CODE);
    await expect(page.getByRole('heading', { name: 'Create a password' })).toBeVisible();
    const password = passwordField(page);

    await password.fill(TOO_SHORT_PASSWORD);
    await submitButton(page).click();

    const alert = page.getByTestId('auth-layout').getByRole('alert');
    await expect(alert).toHaveText(MOCK_SHORT_PASSWORD_REFUSAL);
    await expect(password).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (await password.getAttribute('aria-describedby')) ?? '';
    expect(describedBy.split(' ')).toContain(await alert.getAttribute('id'));
    await expect(password).toBeFocused();
    await expect(password).toHaveValue(TOO_SHORT_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Create a password' })).toBeVisible();
    await expect(page.locator('svg.auth-scene')).toHaveAttribute('data-mood', 'error');
    expect(await mockAuthProviderProgress(page)).toEqual({
      signInCodeChecks: 0,
      signUpCodeChecks: 1,
      signUpPasswords: 1,
      signUpFinalizes: 0,
    });

    await password.fill(MOCK_PASSWORD);
    await submitButton(page).click();

    await expectSessionOpening(page);
    expect(await mockAuthProviderProgress(page)).toEqual({
      signInCodeChecks: 0,
      signUpCodeChecks: 1,
      signUpPasswords: 2,
      signUpFinalizes: 1,
    });
  });

  test('a new account records the terms alone, with no age and no marketing email choice', async ({
    page,
  }) => {
    const leaving = await keepEveryRequestOnThisMachine(page);
    const termsRequests = await answerTermsRequests(page);
    const handedOn = await stopWhereTheFlowHandsOn(page, NEW_ACCOUNT_DESTINATION);
    const code = await openSignUpCodeStep(page, MOCK_SIGNUP_CODE_ONLY_ACCOUNT, '/signup', {
      signUpOpensSession: true,
    });

    expect(await carriedMarkers(page)).toEqual({
      ...NOTHING_CARRIED,
      terms: POLICY_LAST_UPDATED.terms,
    });

    await code.pressSequentially(MOCK_CODE);

    await expect(handedOn).toHaveText(NEW_ACCOUNT_DESTINATION, {
      timeout: NEXT_DOCUMENT_TIMEOUT_MS,
    });
    expect(termsRequests).toEqual([{ surface: 'web-signup', version: POLICY_LAST_UPDATED.terms }]);
    expect(await carriedMarkers(page)).toEqual(NOTHING_CARRIED);
    expect(leaving, 'nothing left this machine and no identity API was called').toEqual([]);
  });

  test('a provider starts as a sign-in, and a refused hand-off leaves no marker', async ({
    page,
  }) => {
    await openAuth(page, '/signup');

    await page
      .getByTestId('auth-layout')
      .getByRole('button', { name: /^Continue with / })
      .first()
      .click();

    await expect.poll(async () => (await mockAuthProviderCalls(page)).signInSso).toBe(1);
    await expect.poll(async () => (await carriedMarkers(page)).terms).toBeNull();
    expect(await mockAuthProviderCalls(page)).toEqual({
      signInCreate: 0,
      signUpCreate: 0,
      signUpSso: 0,
      signInSso: 1,
    });
    expect(await carriedMarkers(page)).toEqual(NOTHING_CARRIED);
  });

  test('Try again after a dropped sign-up request starts the sign-up again', async ({ page }) => {
    await openAuth(page, '/signup', { signUpNetworkFailures: 1 });
    await continueWith(page, MOCK_SIGNUP_CODE_ONLY_ACCOUNT);
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible();
    expect((await mockAuthProviderCalls(page)).signUpCreate).toBe(1);
    expect((await carriedMarkers(page)).terms).toBeNull();

    await retry.click();

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    expect((await mockAuthProviderCalls(page)).signUpCreate).toBe(2);
    expect((await carriedMarkers(page)).terms).toBe(POLICY_LAST_UPDATED.terms);
  });
});
