describe('AGI Desktop encrypted-database startup recovery', () => {
  it('renders the complete recovery surface without mounting the normal app', async function () {
    // The Tauri WDIO service probes native window focus before each WebDriver
    // command. Recovery mode deliberately mounts before the normal Tauri
    // frontend bridge, so each probe waits for its five-second fallback.
    this.timeout(120000);

    const heading = await $('h1');
    await heading.waitForDisplayed({ timeout: 15000 });
    await expect(heading).toHaveText('AGI could not unlock local data');

    expect(await browser.getTitle()).toBe('AGI — Local data recovery');

    const bodyText = await $('body').getText();
    expect(bodyText).toContain('DB_UNLOCK');
    expect(bodyText).toContain('Your local data is preserved');
    expect(bodyText).toContain('Your database was not deleted, reset, renamed, or replaced.');

    await expect($('button=Retry')).toBeDisplayed();
    await expect($('button=Open Data Folder')).toBeDisplayed();
    await expect($('button=Export Diagnostics')).toBeDisplayed();
    await expect($('button=Quit AGI')).toBeDisplayed();

    const mountedSurfaces = await browser.execute(() => ({
      composer: !!document.querySelector('textarea[aria-label="Chat message input"]'),
      sidebar: !!document.querySelector('aside[data-v3-sidebar]'),
      readyRegion: !!document.querySelector('[data-testid="app-status-live-region"]'),
    }));
    expect(mountedSurfaces).toEqual({
      composer: false,
      sidebar: false,
      readyRegion: false,
    });

    await browser.saveScreenshot('/private/tmp/agi-desktop-startup-recovery-wdio-20260726.png');
  });
});
