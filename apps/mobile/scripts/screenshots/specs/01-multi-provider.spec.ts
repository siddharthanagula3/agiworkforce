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
    await waitFor(element(by.id('chat-message-list')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('nav.chat.new')).tap();
    await element(by.id('chat.composer.model.badge')).tap();
    await waitFor(element(by.text('Models')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.text('AGI Standard')).tap();
    await element(by.id('chat.composer.input')).typeText(
      'Explain why a local AI workspace helps daily work.',
    );
    await element(by.id('chat.composer.send')).tap();
    await waitFor(element(by.id('chat.message.assistant.0.done')))
      .toBeVisible()
      .withTimeout(20000);

    await element(by.id('chat.list')).scrollTo('top');

    await device.takeScreenshot('01-local-demo-chat');
    console.log(`Captured to ${capturePath}`);
  });
});
