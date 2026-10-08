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
import { ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';
import { FREE_PLAN_TRAINING_SIGNUP_STATEMENT } from '../lib/compliance/free-plan-training-disclosure';
import { POLICY_LAST_UPDATED } from '../lib/legal-constants';

// Vendor-response states are covered in features/auth/__tests__/AuthFlow.states.test.tsx.
// Here is what only a browser answers: real focus order, real event order, real
// layout at real widths, and that a refused sign-up attempt sends nothing anywhere.
const ROUTES = ['/login', '/signup'] as const;

const PHONE = { width: 390, height: 844 };
const ZOOMED = { width: 640, height: 512 };
const NO_AGE_ATTEMPT_EMAIL = 'no-age-attempt@example.invalid';
const AGE_REQUIRED = /enter your age in years to continue/i;
const AGE_INELIGIBLE = /you must be at least \d+ years old to create an account/i;
const AGREEMENT =
  'By creating an account, you agree to the Terms of Use and acknowledge the Privacy Policy.';
const ELIGIBLE_AGE = String(ACCOUNT_MINIMUM_AGE);
const TOO_YOUNG = String(ACCOUNT_MINIMUM_AGE - 1);
const MOCK_CODE = MOCK_EMAILED_CODE;
const WRONG_CODE = '000000';
const CODE_REFUSED = /check the last code we emailed you/i;
const MOCK_PASSWORD = 'a long passphrase nobody reuses';
const TOO_SHORT_PASSWORD = 'short';
const PASSWORD_RULE = /use at least \d+ characters/i;
const GENERIC_FAILURE = /something went wrong/i;
const WRONG_PASSWORD = 'not the password this account has';
const PASSWORD_REFUSED = /email and password do not match/i;
const PASSWORDLESS_REASON = /does not use a password, so we emailed a code/i;
const LAPTOP = { width: 1366, height: 768 };
const NEW_ACCOUNT_DESTINATION = '/chat';
const TERMS_REVIEW_PATH = '/login/complete';
const NOTHING_CARRIED = { terms: null, choice: null, attempt: null, attemptInThisTab: null };
const NEXT_DOCUMENT_TIMEOUT_MS = 30_000;

function ageField(page: Page) {
  return page.getByTestId('auth-age-field').getByRole('textbox');
}

function ageAlert(page: Page) {
  return page.getByTestId('auth-age-field').getByRole('alert');
}

function marketingEmailBox(page: Page) {
  return page.getByTestId('auth-marketing-email-consent').getByRole('checkbox');
}

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
  await expect(page.getByTestId('auth-layout')).toBeVisible();
  const submit = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(submit).toBeEnabled();
  if (route === '/signup') {
    await expect(ageField(page)).toHaveValue('');
    for (const provider of await page.getByTestId('auth-layout').getByRole('button').all()) {
      await expect(provider).toBeEnabled();
    }
  }
}

/** Every request that leaves the dev server, plus any identity API path on it. */
function watchOutboundRequests(page: Page): string[] {
  const outbound: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!local || url.pathname.startsWith('/v1/')) outbound.push(request.url());
  });
  return outbound;
}

function namesAnAge(key: string): boolean {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((word) => /^(?:age[ds]?|birth\w*|dob)$/.test(word));
}

async function expectRefused(page: Page, message: RegExp = AGE_REQUIRED): Promise<void> {
  const field = ageField(page);
  const alert = ageAlert(page);
  await expect(alert).toHaveText(message);
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const describedBy = (await field.getAttribute('aria-describedby')) ?? '';
  expect(describedBy.split(' ')).toContain(await alert.getAttribute('id'));
  await expect(page).toHaveURL(/\/signup(?:\?|$)/);
}

async function openCodeStep(page: Page): Promise<Locator> {
  await openAuth(page, '/login');
  await page.getByLabel('Email address').fill(MOCK_CODE_ACCOUNT);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
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

async function openSignUpCodeStep(page: Page, email: string): Promise<Locator> {
  await openAuth(page, '/signup');
  await ageField(page).fill(ELIGIBLE_AGE);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
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
    choice: window.localStorage.getItem('agi.marketing-email-notice-version'),
    attempt: window.localStorage.getItem('agi.marketing-email-attempt-id'),
    attemptInThisTab: window.sessionStorage.getItem('agi.marketing-email-attempt-id'),
  }));
}

