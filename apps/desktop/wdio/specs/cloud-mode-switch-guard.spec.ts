import {
  completeMockedDeviceSignIn,
  installCloudApiStubs,
  mockDeviceAuthorization,
  persistedAppMode,
  restoreLocalModeProfile,
  writePersistedAppMode,
} from '../helpers/cloudSession';

const STREAMING_REFUSAL = 'Finish the current response before switching modes';

function activeModeTab(): Promise<string | null> {
  return browser.execute(() => {
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('button[role="tab"]'));
    const active = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
    return active ? (active.textContent ?? '').trim() : null;
  }) as Promise<string | null>;
}

describe('AGI Desktop mid-stream mode-switch guard', () => {
  after(async () => {
    await restoreLocalModeProfile();
  });

  it('refuses a Cloud -> Local switch while a Cloud response is streaming', async function () {
    this.timeout(300_000);

    await writePersistedAppMode({ mode: 'local', hasSelectedMode: true, hasOnboarded: true });
    await browser.refresh();
    await (
      await $('textarea[aria-label="Chat message input"]')
    ).waitForDisplayed({
      timeout: 60_000,
    });

    await installCloudApiStubs({
      me: 'ok',
      models: 'ok',
      conversations: 'ok',
      projects: 'ok',
      completions: 'stall',
    });
    await mockDeviceAuthorization();

    const cloudTab = await $('button[role="tab"]=Cloud');
    await cloudTab.waitForDisplayed({ timeout: 30_000 });
    await cloudTab.click();
    await completeMockedDeviceSignIn();

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 60_000 });
    expect(await persistedAppMode()).toBe('cloud');
    expect(await activeModeTab()).toBe('Cloud');

    await composer.click();
    await composer.addValue('Hold this stream open for the mode-switch guard.');

    const sendButton = await $('button[aria-label*="Send message ("]');
    await sendButton.waitForDisplayed({ timeout: 30_000 });
    await sendButton.click();

    const userMessage = await $('[data-role="user"]');
    await userMessage.waitForDisplayed({ timeout: 60_000 });

    const localTab = await $('button[role="tab"]=Local');
    await localTab.waitForDisplayed({ timeout: 30_000 });
    await localTab.click();

    await browser.waitUntil(
      async () => {
        const text = (await browser.execute(() => document.body.innerText || '')) as string;
        return text.includes(STREAMING_REFUSAL);
      },
      {
        timeout: 20_000,
        interval: 250,
        timeoutMsg: `The mode-switch guard did not refuse a mid-stream switch (expected "${STREAMING_REFUSAL}")`,
      },
    );

    expect(await activeModeTab()).toBe('Cloud');
    expect(await persistedAppMode()).toBe('cloud');
    await expect($('textarea[aria-label="Chat message input"]')).toBeDisplayed();
    await expect($('[data-role="user"]')).toBeDisplayed();

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-mode-switch-guard.png');
  });

  it('allows the switch again once the stream is stopped', async function () {
    this.timeout(180_000);

    const stopButton = await $('button[aria-label="Stop the current response"]');
    await stopButton.waitForDisplayed({ timeout: 30_000 });
    await stopButton.click();

    await browser.waitUntil(
      async () => !(await $('button[aria-label="Stop the current response"]').isExisting()),
      {
        timeout: 30_000,
        interval: 250,
        timeoutMsg: 'The Cloud stream never returned to an idle state after Stop',
      },
    );

    const localTab = await $('button[role="tab"]=Local');
    await localTab.waitForDisplayed({ timeout: 30_000 });
    await localTab.click();

    await browser.waitUntil(async () => (await persistedAppMode()) === 'local', {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: 'The mode-switch guard kept refusing after the stream stopped',
    });
    expect(await activeModeTab()).toBe('Local');
    await (
      await $('textarea[aria-label="Chat message input"]')
    ).waitForDisplayed({
      timeout: 60_000,
    });
  });
});
