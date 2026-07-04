// One-off visual QA pass: capture real native-app screenshots of the three
// screens the founder wants compared against Claude Desktop reference
// screenshots (see /Users/siddhartha/Desktop/reference/claude_reference/
// 208/209/188). No structural changes are in scope -- this is purely for
// side-by-side polish comparison. Safe to delete after the comparison lands.

const SCREEN_DIR =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/75367813-fb2a-4a49-bdcd-6412347c218f/scratchpad/desktop-qa-screens/claude-compare';

function clickSelector(selector: string) {
  return browser.execute((sel) => {
    (document.querySelector(sel) as HTMLElement | null)?.click();
  }, selector);
}

describe('Visual QA: AGI Desktop vs Claude Desktop reference screenshots', () => {
  it('captures the empty-chat home screen (compare vs 208)', async () => {
    await browser.pause(1500);
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 15000 });
    const size = await browser.getWindowSize();
    console.log('WINDOW SIZE:', JSON.stringify(size));
    await browser.saveScreenshot(`${SCREEN_DIR}/01-empty-chat-home.png`);
  });

  it('captures the expanded sidebar (compare vs 209)', async () => {
    await browser.pause(300);
    const aside = await $('aside[data-v3-sidebar]');
    const collapsed = await aside.getAttribute('data-collapsed');
    if (collapsed === 'true') {
      await clickSelector('aside[data-v3-sidebar] button[title="Expand sidebar"]');
      await browser.pause(400);
    }
    await browser.saveScreenshot(`${SCREEN_DIR}/02-sidebar-expanded.png`);
  });

  it('captures Settings > General/Profile section (compare vs 188)', async () => {
    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 15000 });
    await gear.click();
    const nav = await $('nav[aria-label="Settings sections"]');
    await nav.waitForDisplayed({ timeout: 10000 });
    await browser.pause(500);
    await browser.saveScreenshot(`${SCREEN_DIR}/03-settings-general.png`);
    await browser.keys('Escape');
  });
});
