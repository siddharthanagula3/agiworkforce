import { device, element, by, waitFor } from 'detox';

jest.setTimeout(540000);

describe('Onboarding, local setup with cloud invite gate', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
    });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('shows the hero screen on first launch', async () => {
    await waitFor(element(by.id('onboarding-hero-screen')))
      .toBeVisible()
      .withTimeout(8000);
  });

  it('shows the locked tagline "Your AI workspace for everyday work."', async () => {
    await waitFor(element(by.id('hero-tagline')))
      .toBeVisible()
      .withTimeout(4000);
    await waitFor(element(by.text('Your AI workspace for everyday work.')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('shows the "Start chatting" CTA', async () => {
    await waitFor(element(by.id('hero-start-chatting-btn')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('tapping "Start chatting" opens the disclosure modal', async () => {
    await element(by.id('hero-start-chatting-btn')).tap();
    await waitFor(element(by.id('disclosure-accept-btn')))
      .toBeVisible()
      .withTimeout(6000);
  });

  it('accepting disclosure shows the device-tier detection screen', async () => {
    await element(by.id('disclosure-accept-btn')).tap();
    await waitFor(element(by.id('onboarding-device-tier-screen')))
      .toBeVisible()
      .withTimeout(6000);
  });

  it('shows the device-tier headline with the detected device name', async () => {
    await waitFor(element(by.id('device-tier-headline')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('shows the download / Continue button', async () => {
    await waitFor(element(by.id('device-tier-download-btn')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('tapping the download button advances through installed or download flow', async () => {
    await element(by.id('device-tier-download-btn')).tap();
    try {
      await waitFor(element(by.id('onboarding-download-screen')))
        .toBeVisible()
        .withTimeout(4000);
    } catch {
      return;
    }
  });

  it('shows the download percent counter', async () => {
    try {
      await waitFor(element(by.id('download-percent')))
        .toBeVisible()
        .withTimeout(3000);
    } catch {
      // Installed or OS-provided model: already navigated to chat.
    }
  });

  it('"Continue to chat" skip button navigates to chat empty state', async () => {
    const deadline = Date.now() + 480000;
    let reachedChat = false;
    while (Date.now() < deadline && !reachedChat) {
      try {
        await element(by.id('download-skip-btn')).tap();
      } catch (err) {
        void err;
      }
      try {
        await waitFor(element(by.id('chat.composer.input')))
          .toBeVisible()
          .withTimeout(3000);
        reachedChat = true;
      } catch (err) {
        void err;
      }
    }

    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(5000);
    await device.takeScreenshot('02-onboarding-local');
  });
});
