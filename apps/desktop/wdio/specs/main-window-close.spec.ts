import { waitForDesktopShell } from '../support/desktop-shell';

describe('AGI Desktop main-window lifecycle', () => {
  it('quits the native application instead of leaving an empty WebView host', async function () {
    this.timeout(90_000);

    await waitForDesktopShell();

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

    let nativeSessionClosed = false;
    await browser.waitUntil(
      async () => {
        try {
          await browser.getTitle();
          return false;
        } catch {
          nativeSessionClosed = true;
          return true;
        }
      },
      {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: 'The main window closed but the native application process stayed alive',
      },
    );

    expect(nativeSessionClosed).toBe(true);
    // The embedded WebDriver server exits with the app. Clear the now-defunct
    // session id so WDIO does not misreport its expected cleanup ECONNREFUSED
    // as a product failure.
    (browser as unknown as { sessionId?: string }).sessionId = undefined;
  });
});
