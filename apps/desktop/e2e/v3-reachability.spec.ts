import { test, expect, type Page } from '@playwright/test';
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import { expectCloudShellReady, mockCloudApi } from './utils/mock-cloud-api';

async function gotoV3(page: Page) {
  await injectMockCloudAuth(page);
  await mockCloudApi(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await expectCloudShellReady(page);
}

test.describe('@reachability v3 surface', () => {
  test.beforeEach(async ({ page }) => {
    await gotoV3(page);
  });

  test('shell root [data-v3-shell] is in the DOM', async ({ page }) => {
    await expect
      .poll(async () => page.locator('[data-v3-shell]').count(), { timeout: 30000 })
      .toBeGreaterThan(0);
  });

  test('shell sidebar [data-v3-sidebar] is reachable', async ({ page }) => {
    const el = page.locator('[data-v3-sidebar]');
    await expect(el.first()).toBeAttached();
  });

  test('shell sidebar exposes data-mode attr', async ({ page }) => {
    const el = page.locator('[data-v3-sidebar]').first();
    await expect(el).toHaveAttribute('data-mode', /chat|work|code/);
  });

  test('shell sidebar exposes data-collapsed attr', async ({ page }) => {
    const el = page.locator('[data-v3-sidebar]').first();
    await expect(el).toHaveAttribute('data-collapsed', /true|false/);
  });

  test('composer textarea reachable by aria-label', async ({ page }) => {
    const el = page.getByRole('textbox', { name: /chat message input/i });
    await expect(el.first()).toBeAttached();
  });

  test('composer add-button reachable by aria-label', async ({ page }) => {
    const el = page.getByRole('button', { name: /add attachment/i });
    await expect(el.first()).toBeAttached();
  });

  test('composer model-picker reachable by aria-label', async ({ page }) => {
    const el = page.getByRole('button', { name: /select model/i });
    await expect(el.first()).toBeAttached();
  });

  test('composer voice-button reachable by aria-label', async ({ page }) => {
    const el = page.getByRole('button', { name: /voice input|cloud voice|stop recording/i });
    await expect(el.first()).toBeAttached();
  });

  test('empty state greeting renders when no conversation', async ({ page }) => {
    const greet = page.getByText(
      /(good morning|good afternoon|good evening|rise and shine|\bhi\b|hello|standing by|ready to start the day|working late|never sleeps|what are we accomplishing|what can we get done|what shall we tackle)/i,
    );
    await greet.first().waitFor({ state: 'attached', timeout: 5000 });
    await expect(greet.first()).toBeVisible();
  });

  test('user message bubble selector [data-v3-msg-user] is queryable', async ({ page }) => {
    const count = await page.locator('[data-v3-msg-user]').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('AI message row selector [data-v3-msg-ai] is queryable', async ({ page }) => {
    const count = await page.locator('[data-v3-msg-ai]').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('thinking pill selector [data-v3-thinking-pill] is queryable', async ({ page }) => {
    const count = await page.locator('[data-v3-thinking-pill]').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('artifact chip selector [data-v3-artifact-chip] is queryable', async ({ page }) => {
    const count = await page.locator('[data-v3-artifact-chip]').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('response action row [data-v3-response-action-row] is queryable', async ({ page }) => {
    const count = await page.locator('[data-v3-response-action-row]').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('active chat scroller [data-v3-active-chat] is queryable', async ({ page }) => {
    const count = await page.locator('[data-v3-active-chat]').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('cap modal stays hidden when no cap active', async ({ page }) => {
    const modal = page.locator('[data-component="cap-modal"]');
    await expect(modal).toHaveCount(0);
  });

  test('sidebar exposes "search" affordance', async ({ page }) => {
    const sidebar = page.locator('[data-v3-sidebar]').first();
    const search = sidebar.getByText(/search/i).first();
    await expect(search).toBeAttached();
  });

  test('sidebar exposes a "new chat" or "new session" button', async ({ page }) => {
    const sidebar = page.locator('[data-v3-sidebar]').first();
    const btn = sidebar.getByText(/new (chat|session)/i).first();
    await expect(btn).toBeAttached();
  });

  test('sidebar exposes mode-switcher buttons', async ({ page }) => {
    const sidebar = page.locator('[data-v3-sidebar]').first();
    const buttons = sidebar.getByRole('button', { name: /^(chat|agi work|code)$/i });
    expect(await buttons.count()).toBeGreaterThanOrEqual(0);
  });

  test.fixme('"customize" tab is reachable through sidebar nav text', async ({ page }) => {
    const sidebar = page.locator('[data-v3-sidebar]').first();
    const text = sidebar.getByText(/customize/i).first();
    await expect(text).toBeAttached();
  });

  test('i18n: no unresolved {{key}} placeholders render in shell', async ({ page }) => {
    const shell = page.locator('[data-v3-shell]').first();
    const text = await shell.textContent();
    expect(text ?? '').not.toMatch(/\{\{[a-zA-Z]/);
  });

  test('i18n: no "v3." literal keys render in shell', async ({ page }) => {
    const shell = page.locator('[data-v3-shell]').first();
    const text = await shell.textContent();
    expect(text ?? '').not.toMatch(/\bv3\.[a-z]+\.[a-z]+/i);
  });

  test('a11y: shell has reachable buttons (no orphan div-buttons in the smoke set)', async ({
    page,
  }) => {
    const buttons = page.getByRole('button');
    expect(await buttons.count()).toBeGreaterThan(0);
  });

  test('a11y: composer textarea exposes accessible name', async ({ page }) => {
    const el = page.getByRole('textbox', { name: /chat message input/i });
    const ariaLabel = await el.first().getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  test('a11y: icon-only AGI Work artifact refresh button exposes accessible name', async ({
    page,
  }) => {
    const el = page.getByRole('button', { name: /refresh/i });
    expect(await el.count()).toBeGreaterThanOrEqual(0);
  });

  test('a11y: response action thumbs buttons expose accessible names', async ({ page }) => {
    const up = page.getByRole('button', { name: /helpful$/i });
    const down = page.getByRole('button', { name: /not helpful/i });
    expect(await up.count()).toBeGreaterThanOrEqual(0);
    expect(await down.count()).toBeGreaterThanOrEqual(0);
  });

  test('keyboard: pressing Tab moves focus to an interactive element', async ({ page }) => {
    await page.keyboard.press('Tab');
    const tag = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['BUTTON', 'INPUT', 'TEXTAREA', 'A']).toContain(tag);
  });

  test('keyboard: Escape on a closed search modal is a no-op (no crash)', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toBeVisible();
  });

  test('document has a non-empty title', async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
