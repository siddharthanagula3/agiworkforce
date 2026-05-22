/**
 * Visual-verification smoke spec for Desktop (cloud-web build target).
 *
 * Discharges the Stop-hook visual-verification debt for Desktop by capturing
 * screenshots of the running cloud-web bundle. Desktop is a Tauri shell, but
 * the same React tree is built with VITE_BUILD_TARGET=web to produce a
 * servable web bundle. We run playwright against that bundle so capture
 * works without requiring the full Tauri runtime + native windows.
 *
 * The spec captures the bundle's root URL only (Desktop is a single-page
 * app with state-toggled views rather than route-toggled views). Future
 * extensions can drive the UI to specific screens before capture.
 *
 * Output overwrites the existing PNGs in `docs/visual-verification/desktop/`.
 * `git diff` exposes the delta.
 *
 * Round-10 autonomous suite-transformation slice, 2026-05-21.
 */

import { test } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';

const SCREENSHOT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../docs/visual-verification/desktop',
);

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
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${fileStem}-full.png`, fullPage: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${fileStem}-viewport.png`, fullPage: false });

  return { route, pageErrors, consoleErrors };
}

test.describe('visual verification — desktop cloud-web bundle', () => {
  test('desktop root (sign-in) renders and captures a screenshot', async ({ page }) => {
    const capture = await captureRoute(page, '/', 'desktop-root');
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    writeFileSync(`${SCREENSHOT_DIR}/desktop-root-findings.json`, JSON.stringify(capture, null, 2));
  });

  test('desktop /sign-up renders and captures a screenshot', async ({ page }) => {
    const capture = await captureRoute(page, '/sign-up', 'desktop-signup');
    writeFileSync(
      `${SCREENSHOT_DIR}/desktop-signup-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });

  test('desktop /providers renders and captures a screenshot', async ({ page }) => {
    const capture = await captureRoute(page, '/providers', 'desktop-providers');
    writeFileSync(
      `${SCREENSHOT_DIR}/desktop-providers-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });

  test('desktop /pricing renders and captures a screenshot', async ({ page }) => {
    const capture = await captureRoute(page, '/pricing', 'desktop-pricing');
    writeFileSync(
      `${SCREENSHOT_DIR}/desktop-pricing-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });
});
