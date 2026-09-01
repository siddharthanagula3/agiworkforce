import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { signIn } from './qa-capability-harness';

/**
 * Enter mid-composition must not send. jsdom cannot see this — a composition is
 * a browser-level state, not a React event — so it is asserted here, driven
 * through CDP's Input domain. The Playwright config is chromium-only, which is
 * what makes a CDP-based spec safe to keep in the default run.
 */
const CHAT_EDITOR_URL = '/chat?composer=editor';
const COMPOSER = '[data-composer-textarea]';
const COMPOSER_TIMEOUT = 20000;
const REPLY_TIMEOUT = 30000;

const HIRAGANA_READING = 'にほんご';
const KANJI_COMMIT = '日本語';

async function openComposer(page: Page) {
  await page.goto(CHAT_EDITOR_URL);
  const composer = page.locator(COMPOSER);
  await expect(composer).toBeVisible({ timeout: COMPOSER_TIMEOUT });
  await composer.click();
  return composer;
}

/** Put the IME into an uncommitted composition, as a CJK keyboard would. */
async function beginComposition(cdp: CDPSession, text: string) {
  await cdp.send('Input.imeSetComposition', {
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
  });
}

/** Accept the candidate — composition ends and the text becomes real. */
async function commitComposition(cdp: CDPSession, text: string) {
  await cdp.send('Input.insertText', { text });
}

test.describe('composer editor · IME composition', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('Enter while composing selects the candidate instead of sending', async ({ page }) => {
    const composer = await openComposer(page);
    const cdp = await page.context().newCDPSession(page);

    await beginComposition(cdp, HIRAGANA_READING);
    await composer.press('Enter');

    // Nothing left the composer: the keystroke belonged to the IME.
    await expect(page.locator('.message-inner')).toHaveCount(0);
    await expect(composer).not.toBeEmpty();
  });

  test('Enter after the candidate is committed sends the composed text', async ({ page }) => {
    const composer = await openComposer(page);
    const cdp = await page.context().newCDPSession(page);

    await beginComposition(cdp, HIRAGANA_READING);
    await commitComposition(cdp, KANJI_COMMIT);
    await expect(composer).toContainText(KANJI_COMMIT);

    await composer.press('Enter');

    await expect(page.getByText(KANJI_COMMIT).first()).toBeVisible({ timeout: REPLY_TIMEOUT });
    await expect(composer).toBeEmpty();
  });

  test('a mention menu open over a composition does not steal the candidate Enter', async ({
    page,
  }) => {
    const composer = await openComposer(page);
    const cdp = await page.context().newCDPSession(page);

    await composer.pressSequentially('@');
    await expect(page.getByRole('listbox', { name: 'Mentions' })).toBeVisible();

    await beginComposition(cdp, HIRAGANA_READING);
    await composer.press('Enter');

    await expect(page.locator('.message-inner')).toHaveCount(0);
  });

  test('a composition is not truncated by the character cap check', async ({ page }) => {
    const composer = await openComposer(page);
    const cdp = await page.context().newCDPSession(page);

    await beginComposition(cdp, HIRAGANA_READING);
    await commitComposition(cdp, KANJI_COMMIT);

    await expect(composer).toContainText(KANJI_COMMIT);
    expect((await composer.innerText()).trim()).toBe(KANJI_COMMIT);
  });
});
