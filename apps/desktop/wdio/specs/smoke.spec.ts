import * as fs from 'node:fs';

const SCREEN_DIR =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/75367813-fb2a-4a49-bdcd-6412347c218f/scratchpad/desktop-qa-screens';

fs.mkdirSync(SCREEN_DIR, { recursive: true });

describe('AGI Desktop native window smoke test', () => {
  it('should launch and render a non-empty document', async () => {
    await browser.pause(1500);
    const title = await browser.getTitle();
    expect(title).toBe('AGI');

    const body = await $('body');
    const html = await body.getHTML();
    expect(html.length).toBeGreaterThan(0);
  });

  it('should show the chat composer as the first screen (parity matrix: Empty chat input)', async () => {
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 15000 });
    await expect(composer).toBeDisplayed();

    await composer.click();
    await composer.addValue('hello from wdio');
    await expect(composer).toHaveValue('hello from wdio');

    await browser.saveScreenshot(`${SCREEN_DIR}/empty-chat-home.png`);
  });
});
