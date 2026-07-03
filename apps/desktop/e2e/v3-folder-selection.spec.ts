import { test, expect } from '@playwright/test';
import { injectMockCloudAuth, mockCloudAccountEndpoints } from './utils/mock-cloud-auth';

/**
 * Desktop QA task #10 — folder-selection reachability in the live composer.
 *
 * Runs against the same browser-mode bundle as `v3-smoke.spec.ts` (no real
 * Tauri runtime), so `isTauri` is false and `useFolderSelection`'s native
 * dialog branch never executes here — that flow (opening the native dialog
 * and reaching `project_context_set_folder`) is verified at the component
 * level in `apps/desktop/src/hooks/__tests__/useFolderSelection.test.ts`
 * (mirrors the existing `FolderSelector.test.tsx` Tauri-mocking pattern).
 *
 * What THIS suite proves end-to-end in a real browser:
 *   1. "Select folder" is reachable in the live composer's plus/attachment
 *      menu (the actual product ask — "give an option to select a folder in
 *      the input box").
 *   2. Clicking it drives the real prop chain (AttachmentMenu -> ChatInput ->
 *      ChatInterface -> DesktopShellV3 -> useFolderSelection.selectFolder)
 *      all the way to the "requires the desktop app" toast, which is the
 *      real non-Tauri branch of the same function that calls
 *      `project_context_set_folder` on desktop.
 */
test.describe('@smoke v3 composer folder selection', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockCloudAuth(page);
    await mockCloudAccountEndpoints(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'feature_flags_overrides',
          JSON.stringify([['desktop_chat_v3', true]]),
        );
      } catch {
        // localStorage unavailable — assertions below will fail loudly
      }
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const shell = page.locator('[data-v3-shell]');
    await expect.poll(async () => shell.count(), { timeout: 30000 }).toBeGreaterThan(0);
  });

  test('"Select folder" is reachable from the composer plus menu', async ({ page }) => {
    await page.getByRole('button', { name: 'Add attachment' }).click();

    await expect(page.getByText('Select folder', { exact: true })).toBeVisible();
  });

  test('clicking "Select folder" reaches the folder-selection callback', async ({ page }) => {
    await page.getByRole('button', { name: 'Add attachment' }).click();
    await page.getByText('Select folder', { exact: true }).click();

    // Non-Tauri branch of useFolderSelection.selectFolder — real proof the
    // click wiring reaches the hook (the Tauri branch that calls
    // project_context_set_folder is covered at the component-test level).
    await expect(page.getByText('Folder selection requires the desktop app')).toBeVisible();
  });
});
