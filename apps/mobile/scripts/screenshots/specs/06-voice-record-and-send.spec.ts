/**
 * E2E spec — 06: voice-record-and-send
 *
 * Critical path:
 *   Long-press mic in chat composer → the inline voice bar appears
 *   The orb is visible (voice-orb) with the thread still behind it
 *   Mute reports itself on the button, unmistakably
 *   Tap the white X → voice dismissed, composer visible again
 *
 * Rewritten for PAR-M01: the full-screen VoiceConversationScreen this spec used
 * to drive was deleted. Voice is now one presentation — an inline bar over the
 * live thread — and it is hands-free, so capture starts with the bar rather
 * than on an orb tap. Phase labels are no longer rendered on screen; the bar
 * signals state through the orb and the mic button.
 *
 * Precondition: onboarding is complete (including the voice recording
 * disclosure) and microphone permission is granted on the simulator. This spec
 * does not seed transcripts through launch arguments.
 *
 * NOTE: Detox must be installed before running.
 *   pnpm add -D detox@20
 */

import { device, element, by, waitFor } from 'detox';

describe('Voice record and send — on-device STT', () => {
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
    // The label names the action the current state affords, so "Mute" showing
    // means the microphone is open.
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
