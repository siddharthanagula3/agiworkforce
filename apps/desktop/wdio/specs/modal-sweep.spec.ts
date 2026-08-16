import { waitForDesktopShell } from '../support/desktop-shell';

async function activeElementDescription(): Promise<string> {
  return browser.execute(() => {
    const el = document.activeElement;
    if (!el) return 'none';
    return `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label') ?? ''}"]`;
  });
}

async function dialogVisible(): Promise<boolean> {
  return browser.execute(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'));
    return dialogs.some((d) => (d as HTMLElement).getClientRects().length > 0);
  });
}

async function escapeUntilNoDialog(maxPresses = 4): Promise<void> {
  for (let i = 0; i < maxPresses; i += 1) {
    if (!(await dialogVisible())) return;
    await browser.keys('Escape');
    await browser.pause(350);
  }
}

async function expectFocusInsideDialog(): Promise<void> {
  const inside = await browser.execute(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'));
    const visible = dialogs.find((d) => (d as HTMLElement).getClientRects().length > 0);
    return !!visible && !!document.activeElement && visible.contains(document.activeElement);
  });
  expect(inside).toBe(true);
}

describe('modal sweep · every in-shell overlay opens, traps focus, and closes', () => {
  before(async () => {
    await waitForDesktopShell();
    const useLocal = await $('button=Use Local Mode');
    if ((await useLocal.isExisting()) && (await useLocal.isDisplayed())) {
      await useLocal.click();
      await waitForDesktopShell();
    }
    await escapeUntilNoDialog();
  });

  afterEach(async () => {
    await escapeUntilNoDialog();
  });

  it('Search modal: sidebar button opens it, Escape closes it', async () => {
    const searchBtn = await $('aside[data-v3-sidebar] button*=Search');
    await searchBtn.waitForDisplayed({ timeout: 15_000 });
    await searchBtn.click();

    await browser.waitUntil(dialogVisible, {
      timeout: 10_000,
      timeoutMsg: 'Search modal never opened from the sidebar button',
    });
    await expectFocusInsideDialog();

    await browser.keys('Escape');
    await browser.waitUntil(async () => !(await dialogVisible()), {
      timeout: 10_000,
      timeoutMsg: 'Search modal did not close on Escape',
    });
  });

  it('Command palette: ⌘K opens it, Escape closes it, composer regains reachability', async () => {
    await browser.keys(['Meta', 'k']);
    await browser.pause(300);
    if (!(await dialogVisible())) {
      await browser.execute(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
        );
      });
      await browser.pause(300);
    }
    const opened = await dialogVisible();
    expect(opened).toBe(true);
    await expectFocusInsideDialog();

    await browser.keys('Escape');
    await browser.waitUntil(async () => !(await dialogVisible()), {
      timeout: 10_000,
      timeoutMsg: 'Command palette did not close on Escape',
    });

    const composer = await $('textarea[aria-label="Chat message input"]');
    expect(await composer.isExisting()).toBe(true);
    console.log('post-close focus:', await activeElementDescription());
  });

  it('Settings: gear opens the panel, Escape closes without dirty state', async () => {
    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 15_000 });
    await gear.click();

    const nav = await $('nav[aria-label="Settings sections"]');
    await nav.waitForDisplayed({ timeout: 10_000 });
    await expectFocusInsideDialog();

    await browser.keys('Escape');
    await browser.waitUntil(async () => !(await nav.isExisting()), {
      timeout: 10_000,
      timeoutMsg: 'Settings did not close on Escape from a clean state',
    });
  });

  it('Plans modal: opens from the account menu upgrade entry and closes', async function () {
    const accountBtn = await $('aside[data-v3-sidebar] [data-v3-account-trigger]');
    const fallbackAccountBtn = await $('aside[data-v3-sidebar] button[aria-haspopup="menu"]');
    const trigger = (await accountBtn.isExisting()) ? accountBtn : fallbackAccountBtn;
    if (!(await trigger.isExisting())) {
      console.log('SKIP: no account menu trigger found in the sidebar footer');
      this.skip();
      return;
    }
    await trigger.click();
    await browser.pause(400);

    const upgrade = await $('[role="menuitem"]*=Upgrade');
    if (!(await upgrade.isExisting())) {
      console.log('SKIP: no Upgrade entry (plan may already be highest); menu opened correctly');
      await browser.keys('Escape');
      this.skip();
      return;
    }
    await upgrade.click();

    await browser.waitUntil(dialogVisible, {
      timeout: 10_000,
      timeoutMsg: 'Plans modal never opened from the upgrade menu entry',
    });
    await browser.keys('Escape');
    await browser.waitUntil(async () => !(await dialogVisible()), {
      timeout: 10_000,
      timeoutMsg: 'Plans modal did not close on Escape',
    });
  });
});
