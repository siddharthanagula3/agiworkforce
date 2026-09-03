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
