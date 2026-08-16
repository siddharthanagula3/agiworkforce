
import { device, element, by, waitFor } from 'detox';

describe('Mode toggle → cloud sign-in (public alpha)', () => {
  const capturePath = process.env.DETOX_CAPTURE_PATH ?? '/tmp/04.png';

  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: false,
    });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('lands on the chat screen', async () => {
    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('ModeToggle is visible in the chat header', async () => {
    await waitFor(element(by.id('chat.mode-toggle')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('tapping the Cloud side routes to Clerk sign-in and captures the frame', async () => {
    await element(by.id('chat.mode-toggle.cloud')).tap();
    await waitFor(element(by.id('cloud-sign-in-dismiss')))
      .toBeVisible()
      .withTimeout(15000);
    const closeAttributes = (await element(by.id('cloud-sign-in-dismiss')).getAttributes()) as {
      frame: { x: number; y: number; width: number; height: number };
    };
    if (closeAttributes.frame.y >= 140 || closeAttributes.frame.x <= 300) {
      throw new Error(
        `Cloud sign-in close control is outside the expected top-right region: ${JSON.stringify(closeAttributes.frame)}`,
      );
    }
    await device.takeScreenshot('04-cloud-sign-in');
    console.log(`Captured to ${capturePath}`);
  });

  it('dismisses Cloud sign-in and returns to the Local chat', async () => {
    await waitFor(element(by.id('cloud-sign-in-dismiss')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('cloud-sign-in-dismiss')).tap();
    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
