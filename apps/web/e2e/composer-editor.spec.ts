import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './qa-capability-harness';

/**
 * The editor arm of the composer, pinned per-navigation with `?composer=` so
 * both implementations run against one build. Everything asserted here is
 * behaviour the textarea already had. This spec is the parity gate, not a
 * feature description.
 */
const CHAT_EDITOR_URL = '/chat?composer=editor';
const COMPOSER = '[data-composer-textarea]';
const COMPOSER_REGION = '#chat-composer';
const COMPOSER_TIMEOUT = 20000;
const REPLY_TIMEOUT = 30000;

const COMPOSER_EDITOR_STORAGE_KEY = 'agi.composer-editor';
const COMPOSER_EDITOR_MODE = 'editor';

async function pinEditorArm(page: Page): Promise<void> {
  await page.addInitScript(
    (input: { key: string; value: string }) => {
      try {
        window.localStorage.setItem(input.key, input.value);
      } catch {
        void 0;
      }
    },
    { key: COMPOSER_EDITOR_STORAGE_KEY, value: COMPOSER_EDITOR_MODE },
  );
}

/**
 * `[data-composer-textarea]` is carried by BOTH arms, so waiting on it alone
 * returns as soon as the server-rendered textarea paints, while the gate
 * resolves post-hydration and the editor is still two commits away. Anything
 * typed in that window goes to the arm on its way out. Wait for the
 * contenteditable specifically.
 */
const EDITOR_CONTENT = `${COMPOSER}[contenteditable="true"]`;

async function openComposer(page: Page) {
  await page.goto(CHAT_EDITOR_URL);
  const composer = page.locator(EDITOR_CONTENT);
  await expect(composer).toBeVisible({ timeout: COMPOSER_TIMEOUT });
  await composer.click();
  // Every claim below is about what typing does to an empty composer. A draft
  // restored into this conversation would silently prepend itself and, for the
  // slash case, take the token out of shape, so say so here rather than
  // failing later on a symptom.
  expect(await composerText(page)).toBe('');
  return composer;
}

async function composerText(page: Page): Promise<string> {
  return (await page.locator(EDITOR_CONTENT).innerText()).trim();
}

test.describe('composer editor · parity', () => {
  // The long-paste case writes to the system clipboard before pressing paste,
  // which Chromium refuses unless the context holds the permission.
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.beforeEach(async ({ page }) => {
    await pinEditorArm(page);
    await signIn(page);
  });

  test('Enter sends, Shift+Enter keeps a newline, Cmd+Enter sends', async ({ page }) => {
    const composer = await openComposer(page);

    await composer.pressSequentially('first line');
    await composer.press('Shift+Enter');
    await composer.pressSequentially('second line');
    expect(await composerText(page)).toContain('\n');

    await composer.press('Enter');
    await expect(page.locator('.message-inner').first()).toBeVisible({ timeout: REPLY_TIMEOUT });
    expect(await composerText(page)).toBe('');

    await composer.pressSequentially('sent with the modifier');
    await composer.press('ControlOrMeta+Enter');
    await expect(page.getByText('sent with the modifier')).toBeVisible({ timeout: REPLY_TIMEOUT });
  });

  test('the slash menu owns Enter, and the next Enter after Escape sends', async ({ page }) => {
    const composer = await openComposer(page);
    const slashMenu = page.getByRole('listbox', { name: /slash command/i });

    await composer.pressSequentially('/');
    await expect(slashMenu).toBeVisible();

    // Enter selects the highlighted command; it must not also send.
    await composer.press('Enter');
    await expect(slashMenu).toBeHidden();
    await expect(page.locator('.message-inner')).toHaveCount(0);

    // A space takes the token out of shape and closes the menu.
    await composer.pressSequentially('/search');
    await expect(slashMenu).toBeVisible();
    await composer.pressSequentially(' ');
    await expect(slashMenu).toBeHidden();

    await composer.press('Escape');
    await composer.press('Enter');
    await expect(page.locator('.message-inner').first()).toBeVisible({ timeout: REPLY_TIMEOUT });
  });

  test('the mention menu navigates, commits on Tab, and leaves plain text behind', async ({
    page,
  }) => {
    const composer = await openComposer(page);
    const mentionMenu = page.getByRole('listbox', { name: 'Mentions' });

    await composer.pressSequentially('scope this @');
    await expect(mentionMenu).toBeVisible();

    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible({ timeout: COMPOSER_TIMEOUT });
    await composer.press('ArrowUp');
    await expect(options.last()).toHaveAttribute('aria-selected', 'true');
    await composer.press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await composer.press('Tab');
    await expect(mentionMenu).toBeHidden();
    // The query is a picker affordance and must not reach the prompt.
    expect(await composerText(page)).not.toContain('@');
  });

  test('an empty mention menu never swallows the Enter that was meant to send', async ({
    page,
  }) => {
    const composer = await openComposer(page);

    await composer.pressSequentially('ping @nobodymatchesthisquery');
    await composer.press('Enter');

    await expect(page.getByText('ping @nobodymatchesthisquery')).toBeVisible({
      timeout: REPLY_TIMEOUT,
    });
  });

  test('a long paste becomes an attachment and the undo puts the text back', async ({ page }) => {
    const composer = await openComposer(page);
    const long = 'x'.repeat(20000);

    await page.evaluate(async (text) => navigator.clipboard.writeText(text), long);
    await composer.press('ControlOrMeta+V');

    await expect(page.getByTestId('pasted-text-notice')).toBeVisible();
    await page.getByTestId('pasted-text-undo').click();

    await expect(page.getByTestId('pasted-text-notice')).toBeHidden();
    expect((await composerText(page)).length).toBeGreaterThan(long.length / 2);
  });

  test('a draft survives leaving the conversation and does not follow the user', async ({
    page,
  }) => {
    const composer = await openComposer(page);
    const draft = 'half-typed draft that belongs to this chat';

    await composer.pressSequentially(draft);
    await page
      .getByRole('button', { name: /new chat/i })
      .first()
      .click();
    await expect(page.locator(EDITOR_CONTENT)).toBeVisible({ timeout: COMPOSER_TIMEOUT });
    expect(await composerText(page)).toBe('');

    await page.goBack();
    await expect(page.locator(EDITOR_CONTENT)).toContainText(draft, { timeout: COMPOSER_TIMEOUT });
  });

  /**
   * The repo's own prior defect: a component test passed while the sidebar's
   * arrow handler consumed the key first in a real browser. jsdom has no
   * equivalent, so the canary has to live here.
   */
  test('arrow keys inside the editor move the caret, never the sidebar selection', async ({
    page,
  }) => {
    const composer = await openComposer(page);

    await composer.pressSequentially('alpha');
    await composer.press('ArrowLeft');
    await composer.pressSequentially('X');

    expect(await composerText(page)).toBe('alphXa');
  });

  test('the composer region is free of accessibility violations', async ({ page }) => {
    await openComposer(page);

    // `page as never` matches every other axe spec here: the package resolves
    // its own @playwright/test and the two Page types are structurally apart.
    const results = await new AxeBuilder({ page: page as never })
      .include(COMPOSER_REGION)
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

test.describe('composer textarea · the same gate pins the legacy arm', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders a real textarea when the query asks for it', async ({ page }) => {
    await page.goto('/chat?composer=textarea');

    const composer = page.locator(COMPOSER);
    await expect(composer).toBeVisible({ timeout: COMPOSER_TIMEOUT });
    expect(await composer.evaluate((node) => node.tagName)).toBe('TEXTAREA');
  });
});
