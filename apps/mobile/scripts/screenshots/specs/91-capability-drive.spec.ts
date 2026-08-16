import { by, device, element, expect as detoxExpect, waitFor } from 'detox';

const LAUNCH_TIMEOUT = 60_000;
const SHEET_TIMEOUT = 10_000;

describe('Mobile capability drive', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: false,
      launchArgs: { detoxEnableSynchronization: '0' },
    });
    await device.disableSynchronization();
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('opens the [+] sheet from the composer', async () => {
    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(LAUNCH_TIMEOUT);

    await element(by.id('chat.composer.plus')).tap();

    await waitFor(element(by.id('add-to-chat-sheet')))
      .toBeVisible()
      .withTimeout(SHEET_TIMEOUT);
  });

  it('exposes image and video modes inside the sheet', async () => {
    await detoxExpect(element(by.id('add-to-chat-sheet'))).toBeVisible();
    await detoxExpect(element(by.text('Image'))).toBeVisible();
    await detoxExpect(element(by.text('Video'))).toBeVisible();
  });

  it('sends a web-search prompt and renders inline tool activity', async () => {
    await element(by.id('add-to-chat-close')).tap();
    await element(by.id('chat.composer.input')).tap();
    await element(by.id('chat.composer.input')).typeText(
      'Search the web for the latest Gemini model release and cite sources',
    );
    await element(by.id('chat.composer.input')).tapReturnKey();

    await waitFor(element(by.id('chat.tool-timeline')))
      .toBeVisible()
      .withTimeout(90_000);
  });
});
