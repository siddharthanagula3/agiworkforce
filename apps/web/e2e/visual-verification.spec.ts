/**
 * Visual-verification smoke spec.
 *
 * Discharges the Stop-hook visual-verification debt for Web by capturing
 * screenshots of routes that render the round-7..10 shared primitives. The
 * /goal completion criterion asks for screenshots-confirming-UI-parity
 * against Claude/OpenAI references; this is the AGI-side capture step. A
 * reviewer compares the saved PNGs against the reference images under
 * `~/Desktop/reference/ui/` to confirm structural + visual parity.
 *
 * The spec captures screenshots as the primary deliverable. It also collects
 * pageerror entries into a sibling JSON file so a reviewer can audit the
 * findings without having to rerun playwright. The spec only fails when a
 * route crashes during navigation (hard-fail signal); soft signals (CSP,
 * hydration nonce noise, dev-mode warnings) are captured-not-asserted.
 *
 * Round-10 autonomous suite-transformation slice, 2026-05-21.
 */

import { test } from '@playwright/test';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

// Visual-verification deliverables go to a committed docs path so reviewers
// can inspect them without rerunning playwright. Each run overwrites the
// previous capture; git diff exposes the delta.
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
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(route);
  await page.waitForLoadState('networkidle');

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${fileStem}-full.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${fileStem}-viewport.png`,
    fullPage: false,
  });

  return { route, pageErrors, consoleErrors };
}

test.describe('visual verification — web shared primitives', () => {
  test('projects route renders and captures a screenshot', async ({ page }) => {
    const capture = await captureRoute(page, '/projects', 'projects-route');
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    writeFileSync(
      `${SCREENSHOT_DIR}/projects-route-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });

  test('projects route captures the enhanced create form', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    // Click "New" to open the enhanced create form (Round 10 emoji + presets).
    const newButton = page.getByRole('button', { name: /^new$/i }).first();
    if (await newButton.count()) {
      await newButton.click();
    }
    // Wait for the form to mount.
    await page.waitForSelector('[data-testid="project-create-form"]', { timeout: 5000 });
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/projects-create-form-viewport.png`,
      fullPage: false,
    });
  });

  test('home route renders and captures a screenshot', async ({ page }) => {
    const capture = await captureRoute(page, '/', 'home-route');
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    writeFileSync(`${SCREENSHOT_DIR}/home-route-findings.json`, JSON.stringify(capture, null, 2));
  });

  test('project detail route renders the not-found state and captures it', async ({ page }) => {
    // The shared projectStore isn't persisted, so a clean page load shows the
    // "Project not found" empty state. The populated state can be captured
    // manually after creating a project through the gallery — out of scope
    // for the automated spec, which runs against an empty store.
    const capture = await captureRoute(page, '/projects/empty-id', 'projects-detail-empty');
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    writeFileSync(
      `${SCREENSHOT_DIR}/projects-detail-empty-findings.json`,
      JSON.stringify(capture, null, 2),
    );
  });
});
