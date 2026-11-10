import { expect, test, type Page } from '@playwright/test';
import { mintSignInTicketFor, signInAsDevAccount, signInWithTicket } from './qa-capability-harness';

const FREE_EXTERNAL_ID = 'agi-live-check:free-surface';
const FREE_EMAIL = 'agi-live-check+clerk_test@example.com';

interface UsageBody {
  plan_tier?: string;
  effective_plan_tier?: string;
  usage_percentage?: number;
  usage_reset_at?: string | null;
}

interface CompletionResult {
  status: number;
  text: string;
}

async function readUsage(page: Page): Promise<{ status: number; usage: UsageBody }> {
  return page.evaluate(async () => {
    const response = await fetch('/api/usage', { credentials: 'include' });
    const usage = (await response.json()) as UsageBody;
    return { status: response.status, usage };
  });
}

async function shownPeriodPercent(page: Page): Promise<number> {
  const meter = page.getByRole('progressbar', { name: 'This billing period usage' });
  return Math.round(Number(await meter.getAttribute('aria-valuenow')));
}

async function askManagedCloud(page: Page, surface: string): Promise<CompletionResult> {
  return page.evaluate(async (requestedSurface) => {
    const clerk = (
      window as unknown as { Clerk: { session?: { getToken: () => Promise<string | null> } } }
    ).Clerk;
    const token = await clerk.session?.getToken();
    const csrfResponse = await fetch('/api/csrf');
    const csrf = csrfResponse.ok
      ? ((await csrfResponse.json()) as { token?: string }).token
      : undefined;
    const response = await fetch('/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-agi-surface': requestedSurface,
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ messages: [] }),
    });
    return { status: response.status, text: (await response.text()).slice(0, 2_000) };
  }, surface);
}

async function ensureUnsignedFreeUser(): Promise<string> {
  const secret = process.env['CLERK_SECRET_KEY'];
  if (!secret) throw new Error('CLERK_SECRET_KEY missing');
  const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
  const lookup = await fetch(
    `https://api.clerk.com/v1/users?${new URLSearchParams({ external_id: FREE_EXTERNAL_ID })}`,
    { headers },
  );
  if (!lookup.ok) throw new Error(`Clerk lookup failed: HTTP ${lookup.status}`);
  const existing = (await lookup.json()) as { id: string; external_id: string | null }[];
  const found = existing.find((user) => user.external_id === FREE_EXTERNAL_ID);
  if (found) return found.id;
  const created = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      external_id: FREE_EXTERNAL_ID,
      email_address: [FREE_EMAIL],
      first_name: 'Live',
      last_name: 'Free',
      skip_password_requirement: true,
    }),
  });
  if (!created.ok) throw new Error(`Clerk create failed: HTTP ${created.status}`);
  return ((await created.json()) as { id: string }).id;
}

async function openUsage(page: Page): Promise<void> {
  await page.goto('/settings/usage');
  await expect(page.getByRole('heading', { name: 'Usage', exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

async function acceptCurrentTerms(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const clerk = (
      window as unknown as { Clerk: { session?: { getToken: () => Promise<string | null> } } }
    ).Clerk;
    const token = await clerk.session?.getToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const csrfResponse = await fetch('/api/csrf');
    const csrf = csrfResponse.ok
      ? ((await csrfResponse.json()) as { token?: string }).token
      : undefined;
    const status = await fetch('/api/terms/accept', { headers });
    const standing = (await status.json()) as { currentVersion?: string; accepted?: boolean };
    if (standing.accepted || !standing.currentVersion) return;
    await fetch('/api/terms/accept', {
      method: 'POST',
      headers: { ...headers, ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      body: JSON.stringify({ surface: 'web-login', version: standing.currentVersion }),
    });
  });
}

test.describe('a signed-in person uses one AGI Subscription', () => {
  test('a new account with no subscription is free on the web and refused in Chrome', async ({
    page,
  }) => {
    const userId = await ensureUnsignedFreeUser();
    await signInWithTicket(page, await mintSignInTicketFor(userId));
    await acceptCurrentTerms(page);

    await openUsage(page);
    await expect(page.getByRole('heading', { name: 'Upgrade for higher capacity' })).toBeVisible();

    const usage = await readUsage(page);
    expect(usage.status).toBe(200);
    expect(usage.usage.plan_tier).toBe('free');
    expect(typeof usage.usage.usage_percentage).toBe('number');
    expect(usage.usage.usage_reset_at).toEqual(expect.any(String));

    const web = await askManagedCloud(page, 'web');
    expect(web.text).not.toContain('developer_surface_plan_required');
    expect(web.status).not.toBe(403);

    const chrome = await askManagedCloud(page, 'chrome');
    expect(chrome.status).toBe(403);
    expect(chrome.text).toContain('developer_surface_plan_required');
    expect(chrome.text).toMatch(/Pro or higher/);
    expect(chrome.text).not.toMatch(/usage_percentage/);
  });

  test('Basic sees its usage meter and Chrome names Pro', async ({ page }) => {
    await signInAsDevAccount(page, 'basic');
    await openUsage(page);
    await expect(page.getByRole('heading', { name: 'Plan usage limits' })).toBeVisible();

    const usage = await readUsage(page);
    expect(usage.status).toBe(200);
    expect(usage.usage.plan_tier).toBe('basic');
    expect(usage.usage.effective_plan_tier ?? usage.usage.plan_tier).toBe('basic');
    const shown = Math.round(usage.usage.usage_percentage ?? -1);
    await expect.poll(() => shownPeriodPercent(page)).toBe(shown);

    const chrome = await askManagedCloud(page, 'chrome');
    expect(chrome.status).toBe(403);
    expect(chrome.text).toMatch(/Pro or higher/);

    const web = await askManagedCloud(page, 'web');
    expect(web.text).not.toContain('developer_surface_plan_required');
    expect(web.status).not.toBe(403);
  });

  test('Pro keeps the same meter and Chrome does not refuse the plan', async ({ page }) => {
    await signInAsDevAccount(page, 'pro');
    await openUsage(page);
    await expect(page.getByRole('heading', { name: 'Plan usage limits' })).toBeVisible();

    const usage = await readUsage(page);
    expect(usage.status).toBe(200);
    expect(usage.usage.plan_tier).toBe('pro');
    expect(usage.usage.effective_plan_tier ?? usage.usage.plan_tier).toBe('pro');
    const shown = Math.round(usage.usage.usage_percentage ?? -1);
    await expect.poll(() => shownPeriodPercent(page)).toBe(shown);
    expect(usage.usage.usage_reset_at).toEqual(expect.any(String));

    const chrome = await askManagedCloud(page, 'chrome');
    expect(chrome.text).not.toContain('developer_surface_plan_required');
    expect(chrome.status).not.toBe(403);

    const desktop = await askManagedCloud(page, 'desktop');
    expect(desktop.text).not.toContain('developer_surface_plan_required');
    expect(desktop.status).not.toBe(403);
  });
});