async function admitSignUpToItsCodeStep(
  page: Page,
  { email, marketingEmail }: { email: string; marketingEmail: boolean },
): Promise<Locator> {
  await openAuth(page, '/signup', { signUpOpensSession: true });
  await ageField(page).fill(ELIGIBLE_AGE);
  if (marketingEmail) await marketingEmailBox(page).check();
  await page.getByLabel('Email address').fill(email);
  await submitButton(page).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  const code = page.getByLabel('Code', { exact: true });
  await expect(code).toBeEditable();
  return code;
}

async function expectSessionOpening(page: Page): Promise<void> {
  await expect(page.getByTestId('auth-phase')).toHaveText('Signing you in');
  await expect(page.getByTestId('auth-layout').getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('auth-layout').getByText(GENERIC_FAILURE)).toHaveCount(0);
}

test.describe('auth flow states', () => {
  for (const route of ROUTES) {
    test(`${route} starts on the email step with nothing entered or refused`, async ({ page }) => {
      await openAuth(page, route);

      const email = page.getByLabel('Email address');
      await expect(email).toBeVisible();
      if (route === '/signup') {
        await expect(email).not.toBeFocused();
        await expect(ageField(page)).toHaveValue('');
        await expect(ageField(page)).toHaveAttribute('inputmode', 'numeric');
        await expect(ageAlert(page)).toHaveCount(0);
        await expect(page.getByTestId('auth-signup-agreement')).toHaveText(AGREEMENT);
        await expect(page.getByTestId('auth-signup-agreement').getByRole('checkbox')).toHaveCount(
          0,
        );
        await expect(passwordField(page)).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Forgot password?' })).toHaveCount(0);
      } else {
        await expect(email).toBeFocused();
        await expect(page.getByTestId('auth-age-field')).toHaveCount(0);
        await expect(page.getByTestId('auth-signup-agreement')).toHaveCount(0);
        await expect(passwordField(page)).toBeVisible();
        await expect(passwordField(page)).toHaveAttribute('type', 'password');
        await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
      }
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

      if (route === '/signup') {
        const age = ageField(page);
        const maximumTabs = (await page.locator('button, input, a[href], summary').count()) * 2;
        for (let step = 0; step < maximumTabs; step += 1) {
          if (await age.evaluate((element) => element === document.activeElement)) break;
          await page.keyboard.press('Tab');
        }
        await expect(age).toBeFocused();
        await page.keyboard.type(ELIGIBLE_AGE);
        await expect(age).toHaveValue(ELIGIBLE_AGE);
        await expect(ageAlert(page)).toHaveCount(0);
        for (const _digit of ELIGIBLE_AGE) await page.keyboard.press('Backspace');
        await expect(age).toHaveValue('');
      }
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

      const submit = page.getByRole('button', { name: 'Continue', exact: true });
      const box = await submit.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
    });
  }

  test('/signup opens nearby data-use details from the keyboard without starting a sign-up', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openAuth(page, '/signup');

    const notice = page.getByTestId('auth-data-use-notice');
    const summary = notice.locator('summary');
    const fullStatement = notice.getByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT);
    await expect(fullStatement).not.toBeVisible();

    await summary.focus();
    await summary.press('Enter');

    await expect(fullStatement).toBeVisible();
    await expect(notice.getByRole('link', { name: 'Data Use Guidelines' })).toHaveAttribute(
      'href',
      '/data-use',
    );
    await expect(ageField(page)).toHaveValue('');
    await expect(ageAlert(page)).toHaveCount(0);
    expect(await mockAuthProviderCalls(page)).toEqual({
      signInCreate: 0,
      signUpCreate: 0,
      signUpSso: 0,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);

    await summary.press('Space');

    await expect(fullStatement).not.toBeVisible();
    await expect(summary).toBeFocused();
  });

  test('/signup asks about marketing email in a separate optional box that starts unticked', async ({
    page,
  }) => {
    await openAuth(page, '/signup');
    const optional = marketingEmailBox(page);
    await expect(optional).not.toBeChecked();
    await expect(optional).toBeEnabled();

    await submitButton(page).focus();
    const maximumTabs = (await page.locator('button, input, a[href], summary').count()) * 2;
    const passed: string[] = [];
    for (let step = 0; step < maximumTabs; step += 1) {
      await page.keyboard.press('Tab');
      if (await optional.evaluate((element) => element === document.activeElement)) break;
      passed.push(await page.evaluate(() => document.activeElement?.tagName ?? ''));
    }
    await expect(optional).toBeFocused();
    expect(
      passed,
      'only the policy links of the agreement sit between the action and the box',
    ).toEqual(passed.filter((tag) => tag === 'A'));

    await page.keyboard.press('Space');
    await expect(optional).toBeChecked();
    await expect(ageField(page)).toHaveValue('');
    await expect(page.getByTestId('auth-layout').getByRole('alert')).toHaveCount(0);
    expect(
      await page.evaluate(() => [
        window.localStorage.getItem('agi.terms-accepted-version'),
        window.localStorage.getItem('agi.marketing-email-notice-version'),
      ]),
      'ticking the box alone carries nothing',
    ).toEqual([null, null]);
    expect(await mockAuthProviderCalls(page)).toEqual({
      signInCreate: 0,
      signUpCreate: 0,
      signUpSso: 0,
    });

    await page.reload({ waitUntil: 'load' });
    await expect(page.getByTestId('auth-layout')).toBeVisible();
    await expect(marketingEmailBox(page)).not.toBeChecked();
  });

  test('/signup holds the marketing email box off under Global Privacy Control and says why', async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP);
    await page.setExtraHTTPHeaders({ 'Sec-GPC': '1' });
    await openAuth(page, '/signup');
    const optional = marketingEmailBox(page);

    await expect(optional).toBeDisabled();
    await expect(optional).not.toBeChecked();
    const describedBy = await optional.getAttribute('aria-describedby');
    expect(describedBy, 'the box points at the reason it is held').toBeTruthy();
    const reason = page.locator(`[id="${describedBy}"]`);
    await expect(reason).toContainText('Global Privacy Control');
    await page.evaluate(() => document.fonts.ready);
    expect(
      await reason.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return new Set([...range.getClientRects()].map((line) => Math.round(line.top))).size;
      }),
      'the reason fits one line at 1366 wide',
    ).toBe(1);
    await expect(ageField(page)).toBeEnabled();

    await submitButton(page).focus();
    const maximumTabs = (await page.locator('button, input, a[href], summary').count()) * 2;
    for (let step = 0; step < maximumTabs; step += 1) {
      await page.keyboard.press('Tab');
      if (await optional.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(optional, 'a keyboard reaches the held box and hears its reason').toBeFocused();
    await page.keyboard.press('Space');
    await expect(optional).not.toBeChecked();
    await page.getByTestId('auth-marketing-email-consent').locator('label').click({ force: true });
    await expect(optional).not.toBeChecked();
  });

  test('/signup refuses every sign-up method until an age is entered and reaches no provider', async ({
    page,
  }) => {
    await openAuth(page, '/signup');
    const outbound = watchOutboundRequests(page);

    await page.getByLabel('Email address').fill(NO_AGE_ATTEMPT_EMAIL);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expectRefused(page);

    await page.getByLabel('Email address').press('Enter');
    await expectRefused(page);

    for (const provider of await page
      .getByTestId('auth-layout')
      .getByRole('button', { name: /^Continue with / })
      .all()) {
      await provider.click();
      await expectRefused(page);
    }

    await expect(page.getByTestId('auth-phase')).toHaveText('');
    await expect(page.getByLabel('Email address')).toHaveValue(NO_AGE_ATTEMPT_EMAIL);
    expect(await mockAuthProviderCalls(page)).toEqual({
      signInCreate: 0,
      signUpCreate: 0,
      signUpSso: 0,
    });
    expect(
      await page.evaluate(() => [
        window.localStorage.getItem('agi.terms-accepted-version'),
        window.localStorage.getItem('agiworkforce-auth-last-method'),
      ]),
    ).toEqual([null, null]);
    expect(outbound, 'a refused attempt sends nothing to the identity provider').toEqual([]);

    await ageField(page).fill(ELIGIBLE_AGE);
    await expect(ageAlert(page)).toHaveCount(0);
    await expect(ageField(page)).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  });

  test('/signup refuses an age under the minimum at every sign-up method and reaches no provider', async ({
    page,
  }) => {
    await openAuth(page, '/signup');
    const outbound = watchOutboundRequests(page);

    await page.getByLabel('Email address').fill(NO_AGE_ATTEMPT_EMAIL);
    await ageField(page).fill(TOO_YOUNG);
    await expect(ageAlert(page)).toHaveCount(0);
    await submitButton(page).click();
    await expectRefused(page, AGE_INELIGIBLE);

    await ageField(page).press('Enter');
    await expectRefused(page, AGE_INELIGIBLE);

    for (const provider of await page
      .getByTestId('auth-layout')
      .getByRole('button', { name: /^Continue with / })
      .all()) {
      await provider.click();
      await expectRefused(page, AGE_INELIGIBLE);
    }

    await expect(page.getByTestId('auth-phase')).toHaveText('');
    expect(await mockAuthProviderCalls(page)).toEqual({
      signInCreate: 0,
      signUpCreate: 0,
      signUpSso: 0,
    });
    expect(
      await page
        .evaluate(() => [
          window.localStorage.getItem('agi.terms-accepted-version'),
          window.localStorage.getItem('agiworkforce-auth-last-method'),
          ...[...Object.keys(window.localStorage), ...Object.keys(window.sessionStorage)],
        ])
        .then(([terms, lastMethod, ...keys]) => [
          terms,
          lastMethod,
          ...keys.filter((key) => key !== null && namesAnAge(key)),
        ]),
      'a refused age leaves no marker and no stored key that names an age',
    ).toEqual([null, null]);
    expect(outbound, 'a refused attempt sends nothing to the identity provider').toEqual([]);
  });

  test('/signup keeps an admitted age out of every request, the address bar and browser storage', async ({
    page,
  }) => {
    await openAuth(page, '/signup');
    const carriedAnAge: string[] = [];
    page.on('request', (request) => {
      const sent = `${new URL(request.url()).search} ${request.postData() ?? ''}`;
      if (/(?:^|[?&"\s{,])age(?:"|=|%3D)/i.test(sent)) carriedAnAge.push(request.url());
    });

    await ageField(page).fill(ELIGIBLE_AGE);
    await expect(ageField(page)).not.toHaveAttribute('name');
    await page.getByLabel('Email address').fill(MOCK_SIGNUP_CODE_ONLY_ACCOUNT);
    await submitButton(page).click();

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    expect((await mockAuthProviderCalls(page)).signUpCreate).toBe(1);
    expect(carriedAnAge, 'no request names an age').toEqual([]);
    expect(new URL(page.url()).search).not.toMatch(/age/i);
    expect(
      await page
        .evaluate(() => [
          ...Object.keys(window.localStorage),
          ...Object.keys(window.sessionStorage),
        ])
        .then((keys) => keys.filter(namesAnAge)),
      'no stored key names an age',
    ).toEqual([]);
    await expect(ageField(page)).toHaveCount(0);
  });

  test('an email with no account names the way over to sign-up', async ({ page }) => {
    await openAuth(page, '/login');

    await page.getByLabel('Email address').fill(`no-account-${Date.now()}@example.invalid`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByTestId('auth-layout').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up instead.' })).toBeVisible();
  });

  test('an address and its password typed on one screen open the session', async ({ page }) => {
    await openAuth(page, '/login');

    await page.getByLabel('Email address').fill(MOCK_PASSWORD_ACCOUNT);
    await passwordField(page).fill(MOCK_ACCOUNT_PASSWORD);
    await submitButton(page).click();

    await expectSessionOpening(page);
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    expect((await mockAuthProviderCalls(page)).signInCreate).toBe(1);
    expect(await mockAuthProviderSignIn(page)).toEqual({
      passwordChecks: 1,
      sessionsOpened: 1,
      resetCodesSent: 0,
    });
    expect(
      await page.evaluate(() => window.localStorage.getItem('agiworkforce-auth-last-method')),
    ).toBe('method:password');
  });

  test('a wrong password is refused on the same screen, against the password field', async ({
    page,
  }) => {
    await openAuth(page, '/login');
    const email = page.getByLabel('Email address');
    const password = passwordField(page);

    await email.fill(MOCK_PASSWORD_ACCOUNT);
    await password.fill(WRONG_PASSWORD);
    await password.press('Enter');

    const alert = page.getByTestId('auth-layout').getByRole('alert');
    await expect(alert).toHaveText(PASSWORD_REFUSED);
    await expect(password).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (await password.getAttribute('aria-describedby')) ?? '';
    expect(describedBy.split(' ')).toContain(await alert.getAttribute('id'));
    await expect(password).toBeFocused();
    await expect(password).toHaveValue(WRONG_PASSWORD);
    await expect(email).toHaveValue(MOCK_PASSWORD_ACCOUNT);
    await expect(email).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toHaveCount(0);
    await expect(page.getByTestId('auth-phase')).toHaveText('');
    await expect(page.locator('svg.auth-scene')).toHaveAttribute('data-mood', 'error');
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    expect(new URL(page.url()).search).not.toContain(encodeURIComponent(WRONG_PASSWORD));
    expect(await mockAuthProviderSignIn(page)).toEqual({
      passwordChecks: 1,
      sessionsOpened: 0,
      resetCodesSent: 0,
    });

    await password.fill(MOCK_ACCOUNT_PASSWORD);
    await submitButton(page).click();

    await expectSessionOpening(page);
    expect(await mockAuthProviderSignIn(page)).toEqual({
      passwordChecks: 2,
      sessionsOpened: 1,
      resetCodesSent: 0,
    });
  });

  test('a password typed for an account that has none is sent nowhere, and its code step says why', async ({
    page,
  }) => {
    await openAuth(page, '/login');

    await page.getByLabel('Email address').fill(MOCK_CODE_ACCOUNT);
    await passwordField(page).fill(MOCK_ACCOUNT_PASSWORD);
    await submitButton(page).click();

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await expect(page.getByTestId('auth-layout').getByText(PASSWORDLESS_REASON)).toBeVisible();
    await expect(page.getByLabel('Code', { exact: true })).toBeFocused();
    await expect(passwordField(page)).toHaveCount(0);
    await expect(page.getByTestId('auth-layout').getByRole('alert')).toHaveCount(0);
    expect(await mockAuthProviderSignIn(page)).toEqual({
      passwordChecks: 0,
      sessionsOpened: 0,
      resetCodesSent: 0,
    });
  });

  test('an empty password keeps the email-first path, and the password step still opens the session', async ({
    page,
  }) => {
    await openAuth(page, '/login');

    await page.getByLabel('Email address').fill(MOCK_PASSWORD_ACCOUNT);
    await submitButton(page).click();

    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
    await expect(passwordField(page)).toBeFocused();
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    expect(await mockAuthProviderSignIn(page)).toEqual({
      passwordChecks: 0,
      sessionsOpened: 0,
      resetCodesSent: 0,
    });

    await passwordField(page).fill(MOCK_ACCOUNT_PASSWORD);
    await submitButton(page).click();

    await expectSessionOpening(page);
    expect(await mockAuthProviderSignIn(page)).toEqual({
      passwordChecks: 1,
      sessionsOpened: 1,
      resetCodesSent: 0,
    });
  });

  test('an empty password for a code account keeps its plain code step', async ({ page }) => {
    await openCodeStep(page);

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await expect(
      page.getByTestId('auth-layout').getByText(`We sent a code to ${MOCK_CODE_ACCOUNT}`),
    ).toBeVisible();
    await expect(page.getByTestId('auth-layout').getByText(PASSWORDLESS_REASON)).toHaveCount(0);
  });

  test('the recovery link asks for the address first, then emails that address a reset code', async ({
    page,
  }) => {
    await openAuth(page, '/login');
    const email = page.getByLabel('Email address');
    const recover = page.getByRole('button', { name: 'Forgot password?' });

    await passwordField(page).focus();
    await recover.click();

    await expect(email).toBeFocused();
    expect(await email.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(
      true,
    );
    await expect(page.getByTestId('auth-phase')).toHaveText('');
    expect((await mockAuthProviderCalls(page)).signInCreate).toBe(0);

    await email.fill(MOCK_PASSWORD_ACCOUNT);
    await recover.click();

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

  test('a sign-in the browser filled in before the page hydrated is kept and opens the session', async ({
    page,
  }) => {
    await page.addInitScript(
      ([address, secret]: readonly [string, string]) => {
        const observer = new MutationObserver(() => {
          const email = document.querySelector<HTMLInputElement>('input[name="email"]');
          const password = document.querySelector<HTMLInputElement>('input[name="password"]');
          if (!email || !password) return;
          observer.disconnect();
          email.value = address;
          password.value = secret;
        });
        observer.observe(document, { childList: true, subtree: true });
      },
      [MOCK_PASSWORD_ACCOUNT, MOCK_ACCOUNT_PASSWORD] as const,
    );
    await openAuth(page, '/login');

    await expect(page.getByLabel('Email address')).toHaveValue(MOCK_PASSWORD_ACCOUNT);
    await expect(passwordField(page)).toHaveValue(MOCK_ACCOUNT_PASSWORD);
    await submitButton(page).click();

    await expectSessionOpening(page);
    expect(await mockAuthProviderSignIn(page)).toEqual({
      passwordChecks: 1,
      sessionsOpened: 1,
      resetCodesSent: 0,
    });
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
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

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
    const code = await openSignUpCodeStep(page, MOCK_SIGNUP_PASSWORD_ACCOUNT);

    await code.pressSequentially(MOCK_CODE);

    await expect(page.getByRole('heading', { name: 'Create a password' })).toBeVisible();
    const password = page.getByLabel('Password', { exact: true });
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
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

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
    const password = page.getByLabel('Password', { exact: true });

    await password.fill(TOO_SHORT_PASSWORD);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

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
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expectSessionOpening(page);
    expect(await mockAuthProviderProgress(page)).toEqual({
      signInCodeChecks: 0,
      signUpCodeChecks: 1,
      signUpPasswords: 2,
      signUpFinalizes: 1,
    });
  });

  test('a sign-up with both boxes ticked sends the marketing email choice with the terms it records', async ({
    page,
  }) => {
    const leaving = await keepEveryRequestOnThisMachine(page);
    const termsRequests = await answerTermsRequests(page);
    const handedOn = await stopWhereTheFlowHandsOn(page, NEW_ACCOUNT_DESTINATION);
    const code = await admitSignUpToItsCodeStep(page, {
      email: MOCK_SIGNUP_CODE_ONLY_ACCOUNT,
      marketingEmail: true,
    });

    const carried = await carriedMarkers(page);
    expect(carried.terms).toBe(POLICY_LAST_UPDATED.terms);
    expect(carried.choice).toBe(POLICY_LAST_UPDATED.privacy);
    expect(carried.attempt, 'the choice is tied to an attempt').toBeTruthy();
    expect(carried.attemptInThisTab, 'this tab holds the same attempt').toBe(carried.attempt);

    await code.pressSequentially(MOCK_CODE);

    await expect(handedOn).toHaveText(NEW_ACCOUNT_DESTINATION, {
      timeout: NEXT_DOCUMENT_TIMEOUT_MS,
    });
    expect(termsRequests).toEqual([
      {
        surface: 'web-signup',
        version: POLICY_LAST_UPDATED.terms,
        marketingEmailNoticeVersion: POLICY_LAST_UPDATED.privacy,
      },
    ]);
    expect(await carriedMarkers(page), 'nothing outlives the recorded attempt').toEqual(
      NOTHING_CARRIED,
    );
    expect(leaving, 'nothing left this machine and no identity API was called').toEqual([]);
  });

  test('a sign-up with the marketing email box left empty sends the terms alone', async ({
    page,
  }) => {
    const leaving = await keepEveryRequestOnThisMachine(page);
    const termsRequests = await answerTermsRequests(page);
    const handedOn = await stopWhereTheFlowHandsOn(page, NEW_ACCOUNT_DESTINATION);
    const code = await admitSignUpToItsCodeStep(page, {
      email: MOCK_SIGNUP_CODE_ONLY_ACCOUNT,
      marketingEmail: false,
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
    expect(Object.keys(termsRequests[0] ?? {})).not.toContain('marketingEmailNoticeVersion');
    expect(await carriedMarkers(page)).toEqual(NOTHING_CARRIED);
    expect(leaving, 'nothing left this machine and no identity API was called').toEqual([]);
  });

  test('a marketing email choice ticked in a second tab is never recorded for the sign-up an older tab finishes', async ({
    page: olderTab,
    context,
  }) => {
    const newerTab = await context.newPage();
    const leaving = [
      await keepEveryRequestOnThisMachine(olderTab),
      await keepEveryRequestOnThisMachine(newerTab),
    ];
    const termsRequests = await answerTermsRequests(olderTab);
    const askedAgain = await stopWhereTheFlowHandsOn(olderTab, TERMS_REVIEW_PATH);
    const olderCode = await admitSignUpToItsCodeStep(olderTab, {
      email: MOCK_SIGNUP_CODE_ONLY_ACCOUNT,
      marketingEmail: false,
    });
    await admitSignUpToItsCodeStep(newerTab, {
      email: MOCK_SIGNUP_PASSWORD_ACCOUNT,
      marketingEmail: true,
    });

    const seenFromOlderTab = await carriedMarkers(olderTab);
    expect(seenFromOlderTab.choice, 'the newer tab left its choice for the whole browser').toBe(
      POLICY_LAST_UPDATED.privacy,
    );
    expect(seenFromOlderTab.attempt).toBeTruthy();
    expect(seenFromOlderTab.attemptInThisTab, 'the older tab never held that attempt').toBeNull();

    await olderCode.pressSequentially(MOCK_CODE);

    await expect(askedAgain).toHaveText(TERMS_REVIEW_PATH, {
      timeout: NEXT_DOCUMENT_TIMEOUT_MS,
    });
    expect(termsRequests, 'nothing is recorded for the attempt the choice was not made in').toEqual(
      [],
    );
    expect(await carriedMarkers(olderTab)).toEqual(NOTHING_CARRIED);
    expect(leaving.flat(), 'nothing left this machine and no identity API was called').toEqual([]);
  });

  test('a marketing email choice an older tab ticked is asked again when a second tab is admitted with the box empty', async ({
    page: olderTab,
    context,
  }) => {
    const newerTab = await context.newPage();
    const leaving = [
      await keepEveryRequestOnThisMachine(olderTab),
      await keepEveryRequestOnThisMachine(newerTab),
    ];
    const termsRequests = await answerTermsRequests(olderTab);
    const askedAgain = await stopWhereTheFlowHandsOn(olderTab, TERMS_REVIEW_PATH);
    const olderCode = await admitSignUpToItsCodeStep(olderTab, {
      email: MOCK_SIGNUP_CODE_ONLY_ACCOUNT,
      marketingEmail: true,
    });
    const ticked = await carriedMarkers(olderTab);
    expect(ticked.choice).toBe(POLICY_LAST_UPDATED.privacy);
    expect(ticked.attempt, 'the choice is tied to an attempt').toBeTruthy();
    expect(ticked.attemptInThisTab, 'the older tab holds that attempt').toBe(ticked.attempt);

    await admitSignUpToItsCodeStep(newerTab, {
      email: MOCK_SIGNUP_PASSWORD_ACCOUNT,
      marketingEmail: false,
    });

    expect(
      await carriedMarkers(olderTab),
      'the newer tab removed the choice and the older tab still holds its attempt',
    ).toEqual({
      terms: POLICY_LAST_UPDATED.terms,
      choice: null,
      attempt: null,
      attemptInThisTab: ticked.attempt,
    });

    await olderCode.pressSequentially(MOCK_CODE);

    await expect(askedAgain).toHaveText(TERMS_REVIEW_PATH, {
      timeout: NEXT_DOCUMENT_TIMEOUT_MS,
    });
    expect(termsRequests, 'the terms are not recorded without the choice that was ticked').toEqual(
      [],
    );
    expect(await carriedMarkers(olderTab)).toEqual(NOTHING_CARRIED);
    expect(leaving.flat(), 'nothing left this machine and no identity API was called').toEqual([]);
  });

  test('Try again starts nothing on /signup once the age is no longer eligible', async ({
    page,
  }) => {
    await openAuth(page, '/signup', { signUpNetworkFailures: 1 });
    await ageField(page).fill(ELIGIBLE_AGE);
    await page.getByLabel('Email address').fill(MOCK_SIGNUP_CODE_ONLY_ACCOUNT);
    await submitButton(page).click();
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible();
    expect((await mockAuthProviderCalls(page)).signUpCreate).toBe(1);
    const outbound = watchOutboundRequests(page);

    await ageField(page).fill(TOO_YOUNG);
    await retry.click();

    await expectRefused(page, AGE_INELIGIBLE);
    expect((await mockAuthProviderCalls(page)).signUpCreate).toBe(1);
    expect(
      await page.evaluate(() => window.localStorage.getItem('agi.terms-accepted-version')),
    ).toBeNull();
    expect(outbound, 'a refused retry sends nothing to the identity provider').toEqual([]);

    await ageField(page).fill(ELIGIBLE_AGE);
    await retry.click();

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    expect((await mockAuthProviderCalls(page)).signUpCreate).toBe(2);
  });
});
