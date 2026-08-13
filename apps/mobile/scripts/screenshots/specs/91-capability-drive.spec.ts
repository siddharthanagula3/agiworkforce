/**
 * Drives the real capability surfaces from the UI, the way a demo would.
 *
 * Written because manual pixel-driving found the composer's [+] doing nothing,
 * and [+] is the gate to image mode, video mode, model selection, connectors
 * and skills. A tap that silently no-ops is indistinguishable from a tap that
 * missed, so this spec asserts on the SHEET appearing rather than on the tap
 * succeeding — `element.tap()` resolves either way.
 *
 * Not a CI gate: it talks to Managed Cloud and spends real provider budget.
 * Run it deliberately.
 */
import { by, device, element, expect as detoxExpect, waitFor } from 'detox';

const LAUNCH_TIMEOUT = 60_000;
const SHEET_TIMEOUT = 10_000;

describe('Mobile capability drive', () => {
  beforeAll(async () => {
    // `delete: false` keeps the signed-in session; these flows are cloud-only
    // and re-authenticating is not what is under test here.
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

    // THE assertion that matters: the sheet must actually appear. Before the
    // testID existed there was no way to express this, which is how a dead
    // control survived.
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

    // The tool timeline is the inline tool-call UI; its presence proves the
    // server offered and ran a tool, not just that text streamed back.
    await waitFor(element(by.id('chat.tool-timeline')))
      .toBeVisible()
      .withTimeout(90_000);
  });
});
