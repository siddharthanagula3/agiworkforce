import {
  completeMockedDeviceSignIn,
  installCloudApiStubs,
  mockDeviceAuthorization,
  recordedCloudApiCalls,
  restoreLocalModeProfile,
  writePersistedAppMode,
  type CloudApiStubOptions,
} from '../helpers/cloudSession';

function shellText(): Promise<string> {
  return browser.execute(() => document.body.innerText || '') as Promise<string>;
}

function boundaryErrorBannerVisible(): Promise<boolean> {
  return browser.execute(
    () => !!document.querySelector('[data-testid="conversation-boundary-error"]'),
  ) as Promise<boolean>;
}

async function fullScreenTakeoverVisible(): Promise<boolean> {
  return (await browser.execute(() =>
    (document.body.innerText || '').includes('Could not open Cloud Mode'),
  )) as boolean;
}

async function enterCloudWith(stubs: CloudApiStubOptions): Promise<void> {
  await writePersistedAppMode({ mode: 'local', hasSelectedMode: true, hasOnboarded: true });
  await browser.refresh();
  await (
    await $('textarea[aria-label="Chat message input"]')
  ).waitForDisplayed({
    timeout: 60_000,
  });

  await installCloudApiStubs(stubs);
  await mockDeviceAuthorization();

  const cloudTab = await $('button[role="tab"]=Cloud');
  await cloudTab.waitForDisplayed({ timeout: 30_000 });
  await cloudTab.click();

  await completeMockedDeviceSignIn();
}

describe('AGI Desktop Cloud degrades instead of blanking', () => {
  after(async () => {
    await restoreLocalModeProfile();
  });

  it('keeps the shell mounted when /api/projects fails (DES-C10)', async function () {
    this.timeout(240_000);

    await enterCloudWith({
      me: 'ok',
      models: 'ok',
      conversations: 'ok',
      projects: 'server-error',
    });

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 60_000 });
    await expect(composer).toBeDisplayed();

    const sidebar = await $('aside[data-v3-sidebar]');
    await expect(sidebar).toBeDisplayed();

    const calls = await recordedCloudApiCalls();
    expect(calls.some((path) => path.startsWith('/api/projects'))).toBe(true);

    expect(await fullScreenTakeoverVisible()).toBe(false);
    expect(await boundaryErrorBannerVisible()).toBe(false);

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-projects-failure.png');
  });

  it('reports a conversation-list failure inline and keeps chat usable (DES-C10)', async function () {
    this.timeout(240_000);

    await enterCloudWith({
      me: 'ok',
      models: 'ok',
      conversations: 'server-error',
      projects: 'ok',
    });

    await browser.waitUntil(async () => boundaryErrorBannerVisible(), {
      timeout: 60_000,
      interval: 500,
      timeoutMsg: `No inline conversation-boundary error appeared. Shell text: ${await shellText()}`,
    });

    expect(await fullScreenTakeoverVisible()).toBe(false);
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 60_000 });
    await expect(composer).toBeDisplayed();
    await expect($('aside[data-v3-sidebar]')).toBeDisplayed();

    const banner = await $('[data-testid="conversation-boundary-error"]');
    const bannerText = await banner.getText();
    expect(bannerText).toContain('Try again');

    const dismissed = await browser.execute(() => {
      const button = document.querySelector<HTMLButtonElement>(
        '[data-testid="conversation-boundary-error"] button[aria-label="Dismiss conversation loading error"]',
      );
      if (!button) return false;
      button.click();
      return true;
    });
    expect(dismissed).toBe(true);

    await browser.waitUntil(async () => !(await boundaryErrorBannerVisible()), {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: 'The conversation-boundary banner could not be dismissed',
    });
    await expect($('textarea[aria-label="Chat message input"]')).toBeDisplayed();

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-conversations-failure.png');
  });

  it('keeps a usable model picker and an honest plan row when /api/me fails (DES-C20)', async function () {
    this.timeout(240_000);

    await enterCloudWith({
      me: 'server-error',
      models: 'ok',
      conversations: 'ok',
      projects: 'ok',
    });

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 60_000 });

    await browser.waitUntil(
      async () =>
        browser.execute(() => {
          const sidebar = document.querySelector('aside[data-v3-sidebar]');
          return !!sidebar && !(sidebar.textContent ?? '').includes('Loading...');
        }),
      {
        timeout: 60_000,
        interval: 500,
        timeoutMsg: 'The sidebar plan row stayed on the "Loading..." sentinel after /api/me failed',
      },
    );

    const picker = await $('button[aria-label="Select model"]');
    await picker.waitForDisplayed({ timeout: 30_000 });
    await picker.click();

    const pickerEmptyState = await $('*=No managed models available');
    await browser.pause(750);
    expect(await pickerEmptyState.isExisting()).toBe(false);

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-me-failure.png');
  });
});
