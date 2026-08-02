/**
 * Diagnostic + launch gate: what does the desktop app actually present on a
 * clean profile, and is its IPC bridge alive?
 *
 * Named aaa-* so it runs first in a shared-profile run. It deliberately asserts
 * as little product behaviour as possible, but it does assert the two things
 * every other spec silently depends on:
 *
 *   1. invoke() SETTLES. Under Tauri's isolation pattern a broken relay leaves
 *      every invoke() promise pending forever — no resolve, no reject — so the
 *      shell renders "Opening encrypted local data…" indefinitely. A spec that
 *      only checked for a non-empty document would pass against that screen, so
 *      the outcome of a real command is asserted directly.
 *   2. The shell reaches an INTERACTIVE control. Waiting for loading copy to
 *      disappear passes vacuously before React mounts; waiting for a positive
 *      signal does not.
 */
import * as fs from 'node:fs';

const OUT =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/30355494-9eee-49ba-a1a7-592e7a715c5f/scratchpad/desktop-screens';

const BRIDGE_TIMEOUT_MS = 30_000;
const IPC_SETTLE_TIMEOUT_MS = 15_000;
const INTERACTIVE_TIMEOUT_MS = 90_000;

fs.mkdirSync(OUT, { recursive: true });

describe('desktop first-screen diagnostic', () => {
  it('settles a real IPC command instead of hanging on the isolation relay', async () => {
    // The injected bridge lands with the webview's first document, which can be
    // a few hundred ms after the WebDriver session attaches. Wait for it so a
    // race here cannot be mistaken for the deadlock this test exists to catch.
    await browser.waitUntil(
      async () =>
        await browser.execute(() => {
          const internals = (window as unknown as Record<string, unknown>)[
            '__TAURI_INTERNALS__'
          ] as { invoke?: unknown } | undefined;
          return typeof internals?.invoke === 'function';
        }),
      {
        timeout: BRIDGE_TIMEOUT_MS,
        interval: 250,
        timeoutMsg: 'window.__TAURI_INTERNALS__.invoke was never installed in the webview',
      },
    );

    // `startup_get_recovery_state` is the command StartupRecoveryBootstrap
    // itself gates on, so its outcome is the shell's actual unblock condition.
    // Either settlement is a pass here: this asserts the bridge is alive, not
    // what the backend decided.
    const probe = (await browser.executeAsync(
      (timeoutMs: number, done: (result: unknown) => void) => {
        const internals = (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] as
          | { invoke?: (cmd: string) => Promise<unknown> }
          | undefined;
        if (typeof internals?.invoke !== 'function') {
          done({ outcome: 'no-ipc-bridge' });
          return;
        }
        const timer = setTimeout(() => done({ outcome: 'never-settled' }), timeoutMs);
        internals
          .invoke('startup_get_recovery_state')
          .then((value) => {
            clearTimeout(timer);
            done({ outcome: 'resolved', detail: JSON.stringify(value ?? null).slice(0, 300) });
          })
          .catch((error: unknown) => {
            clearTimeout(timer);
            done({ outcome: 'rejected', detail: String(error).slice(0, 300) });
          });
      },
      IPC_SETTLE_TIMEOUT_MS,
    )) as { outcome: string; detail?: string };

    console.log('IPC PROBE:', JSON.stringify(probe));
    expect(['resolved', 'rejected']).toContain(probe.outcome);
  });

  it('captures the rendered first screen once it is interactive', async () => {
    const startedAt = Date.now();
    await browser.waitUntil(
      async () =>
        await browser.execute(
          () =>
            document.querySelectorAll('button, [role="button"], [role="tab"], textarea').length > 0,
        ),
      {
        timeout: INTERACTIVE_TIMEOUT_MS,
        interval: 500,
        timeoutMsg: 'no interactive control rendered within 90s of launch',
      },
    );
    const coldStartMs = Date.now() - startedAt;
    console.log(`COLD START: first interactive control after ${coldStartMs}ms`);
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
    // The startup gate must be gone, not merely overlaid by something else.
    expect(snapshot.visibleText).not.toContain('Opening encrypted local data');
    // A real control the user can act on, with a label — not just any element.
    expect(snapshot.controls.length).toBeGreaterThan(0);
  });
});
