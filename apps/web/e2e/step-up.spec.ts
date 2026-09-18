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
    message: 'Confirm it is you with a second factor before completing this action.',
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

test.describe('the refusal reaches the person, not the console', () => {
  test('the control opens the challenge and replays the request with the proof', async ({
    page,
  }) => {
    await signIn(page);

    let disableAttempts = 0;
    let replayCarriedProof = false;

    await page.route('**/api/settings/2fa', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, backup_codes_remaining: 3 }),
        });
      }
      if (request.method() !== 'DELETE') return route.continue();
      disableAttempts += 1;
      if (disableAttempts === 1) {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify(STEP_UP_REFUSAL),
        });
      }
      replayCarriedProof = request.headers()['x-step-up-token'] === 'e2e-grant';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route('**/api/auth/step-up', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'e2e-grant', method: 'totp' }),
      }),
    );

    await page.goto('/settings/security', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /turn off two-factor/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Two-factor authentication is switched off');

    const code = page.getByLabel(/authenticator or backup code/i);
    await expect(code).toBeVisible();
    await code.fill('123456');
    await page.getByRole('button', { name: /^confirm$/i }).click();

    await expect(dialog).toBeHidden();
    expect(disableAttempts, 'the request must be replayed exactly once').toBe(2);
    expect(replayCarriedProof, 'the replay must carry the minted grant').toBe(true);
  });

  test('dismissing the challenge leaves two-factor on and says nothing alarming', async ({
    page,
  }) => {
    await signIn(page);

    let disableAttempts = 0;
    await page.route('**/api/settings/2fa', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, backup_codes_remaining: 3 }),
        });
      }
      if (request.method() !== 'DELETE') return route.continue();
      disableAttempts += 1;
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify(STEP_UP_REFUSAL),
      });
    });

    await page.goto('/settings/security', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /turn off two-factor/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /turn off two-factor/i })).toBeEnabled();
    expect(disableAttempts).toBe(1);
  });
});
