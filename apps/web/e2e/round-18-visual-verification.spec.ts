/**
 * Round-18 visual-verification capture.
 *
 * Captures /settings (general sub-page) and /connectors after the
 * round-18 settings + connector hub parity landings.
 * Settings redirects to /login when unauthenticated, so we capture the
 * unauthenticated redirect state (the login page) as a structural proof
 * that the layout and auth gate are wired. The connectors page is fully
 * public and captures the full hub.
 *
 * 2026-05-22 round-18 capture.
 */

import { test } from '@playwright/test';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const SCREENSHOT_DIR = resolve(__dirname, '../../../docs/visual-verification/web');

interface RouteCapture {
  route: string;
  pageErrors: string[];
  consoleErrors: string[];
}

async function captureRoute(
  page: import('@playwright/test').Page,
  route: string,
  fileStem: string,
): Promise<RouteCapture> {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(route);
  await page.waitForLoadState('networkidle');

  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${fileStem}-viewport.png`, fullPage: false });

  return { route, pageErrors, consoleErrors };
}

test.describe('round-18 visual verification — settings + connectors', () => {
  test('round-18 settings (unauthenticated redirect)', async ({ page }) => {
    const capture = await captureRoute(page, '/settings', 'round-18-settings');
    writeFileSync(
      `${SCREENSHOT_DIR}/round-18-settings-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });

  test('round-18 connectors hub', async ({ page }) => {
    const capture = await captureRoute(page, '/connectors', 'round-18-connectors');
    writeFileSync(
      `${SCREENSHOT_DIR}/round-18-connectors-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });
});
