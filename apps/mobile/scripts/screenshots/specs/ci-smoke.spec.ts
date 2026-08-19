import { by, device, element, waitFor } from 'detox';

describe('Mobile first-run shell', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
      launchArgs: { detoxEnableSynchronization: '0' },
    });
    await device.disableSynchronization();
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  // The age gate guards Cloud sign-in, not first launch — app/_layout.tsx only
  // raises it when a signed-out user heads for /(auth). A first run in Local
  // Mode sends nothing off the device, so it goes straight to the hero.
  it('lands on the local-first onboarding hero', async () => {
    await waitFor(element(by.id('onboarding-hero-screen')))
      .toBeVisible()
      .withTimeout(20_000);
    await waitFor(element(by.text('Your AI workspace for everyday work.')))
      .toBeVisible()
      .withTimeout(5_000);
    await waitFor(element(by.id('hero-start-chatting-btn')))
      .toBeVisible()
      .withTimeout(5_000);
  });
});
