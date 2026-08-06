/**
 * TEMPORARY capture spec: render the signed-out Cloud AuthPage and screenshot
 * it at two window sizes, so the reported "overlapping, inconsistent sign-in
 * UI" can be seen exactly as the app draws it. Not an assertion suite —
 * delete after the auth screen is fixed.
 */
import { browser } from '@wdio/globals';
import path from 'node:path';
import fs from 'node:fs';
import { waitForDesktopShell } from '../support/desktop-shell';
import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('auth-capture');

describe('auth screen capture', () => {
  before(async () => {
    fs.mkdirSync(SCREEN_DIR, { recursive: true });
    await waitForDesktopShell();
  });

  it('captures the signed-out Cloud auth page', async () => {
    // Switch the workspace to Cloud; signed out => AuthPage renders.
    await browser.execute(() => {
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
      const cloud = tabs.find((tab) => tab.textContent?.trim().toLowerCase().includes('cloud'));
      cloud?.click();
    });
    // Driver-side settle (in-page Promises never resolve under this driver).
    await browser.pause(2500);
    await browser.saveScreenshot(path.join(SCREEN_DIR, 'auth-default-size.png'));

    // Narrow window: the aside hides under lg:, the mobile brand shows.
    await browser.execute(() => {
      window.resizeTo(980, 760);
    });
    await browser.pause(800);
    await browser.saveScreenshot(path.join(SCREEN_DIR, 'auth-narrow.png'));

    // Restore Local mode so later specs are unaffected.
    await browser.execute(() => {
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
      const local = tabs.find((tab) => tab.textContent?.trim().toLowerCase().includes('local'));
      local?.click();
    });
    await browser.pause(800);
  });
});
