import { test, expect } from '@playwright/test';

import { signIn } from './qa-capability-harness';

test.describe('workspace console pages that ship with their own route', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('/workspace/code opens the code controls with its main panel filled', async ({ page }) => {
    const response = await page.goto('/workspace/code');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Code' })).toBeVisible();
    await expect(page.getByRole('main')).not.toBeEmpty();
  });

  test('/workspace/mcp opens the MCP servers console with its main panel filled', async ({
    page,
  }) => {
    const response = await page.goto('/workspace/mcp');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'MCP servers' })).toBeVisible();
    await expect(page.getByRole('main')).not.toBeEmpty();
  });
});
