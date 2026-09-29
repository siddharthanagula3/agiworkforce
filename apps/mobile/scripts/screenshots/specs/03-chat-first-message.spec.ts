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

  it('send button becomes visible after typing', async () => {
    await waitFor(element(by.label('Send message')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('tapping send shows the streaming assistant bubble', async () => {
    await element(by.label('Send message')).tap();
    await waitFor(element(by.id('chat.message.assistant.streaming')))
      .toBeVisible()
      .withTimeout(8000);
  });

  it('streaming completes and the assistant answer is actionable', async () => {
    await waitFor(element(by.id('chat.message.assistant.streaming')))
      .not.toExist()
      .withTimeout(60000);
    await waitFor(element(by.label('Copy')))
      .toBeVisible()
      .withTimeout(10000);
    await device.takeScreenshot('03-first-message');
  });
});
