import {
  persistedAppMode,
  restoreLocalModeProfile,
  writePersistedAppMode,
} from '../helpers/cloudSession';

describe('AGI Desktop first-run Cloud onboarding', () => {
  after(async () => {
    await restoreLocalModeProfile();
  });

  it('enters the Cloud workspace from the onboarding Cloud Mode card', async function () {
    this.timeout(180_000);

    await writePersistedAppMode({ mode: 'local', hasSelectedMode: false, hasOnboarded: false });
    await browser.refresh();

    const cloudCard = await $('[data-testid="onboarding-cloud-mode"]');
    await cloudCard.waitForDisplayed({ timeout: 60_000 });

    const cardLabel = (await cloudCard.getText()).trim();
    expect(cardLabel).toContain('Sign in to AGI Cloud');
    expect(cardLabel.toLowerCase()).not.toContain('continue with local');

    await cloudCard.click();

    await browser.waitUntil(
      async () => !(await $('[data-testid="onboarding-cloud-mode"]').isExisting()),
      {
        timeout: 60_000,
        interval: 250,
        timeoutMsg: 'The onboarding wizard never closed after choosing Cloud Mode',
      },
    );

    const signInHeading = await $('h1=Sign in to AGI Cloud');
    await signInHeading.waitForDisplayed({ timeout: 60_000 });
    await expect(signInHeading).toBeDisplayed();

    expect(await persistedAppMode()).toBe('cloud');

    const composerMounted = await $('textarea[aria-label="Chat message input"]').isExisting();
    expect(composerMounted).toBe(false);

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-onboarding-entry.png');
  });

  it('still lets the Local card keep the install on device', async function () {
    this.timeout(180_000);

    await writePersistedAppMode({ mode: 'local', hasSelectedMode: false, hasOnboarded: false });
    await browser.refresh();

    const localCard = await $('button*=Start Local Mode');
    await localCard.waitForDisplayed({ timeout: 60_000 });
    await localCard.click();

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 60_000 });
    expect(await persistedAppMode()).toBe('local');
  });
});
