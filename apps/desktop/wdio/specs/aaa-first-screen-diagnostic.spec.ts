/**
 * Diagnostic: what does the desktop app actually present on a clean profile?
 *
 * Named aaa-* so it runs first in a shared-profile run. It asserts nothing
 * about product behaviour; it captures the real first screen so the demo path
 * can be judged from evidence instead of assumption.
 */
import * as fs from 'node:fs';

const OUT =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/30355494-9eee-49ba-a1a7-592e7a715c5f/scratchpad/desktop-screens';

fs.mkdirSync(OUT, { recursive: true });

describe('desktop first-screen diagnostic', () => {
  it('captures the rendered first screen', async () => {
    // The shell gates on the backend finishing encrypted-store init. Poll for
    // that gate to clear so the capture is the real first screen, and record
    // how long a cold start actually takes — a demo-relevant number.
    // Is the Tauri IPC bridge even present in this webview? The shell gates on
    // invoke('startup_get_recovery_state'); a missing bridge means that promise
    // never settles and the app sits on its loading screen forever.
    await browser.pause(6000);
    const ipc = await browser.execute(() => {
      const w = window as unknown as Record<string, unknown>;
      return {
        hasTauriInternals: typeof w['__TAURI_INTERNALS__'] !== 'undefined',
        hasTauriGlobal: typeof w['__TAURI__'] !== 'undefined',
        globalKeys: Object.keys(w).filter((k) => k.toUpperCase().includes('TAURI')),
      };
    });
    console.log('IPC BRIDGE:', JSON.stringify(ipc));

    const invokeProbe = await browser.executeAsync((done: (r: unknown) => void) => {
      const w = window as unknown as Record<string, any>;
      const internals = w['__TAURI_INTERNALS__'];
      if (!internals?.invoke) {
        done({ outcome: 'no-invoke-available' });
        return;
      }
      const timer = setTimeout(() => done({ outcome: 'never-settled-after-10s' }), 10000);
      internals
        .invoke('startup_get_recovery_state')
        .then((value: unknown) => {
          clearTimeout(timer);
          done({ outcome: 'resolved', value: JSON.stringify(value ?? null) });
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          done({ outcome: 'rejected', error: String(error) });
        });
    });
    console.log('INVOKE PROBE:', JSON.stringify(invokeProbe));

    // Wait for a POSITIVE signal — something interactive on screen. Waiting for
    // the loading copy to disappear passes vacuously before React mounts.
    const startedAt = Date.now();
    await browser.waitUntil(
      async () =>
        await browser.execute(
          () =>
            document.querySelectorAll('button, [role="button"], [role="tab"], textarea').length > 0,
        ),
      {
        timeout: 90000,
        interval: 500,
        timeoutMsg: 'no interactive control rendered within 90s of launch',
      },
    );
    console.log(`COLD START: first interactive control after ${Date.now() - startedAt}ms`);
    await browser.pause(1000);

    const snapshot = await browser.execute(() => {
      const visibleText = (document.body.innerText ?? '').trim().slice(0, 1200);
      const controls = Array.from(
        document.querySelectorAll('button, [role="button"], [role="tab"], a[href]'),
      )
        .slice(0, 40)
        .map((el) => {
          const label = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 60);
          return label ? `${el.tagName.toLowerCase()}: ${label}` : null;
        })
        .filter(Boolean);
      const inputs = Array.from(document.querySelectorAll('textarea, input')).map(
        (el) => `${el.tagName.toLowerCase()}[aria-label=${el.getAttribute('aria-label')}]`,
      );
      return {
        title: document.title,
        url: location.href,
        visibleText,
        controls,
        inputs,
        rootChildCount: document.getElementById('root')?.childElementCount ?? -1,
      };
    });

    fs.writeFileSync(`${OUT}/first-screen.json`, JSON.stringify(snapshot, null, 2));
    await browser.saveScreenshot(`${OUT}/first-screen.png`);

    console.log('FIRST SCREEN:', JSON.stringify(snapshot, null, 2));
    expect(snapshot.rootChildCount).toBeGreaterThan(0);
  });
});
