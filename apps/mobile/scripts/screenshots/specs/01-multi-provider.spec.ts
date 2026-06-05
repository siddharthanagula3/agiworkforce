/* eslint-disable no-console -- Detox spec progress log goes to test runner stdout */
/**
 * Detox spec — screenshot 01: local demo chat.
 *
 * Drives the app to a local chat state and captures the frame as the
 * raw PNG.
 *
 * Precondition: onboarding is complete and a local model is installed on the
 * simulator. The spec does not seed app state through launch arguments.
 */

import { device, element, by, waitFor } from 'detox';
describe('Screenshot 01 — local demo chat', () => {
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

    // Scroll to show the answer, composer, and model badge.
    await element(by.id('chat.list')).scrollTo('top');

    await device.takeScreenshot('01-local-demo-chat');
    // Detox writes to its own artifact dir; the pipeline copies to DETOX_CAPTURE_PATH
    console.log(`Captured to ${capturePath}`);
  });
});
