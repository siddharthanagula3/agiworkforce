import { device, element, by, waitFor } from 'detox';

describe('Chat, first message (on-device model)', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: false,
    });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('lands on the chat screen with composer visible', async () => {
    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('types "hello" into the composer', async () => {
    await element(by.id('chat.composer.input')).typeText('hello');
  });

  it('send button becomes enabled after typing', async () => {
    await waitFor(element(by.id('chat.composer.send')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('tapping send shows the streaming assistant bubble', async () => {
    await element(by.id('chat.composer.send')).tap();
    await waitFor(element(by.id('chat.message.assistant.streaming')))
      .toBeVisible()
      .withTimeout(8000);
  });

  it('streaming completes and PerformanceChip appears', async () => {
    await waitFor(element(by.id('performance-chip')))
      .toBeVisible()
      .withTimeout(60000);
    await device.takeScreenshot('03-first-message');
  });
});
