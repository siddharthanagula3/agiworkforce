import { waitForDesktopShell } from '../support/desktop-shell';

describe('AGI Desktop main-window lifecycle', () => {
  it('keeps the app resident in the menu bar and restores the main window', async function () {
    this.timeout(90_000);

    await waitForDesktopShell();

    const useLocalMode = await $('button=Use Local Mode');
    if (await useLocalMode.isExisting()) {
      await useLocalMode.waitForDisplayed({ timeout: 15_000 });
      await useLocalMode.click();
    }

    const settingsButton = await $('button[aria-label="Settings"]');
    await settingsButton.waitForDisplayed({ timeout: 15_000 });
    await settingsButton.click();

    const menuBarToggle = await $('#keepInMenuBar');
    await menuBarToggle.waitForDisplayed({ timeout: 10_000 });
    expect(await menuBarToggle.getAttribute('aria-checked')).toBe('true');

    const menuBarCopy = await browser.execute(() =>
      document.body.textContent?.includes(
        'Keep AGI Workforce in the macOS menu bar or system tray when the main window is closed.',
      ),
    );
    expect(menuBarCopy).toBe(true);

    const eventAccepted = await browser.execute(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'w',
          code: 'KeyW',
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );

    // dispatchEvent returns false when the app intercepted and prevented the
    // WebKit default close behavior.
    expect(eventAccepted).toBe(false);

    await browser.pause(500);
    expect(await browser.getTitle()).toBe('AGI Workforce');

    const restored = await browser.execute(async () => {
      const tauriWindow = window as typeof window & {
        __TAURI_INTERNALS__?: {
          invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      };
      await tauriWindow.__TAURI_INTERNALS__?.invoke('window_set_visibility', { visible: true });
      return Boolean(tauriWindow.__TAURI_INTERNALS__);
    });
    expect(restored).toBe(true);

    await browser.waitUntil(async () => menuBarToggle.isDisplayed(), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'The resident app did not restore its main window',
    });
    expect(await menuBarToggle.getAttribute('aria-checked')).toBe('true');
  });
});
