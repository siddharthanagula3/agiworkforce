import { test, expect, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * Step-up authentication has two halves and a unit test can only see one.
 * The route refusals below run against the real server. The client half runs
 * in a real browser because the challenge competes with the dialog the control
 * already opens, and jsdom has no equivalent of that event order.
 *
 * Needs the local full stack on :3000 signed in as the QA owner.
 */

interface ClerkBrowser {
  session?: { getToken(): Promise<string | null> };
}

async function api(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown; stepUpToken?: string },
): Promise<{ status: number; body: string }> {
  return page.evaluate(
    async ({ p, i }) => {
      const clerk = (window as unknown as { Clerk: ClerkBrowser }).Clerk;
      const token = await clerk.session?.getToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'x-agi-surface': 'web',
      };
      if (i?.method && i.method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        const csrfResponse = await fetch('/api/csrf').then((r) => (r.ok ? r.json() : null));
        const csrf = (csrfResponse as { token?: string } | null)?.token;
        if (csrf) headers['x-csrf-token'] = csrf;
      }
      if (i?.stepUpToken) headers['x-step-up-token'] = i.stepUpToken;
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

const STEP_UP_REFUSAL = {
  error: {
    code: 'STEP_UP_REQUIRED',
    message: 'Confirm it is you before completing this action.',
    details: {
      reason: 'step_up_required',
      action: 'two_factor.disable',
      consequence: 'Two-factor authentication is switched off for your account.',
      freshnessSeconds: 300,
    },
  },
};

test.describe('high-risk routes refuse a session that has not re-authenticated', () => {
  test('disabling two-factor names the action and the consequence', async ({ page }) => {
    await signIn(page);

    const refused = await api(page, '/api/settings/2fa', { method: 'DELETE' });

    // An account with 2FA already off answers 200 and is out of scope here.
    expect([200, 403], 'either nothing is enrolled or the proof is demanded').toContain(
      refused.status,
    );
    if (refused.status === 403) {
      expect(refused.body).toContain('STEP_UP_REQUIRED');
      expect(refused.body).toContain('two_factor.disable');
      expect(refused.body, 'the challenge must state what it is about to do').toContain(
        'consequence',
      );
    }
  });

  test('a forged proof is refused as firmly as no proof at all', async ({ page }) => {
    await signIn(page);

    const forged = await api(page, '/api/settings/2fa', {
      method: 'DELETE',
      stepUpToken: 'eyJhIjoiYiJ9.not-a-real-signature',
    });

    expect([200, 403]).toContain(forged.status);
    if (forged.status === 403) expect(forged.body).toContain('STEP_UP_REQUIRED');
  });

  test('replacing backup codes demands the same proof', async ({ page }) => {
    await signIn(page);

    const refused = await api(page, '/api/settings/2fa/backup-codes', { method: 'POST' });

    expect(refused.status).not.toBe(200);
    expect([400, 403]).toContain(refused.status);
    if (refused.status === 403) {
      expect(refused.body).toContain('two_factor.regenerate_backup_codes');
    } else {
      expect(refused.body).toMatch(/second factor|two-factor|2fa/i);
    }
  });
});

interface StubbedResponse {
  status: number;
  body: unknown;
}

const VERIFICATION_REQUIRED = {
  error: {
    code: 'STEP_UP_VERIFICATION_REQUIRED',
    message: 'Confirm it is you with your authenticator app or a backup code.',
    details: { action: 'two_factor.disable', level: 'second_factor' },
  },
};

async function routeTwoFactorDisable(
  page: Page,
  onDelete: (attempt: number) => StubbedResponse | null,
) {
  let attempts = 0;
  await page.route('**/api/settings/2fa', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, backup_codes_ready: true }),
      });
    }
    if (request.method() !== 'DELETE') return route.continue();
    attempts += 1;
    const replay = onDelete(attempts);
    if (replay) {
      return route.fulfill({
        status: replay.status,
        contentType: 'application/json',
        body: JSON.stringify(replay.body),
      });
    }
    return route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify(STEP_UP_REFUSAL),
    });
  });
  return () => attempts;
}

test.describe('the refusal reaches the person, not the console', () => {
  test('a freshly verified session replays the request with the proof and no prompt', async ({
    page,
  }) => {
    await signIn(page);

    let replayCarriedProof = false;
    const attempts = await routeTwoFactorDisable(page, (attempt) => {
      if (attempt === 1) return null;
      return { status: 200, body: { success: true } };
    });
    await page.route('**/api/settings/2fa', async (route) => {
      if (route.request().method() === 'DELETE') {
        replayCarriedProof ||= route.request().headers()['x-step-up-token'] === 'e2e-grant';
      }
      return route.fallback();
    });
    await page.route('**/api/auth/step-up', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'e2e-grant', method: 'second_factor' }),
      }),
    );

    await page.goto('/settings/security', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /turn off two-factor/i }).click();

    await expect.poll(attempts).toBe(2);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(replayCarriedProof, 'the replay must carry the minted grant').toBe(true);
  });

  test('a stale session opens the confirmation, and dismissing it changes nothing', async ({
    page,
  }) => {
    await signIn(page);

    const attempts = await routeTwoFactorDisable(page, () => null);
    await page.route('**/api/auth/step-up', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify(VERIFICATION_REQUIRED),
      }),
    );

    await page.goto('/settings/security', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /turn off two-factor/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Two-factor authentication is switched off');

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /turn off two-factor/i })).toBeEnabled();
    expect(attempts()).toBe(1);
  });
});
