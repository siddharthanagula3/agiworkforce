/**
 * DES-C02 — the first-run onboarding "Cloud Mode" card must actually enter
 * Cloud.
 *
 * `OnboardingWizard.handleCloudMode` completed onboarding and called the
 * OPTIONAL `onCloudModeSelected` callback, which the only production mount
 * (`App.tsx` -> `OnboardingWelcome`) did not pass. Its button was labelled
 * "Continue with Local for now", so the very first screen of a Cloud demo
 * silently chose the Local trust boundary.
 *
 * `showOnboarding` is derived purely from `hasSelectedMode` in the persisted
 * `app-mode-store`, so clearing that flag and reloading reproduces a first run
 * on the real binary.
 */
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

    // Reproduce a first run: no mode selected yet, Local as the shipped default.
    await writePersistedAppMode({ mode: 'local', hasSelectedMode: false, hasOnboarded: false });
    await browser.refresh();

    const cloudCard = await $('[data-testid="onboarding-cloud-mode"]');
    await cloudCard.waitForDisplayed({ timeout: 60_000 });

    // The label must describe what the control does. "Continue with Local for
    // now" on the Cloud card is the copy that shipped with the dead callback.
    const cardLabel = (await cloudCard.getText()).trim();
    expect(cardLabel).toContain('Sign in to AGI Cloud');
    expect(cardLabel.toLowerCase()).not.toContain('continue with local');

    await cloudCard.click();

    // Wait for the wizard to unmount FIRST: its own button carries the same
    // label as the AuthPage action, so querying by label while both are mounted
    // could match the wizard and prove nothing.
    await browser.waitUntil(
      async () => !(await $('[data-testid="onboarding-cloud-mode"]').isExisting()),
      {
        timeout: 60_000,
        interval: 250,
        timeoutMsg: 'The onboarding wizard never closed after choosing Cloud Mode',
      },
    );

    // The shell must now render the sign-in surface — not the Local composer,
    // which is where the unwired callback silently landed. Since the native
    // sign-in redesign (a3b1005c8) the AuthPage's "Sign in to AGI Cloud" is
    // the card HEADING; the old device-auth page's button of that name is gone.
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

    // A real first run persists the shipped Local default with no selection.
    // (`mode: 'cloud'` + `hasSelectedMode: false` is unreachable in product —
    // choosing Cloud always records the selection — and the shell renders
    // AuthPage before the onboarding overlay for any signed-out Cloud mode,
    // so that synthetic state can never show the wizard.)
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
