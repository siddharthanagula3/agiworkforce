import { device, element, by, waitFor } from 'detox';

describe('Voice record and send, on-device STT', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: false,
      permissions: {
        microphone: 'YES',
        speech: 'YES',
      },
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

  it('mic button is visible in the composer', async () => {
    await waitFor(element(by.id('chat.composer.mic')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('long-pressing the mic button opens inline voice', async () => {
    await element(by.id('chat.composer.mic')).longPress(700);
    await waitFor(element(by.id('voice-inline-bar')))
      .toBeVisible()
      .withTimeout(8000);
  });

  it('the orb is visible', async () => {
    await waitFor(element(by.id('voice-orb')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('the mic reports itself as live', async () => {
    await waitFor(element(by.label('Mute microphone')))
      .toBeVisible()
      .withTimeout(6000);
  });

  it('muting is visible on the button, not just in the handler', async () => {
    await element(by.label('Mute microphone')).tap();
    await waitFor(element(by.label('Unmute microphone')))
      .toBeVisible()
      .withTimeout(4000);
    await device.takeScreenshot('06-voice-muted');
  });

  it('exiting dismisses inline voice', async () => {
    await element(by.label('Exit voice mode')).tap();
    await waitFor(element(by.id('voice-inline-bar')))
      .not.toBeVisible()
      .withTimeout(6000);
  });

  it('chat screen composer is visible again after closing voice mode', async () => {
    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(6000);
    await device.takeScreenshot('06-voice-recording');
  });
});
