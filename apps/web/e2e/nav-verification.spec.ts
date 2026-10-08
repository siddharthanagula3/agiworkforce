import { test, expect, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * scripts/check-surface-reachability.mjs proves every route module is reachable
 * from an entry point, and app-nav-items.test.ts proves every rail href has a
 * page.tsx behind it. Neither proves the rail WORKS: a destination can be
 * statically perfect and still land on an error boundary, keep the previous
 * route's title, or leave the rail pointing at the page you came from. That is
 * what this walks, by clicking the rail rather than calling goto, because a
 * client-side transition is the path a user actually takes.
 */

const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
const LOAD_TIMEOUT_MS = 30_000;
const SETTLE_MS = 800;
const SPEC_TIMEOUT_MS = 10 * 60_000;

const ERROR_TEXT = /something went wrong|application error|unhandled runtime error/i;

/**
 * The rail entries the QA account can reach. Admin is deliberately absent: that
 * account holds no workspace, so the entry never renders for it and asserting
 * on it would be asserting on a fixture rather than on navigation.
 */
const RAIL_DESTINATIONS = [
  { label: 'Chat', path: '/chat' },
  { label: 'Projects', path: '/chat/projects' },
  { label: 'Library', path: '/chat/library' },
  { label: 'Models', path: '/models' },
  { label: 'Study', path: '/chat/study' },
] as const;

/** A conversation id that is well formed and belongs to nobody. */
const ABSENT_CONVERSATION_ID = '00000000-0000-4000-8000-0000000000ff';
/** Not a uuid at all, so the route has to reject the parameter rather than query on it. */
const MALFORMED_CONVERSATION_ID = 'not-a-conversation';

async function openApp(page: Page): Promise<void> {
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);
  await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
}

function railEntry(page: Page, label: string) {
  return page.getByRole('button', { name: label, exact: true }).first();
}

test.describe('primary navigation works at runtime', () => {
  test.setTimeout(SPEC_TIMEOUT_MS);
  test.use({ reducedMotion: 'reduce', viewport: DESKTOP_VIEWPORT } as never);

  test('every rail destination lands, titles itself, and marks itself current', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await openApp(page);

    const titles = new Map<string, string>();
    for (const destination of RAIL_DESTINATIONS) {
      const entry = railEntry(page, destination.label);
      await expect(entry, `${destination.label} is missing from the rail`).toBeVisible({
        timeout: LOAD_TIMEOUT_MS,
      });
      await entry.click();
      await page.waitForURL(`**${destination.path}`, { timeout: LOAD_TIMEOUT_MS });
      await page.waitForTimeout(SETTLE_MS);

      await expect(page.locator('body'), `${destination.path} rendered an error`).not.toContainText(
        ERROR_TEXT,
      );
      await expect(
        railEntry(page, destination.label),
        `${destination.label} did not mark itself current`,
      ).toHaveAttribute('aria-current', 'page');

      const title = await page.title();
      expect(
        title.trim().length,
        `${destination.path} has an empty document title`,
      ).toBeGreaterThan(0);
      titles.set(destination.path, title);
    }

    // A title that never changes is the same defect as no title: the tab, the
    // history entry and the bookmark all name the wrong page.
    expect(
      new Set(titles.values()).size,
      `titles did not vary: ${[...titles.values()]}`,
    ).toBeGreaterThan(1);

    // React logs a hydration mismatch as a console error and then patches the
    // DOM, so the page looks right while the server and the browser disagreed.
    const hydrationErrors = consoleErrors.filter((text) => /hydrat/i.test(text));
    expect(hydrationErrors, 'the server and client markup disagreed').toEqual([]);
  });

  test('back and forward restore the destination the rail points at', async ({ page }) => {
    await openApp(page);

    await railEntry(page, 'Library').click();
    await page.waitForURL('**/chat/library', { timeout: LOAD_TIMEOUT_MS });
    await railEntry(page, 'Projects').click();
    await page.waitForURL('**/chat/projects', { timeout: LOAD_TIMEOUT_MS });

    await page.goBack();
    await page.waitForURL('**/chat/library', { timeout: LOAD_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    await expect(railEntry(page, 'Library')).toHaveAttribute('aria-current', 'page');

    await page.goForward();
    await page.waitForURL('**/chat/projects', { timeout: LOAD_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    await expect(railEntry(page, 'Projects')).toHaveAttribute('aria-current', 'page');
  });

  test('study mode offers its start form and refuses to start without a subject', async ({
    page,
  }) => {
    await openApp(page);

    await railEntry(page, 'Study').click();
    await page.waitForURL('**/chat/study', { timeout: LOAD_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);

    const start = page.getByRole('button', { name: 'Start studying' });
    await expect(start).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
    await expect(start, 'an empty subject was startable').toBeDisabled();

    await page.getByRole('radio', { name: /Practise it/ }).click();
    await page.getByPlaceholder('e.g.').fill('Eigenvalues');
    await expect(start).toBeEnabled();
  });

  test('a conversation that does not exist is handled, not crashed into', async ({ page }) => {
    await openApp(page);

    for (const id of [ABSENT_CONVERSATION_ID, MALFORMED_CONVERSATION_ID]) {
      await page.goto(`/chat/${id}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page
        .waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS })
        .catch(() => undefined);
      await page.waitForTimeout(SETTLE_MS);

      await expect(
        page.locator('body'),
        `/chat/${id} rendered an error boundary`,
      ).not.toContainText(ERROR_TEXT);
      // Whatever the route decides, the user keeps a way out: either the rail
      // is still there or it redirected somewhere that has one.
      await expect(railEntry(page, 'Chat'), `/chat/${id} left the user with no rail`).toBeVisible({
        timeout: LOAD_TIMEOUT_MS,
      });
    }
  });
});
