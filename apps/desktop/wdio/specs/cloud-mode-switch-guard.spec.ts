/**
 * DES-C16 — a mid-stream Local↔Cloud switch must be refused.
 *
 * A mode switch flips `runtimeAppMode`, disposes the CloudRuntime
 * (`desktopChatRuntime.disposeActiveDesktopChatRuntime`) and wipes the
 * conversation boundary (`App.tsx`), so it destroys the in-flight response.
 * `appModeStore.setMode` already refused while `isChatStoreStreaming()` was
 * true — but that helper read `useChatMessageStore`, which never carries
 * `isStreaming` (it lives on the execution store), and it never consulted
 * `@agiworkforce/unified-chat`'s shared store, which is where every Managed
 * Cloud turn streams. The guard was therefore permanently false and a toggle
 * click mid-answer succeeded.
 *
 * This spec holds a real Cloud stream open with a stalled SSE response and then
 * clicks the Local tab.
 */
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
      // Opens an SSE stream that never sends [DONE], so the app stays in the
      // streaming state for the whole test.
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

    // Start a Cloud turn. `useChat` calls `startStreaming` at send time, so the
    // shared store reports isStreaming before any chunk arrives.
    await composer.click();
    await composer.addValue('Hold this stream open for the mode-switch guard.');

    const sendButton = await $('button[aria-label*="Send message ("]');
    await sendButton.waitForDisplayed({ timeout: 30_000 });
    await sendButton.click();

    // Wait for the user turn to land, which only happens after the send starts.
    const userMessage = await $('[data-role="user"]');
    await userMessage.waitForDisplayed({ timeout: 60_000 });

    // Now attempt the switch that used to silently destroy the response.
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

    // The refusal must be real, not just a toast over a completed switch.
    expect(await activeModeTab()).toBe('Cloud');
    expect(await persistedAppMode()).toBe('cloud');
    await expect($('textarea[aria-label="Chat message input"]')).toBeDisplayed();
    await expect($('[data-role="user"]')).toBeDisplayed();

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-mode-switch-guard.png');
  });

  it('allows the switch again once the stream is stopped', async function () {
    this.timeout(180_000);

    // Stop generation returns the stores to idle; the guard must then let go
    // rather than pinning the user in Cloud mode. The composer's send control
    // becomes this Stop button for the duration of a stream (SendButton.tsx).
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
