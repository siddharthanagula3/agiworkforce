import { waitForDesktopShell } from './desktop-shell';

export async function resetToFreshOnboarding(): Promise<void> {
  await browser.execute(() => {
    (window as unknown as Record<string, unknown>)['__wdioPreReloadMarker'] = true;
    window.localStorage.removeItem('agiworkforce-ui');
    window.localStorage.removeItem('app-mode-store');
    window.location.reload();
  });
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
