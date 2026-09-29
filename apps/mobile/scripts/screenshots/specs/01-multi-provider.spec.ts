/* eslint-disable no-console -- Detox spec progress log goes to test runner stdout */

import { device, element, by, waitFor } from 'detox';
describe('Screenshot 01, local demo chat', () => {
  const capturePath = process.env.DETOX_CAPTURE_PATH ?? '/tmp/01.png';

  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: false,
    });
  });

  it('produces the locked frame', async () => {
    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(10000);
    await waitFor(element(by.id('chat.mode-toggle.local')))
      .toBeVisible()
      .withTimeout(5000);

    await device.takeScreenshot('01-local-demo-chat');
    console.log(`Captured to ${capturePath}`);
  });
});
