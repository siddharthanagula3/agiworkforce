import { waitForDesktopShell } from './desktop-shell';

/**
 * Return the app to the fresh-install onboarding state, mid-run.
 *
 * The wdio profile is wiped once per run (wdio.conf.ts `onPrepare`), so the
 * first spec that completes onboarding persists `onboardingCompleted` +
 * `hasSelectedMode` and every later onboarding spec boots straight into the
 * shell — at most one onboarding-dependent spec could pass per run
 * (DESKTOP-NATIVE-E2E-NEVER-RAN-01). Both flags live in localStorage-backed
 * zustand stores (`agiworkforce-ui`, `app-mode-store`), so clearing them and
 * reloading restores the onboarding gate without touching the database or the
 * running tauri plugin (the onPrepare warning about racing plugin init applies
 * to profile deletion at boot, not to an explicit in-spec reload that is
 * followed by a full shell re-wait).
 */
export async function resetToFreshOnboarding(): Promise<void> {
  await browser.execute(() => {
    (window as unknown as Record<string, unknown>)['__wdioPreReloadMarker'] = true;
    window.localStorage.removeItem('agiworkforce-ui');
    window.localStorage.removeItem('app-mode-store');
    window.location.reload();
  });
  // Wait for the NEW document — probing straight after reload() still sees
  // the old one (measured: sub-second "reloads" that never happened).
  await browser.waitUntil(
    async () => {
      try {
        return await browser.execute(
          () => !(window as unknown as Record<string, unknown>)['__wdioPreReloadMarker'],
        );
      } catch {
        return false;
      }
    },
    {
      timeout: 45_000,
      interval: 200,
      timeoutMsg: 'document never reloaded after onboarding reset',
    },
  );
  await waitForDesktopShell();
}
