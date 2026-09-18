import { test, expect, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * Proves the owner invariant and admin delegation at the API, not in the
 * component: a console that greys a button out is not a guardrail, and the
 * failures this covers all arrive as direct requests.
 *
 * Needs the local full stack: a production build on :3000 pointed at a Postgres
 * carrying every migration, with a seeded workspace whose signed-in QA account
 * is an administrator and not the workspace owner.
 */
interface ClerkBrowser {
  loaded?: boolean;
  session?: { getToken(): Promise<string | null> };
}

async function api(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; body: string }> {
  return page.evaluate(
    async ({ p, i }) => {
      const clerk = (window as unknown as { Clerk: ClerkBrowser }).Clerk;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${await clerk.session?.getToken()}`,
        'x-agi-surface': 'web',
      };
      if (i?.method && i.method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        const csrf = await fetch('/api/csrf').then((r) => (r.ok ? r.json() : null));
        const token = (csrf as { token?: string } | null)?.token;
        if (token) headers['x-csrf-token'] = token;
      }
      const res = await fetch(p, {
        method: i?.method ?? 'GET',
        headers,
        body: i?.body ? JSON.stringify(i.body) : undefined,
      });
      return { status: res.status, body: (await res.text()).slice(0, 20_000) };
    },
    { p: path, i: init ?? null },
  );
}

async function workspace(page: Page): Promise<{ organizationId: string; owner: string }> {
  const listing = await api(page, '/api/settings/team');
  expect(listing.status).toBe(200);
  const members = (JSON.parse(listing.body) as { members: Array<Record<string, string>> }).members;
  const owner = members.find((member) => member['role'] === 'owner');
  expect(owner, 'the seeded workspace has an owner').toBeTruthy();
  return { organizationId: String(owner!['organizationId']), owner: String(owner!['userId']) };
}

test.describe('owner protection', () => {
  test('an administrator cannot remove or demote the owner', async ({ page }) => {
    await signIn(page);
    const { organizationId, owner } = await workspace(page);
    const memberId = `${organizationId}:${owner}`;

    const demote = await api(page, `/api/settings/team/${memberId}`, {
      method: 'PATCH',
      body: { role: 'admin' },
    });
    expect([403, 409]).toContain(demote.status);

    const remove = await api(page, `/api/settings/team/${memberId}`, { method: 'DELETE' });
    expect([403, 409]).toContain(remove.status);

    const after = await api(page, '/api/settings/team');
    expect(after.body).toContain('"role":"owner"');
  });

  test('promoting a second owner through the member route is refused', async ({ page }) => {
    await signIn(page);
    const { organizationId, owner } = await workspace(page);

    const promote = await api(page, `/api/settings/team/${organizationId}:${owner}`, {
      method: 'PATCH',
      body: { role: 'owner' },
    });
    expect(promote.status).toBe(409);
    expect(promote.body).toContain('transfer-ownership');
  });

  test('two simultaneous demotions of the owner both fail closed', async ({ page }) => {
    await signIn(page);
    const { organizationId, owner } = await workspace(page);
    const memberId = `${organizationId}:${owner}`;

    const [first, second] = await Promise.all([
      api(page, `/api/settings/team/${memberId}`, { method: 'PATCH', body: { role: 'admin' } }),
      api(page, `/api/settings/team/${memberId}`, { method: 'PATCH', body: { role: 'member' } }),
    ]);

    expect(first.status).not.toBe(200);
    expect(second.status).not.toBe(200);
    const after = await api(page, '/api/settings/team');
    expect(after.body).toContain('"role":"owner"');
  });
});

test.describe('admin delegation', () => {
  test('an owner-only permission can never be delegated', async ({ page }) => {
    await signIn(page);

    const granted = await api(page, '/api/settings/organization/delegation', {
      method: 'POST',
      body: {
        delegateUserId: 'delegate-that-does-not-exist',
        scopes: ['admin.ownership.manage'],
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect([401, 403]).toContain(granted.status);
    expect(granted.body).not.toContain('"delegation"');
  });

  test('a delegation cannot outlast the ceiling or start in the past', async ({ page }) => {
    await signIn(page);
    const listing = await api(page, '/api/settings/organization/delegation');
    expect(listing.status, 'an owner reads the delegation ledger').toBe(200);
    const { delegatablePermissions } = JSON.parse(listing.body) as {
      delegatablePermissions: string[];
    };
    const { owner } = await workspace(page);

    for (const expiresAt of [
      new Date(Date.now() - 60_000).toISOString(),
      new Date(Date.now() + 400 * 86_400_000).toISOString(),
    ]) {
      const attempt = await api(page, '/api/settings/organization/delegation', {
        method: 'POST',
        body: { delegateUserId: owner, scopes: [delegatablePermissions[0]], expiresAt },
      });
      expect(attempt.status).not.toBe(200);
    }
  });

  test('the console names what a delegation can never do', async ({ page }) => {
    await signIn(page);
    await page.goto('/workspace/roles', { waitUntil: 'domcontentloaded' });
    const panel = page.getByRole('region', { name: 'Admin delegation' });
    await expect(panel).toContainText('remove, demote or transfer an owner');
  });
});
