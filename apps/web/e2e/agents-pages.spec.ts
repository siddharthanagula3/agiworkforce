import { expect, test } from '@playwright/test';

import { signInAsDevAccount } from './qa-capability-harness';

const MISSING_AGENT_ID = '0190a000-0000-7000-8000-00000000dead';

test.describe('agents pages', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsDevAccount(page, 'pro');
  });

  test('/chat/agents settles on the list or the first-agent prompt, with a way to make one', async ({
    page,
  }) => {
    await page.goto('/chat/agents');
    await expect(page.getByRole('heading', { level: 1, name: 'Agents' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('status', { name: 'Loading agents' })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    await expect(
      page
        .getByRole('heading', { name: 'No agents yet' })
        .or(page.getByRole('region', { name: 'Your agents' })),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'New agent' })).toHaveAttribute(
      'href',
      '/chat/agents/new',
    );
  });

  test('/chat/agents/new opens an unsaved draft with a way back to the list', async ({ page }) => {
    await page.goto('/chat/agents/new');
    await expect(page.getByRole('heading', { level: 1, name: 'New agent' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Not saved yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Agents', exact: true })).toHaveAttribute(
      'href',
      '/chat/agents',
    );
  });

  test('/chat/agents/[id] for an agent that does not exist says so and offers a way back', async ({
    page,
  }) => {
    await page.goto(`/chat/agents/${MISSING_AGENT_ID}`);
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Agents' })).toHaveAttribute(
      'href',
      '/chat/agents',
    );
  });
});

test('/chat/code sends the old code address to the code page', async ({ page }) => {
  await signInAsDevAccount(page, 'pro');
  await page.goto('/chat/code');
  await expect(page).toHaveURL(/\/code(?:[?#]|$)/, { timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe('/code');
});
