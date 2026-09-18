import { expect, test, type Page } from '@playwright/test';

import {
  collectEvidence,
  invokedToolNames,
  runtimeToolEvents,
  signIn,
  type RuntimeEvidence,
} from './qa-capability-harness';

/**
 * The Tool Approvals setting has to govern web search, because it names it, and
 * each of the three policies has to mean something different for it.
 *
 * It once meant nothing. A provider-native search runs inside the provider's own
 * turn and never becomes a tool call, so the loop's gate was structurally
 * unreachable for it; and even our own `web_search` function tool ran
 * unattended, because `approvalMode` was `hasMcpTools ? 'manual' : 'auto'` and
 * 'auto' short-circuits the gate before the account policy is read. A user who
 * chose "Ask before every action" watched web search execute unprompted, two
 * attempts out of two.
 *
 * This drives the setting itself and then a search-triggering prompt, which is
 * the only way to observe both halves: the substitution happens on the server
 * and the gate happens in the loop.
 */
const SETTINGS_ROUTE = '/settings/capabilities';
const CHAT_ROUTE = '/chat';
const COMPOSER_LABEL = /message input/i;
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const ASK_EVERY_TIME = /Ask before every action/i;
const AUTO_APPROVE_READ_ONLY = /Run read-only actions without asking/i;
const SKIP_APPROVALS = /Skip approvals/i;
const REVIEW_ROW = /Review Web Search action/i;
const APPROVALS_BADGE = /Approvals/i;

const LOAD_TIMEOUT_MS = 30_000;
const APPROVAL_TIMEOUT_MS = 120_000;
const SEARCH_TIMEOUT_MS = 120_000;

async function setToolApprovalPolicy(page: Page, option: RegExp): Promise<void> {
  await page.goto(SETTINGS_ROUTE, { waitUntil: 'domcontentloaded' });
  await dismissConsent(page);
  const radio = page.getByRole('radio', { name: option });
  await expect(radio).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  await expect(radio).toBeEnabled();
  await radio.check();
  await expect(radio).toBeChecked();
  // The choice is persisted through the preferences API; sending before it
  // lands would read the previous policy on the server.
  await page.waitForTimeout(2_000);
}

async function sendSearchPrompt(page: Page): Promise<void> {
  await page.goto(CHAT_ROUTE, { waitUntil: 'domcontentloaded' });
  const composer = page.getByLabel(COMPOSER_LABEL);
  await expect(composer).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  await composer.click();
  await composer.fill('Search the web and tell me one recent headline about semiconductors.');
  await composer.press('Enter');
}

async function dismissConsent(page: Page): Promise<void> {
  await page
    .getByLabel(CONSENT_DISMISS_LABEL)
    .click({ timeout: 5_000 })
    .catch(() => undefined);
}

async function expectSearchRanUnasked(page: Page, evidence: RuntimeEvidence): Promise<void> {
  await expect
    .poll(() => invokedToolNames(runtimeToolEvents(evidence)), { timeout: SEARCH_TIMEOUT_MS })
    .toContain('web_search');
  expect(runtimeToolEvents(evidence).map((event) => event.event)).not.toContain(
    'x_tool_approval_request',
  );
  await expect(page.getByText(REVIEW_ROW)).toHaveCount(0);
}

test.describe.configure({ mode: 'serial' });

test.describe('Tool Approvals governs web search', () => {
  test('a search-triggering prompt stops for approval under "Ask before every action"', async ({
    page,
  }) => {
    await signIn(page);
    await setToolApprovalPolicy(page, ASK_EVERY_TIME);
    await sendSearchPrompt(page);

    // Before the fix the search simply ran: results appeared with no prompt of
    // any kind, on both policies, two attempts out of two.
    await expect(page.getByText(REVIEW_ROW).first()).toBeVisible({
      timeout: APPROVAL_TIMEOUT_MS,
    });
    await expect(page.getByRole('button', { name: APPROVALS_BADGE }).first()).toBeVisible();
  });

  test('it runs unasked when the account auto-approves read-only work', async ({ page }) => {
    // D-2026-09-15-01: search, page fetch and sandboxed code are the leaders'
    // automatic tools, so this policy runs them without asking. The option's
    // copy says so; it used to claim web search "still asks first".
    await signIn(page);
    const evidence = collectEvidence(page);
    await setToolApprovalPolicy(page, AUTO_APPROVE_READ_ONLY);
    await sendSearchPrompt(page);

    await expectSearchRanUnasked(page, evidence);
  });

  test('it runs unasked when the account skips approvals', async ({ page }) => {
    await signIn(page);
    const evidence = collectEvidence(page);
    await setToolApprovalPolicy(page, SKIP_APPROVALS);
    await sendSearchPrompt(page);

    await expectSearchRanUnasked(page, evidence);
  });
});
