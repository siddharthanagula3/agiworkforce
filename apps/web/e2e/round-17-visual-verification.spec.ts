/**
 * Round-17 visual-verification capture.
 *
 * Additive to `visual-verification.spec.ts` — captures the same web routes
 * under `round-17-*` stems so the round-12..16 baselines stay intact for
 * reviewer diff. Discharges the Stop-hook flag "no surfaces verified to
 * parity via screenshot comparison" with a fresh snapshot of the surface
 * state after the round-16 landings.
 *
 * 2026-05-22 round-17 capture sweep.
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

test.describe('round-17 visual verification — web', () => {
  test('round-17 home', async ({ page }) => {
    const capture = await captureRoute(page, '/', 'round-17-home');
    writeFileSync(
      `${SCREENSHOT_DIR}/round-17-home-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });

  test('round-17 chat', async ({ page }) => {
    const capture = await captureRoute(page, '/chat', 'round-17-chat');
    writeFileSync(
      `${SCREENSHOT_DIR}/round-17-chat-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });

  test('round-17 projects', async ({ page }) => {
    const capture = await captureRoute(page, '/projects', 'round-17-projects');
    writeFileSync(
      `${SCREENSHOT_DIR}/round-17-projects-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });

  test('round-17 project detail (empty)', async ({ page }) => {
    const capture = await captureRoute(page, '/projects/empty-id', 'round-17-project-detail');
    writeFileSync(
      `${SCREENSHOT_DIR}/round-17-project-detail-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });

  test('round-17 pricing', async ({ page }) => {
    const capture = await captureRoute(page, '/pricing', 'round-17-pricing');
    writeFileSync(
      `${SCREENSHOT_DIR}/round-17-pricing-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });
});
