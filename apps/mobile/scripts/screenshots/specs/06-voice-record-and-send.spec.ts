/**
 * E2E spec — 06: voice-record-and-send
 *
 * Critical path:
 *   Long-press mic in chat composer → VoiceConversationScreen appears
 *   Pulsing orb is visible (voice-conversation-orb)
 *   Tap the orb → listening phase begins
 *   Mock mic input returns a transcript after 2 s
 *   thinking → speaking phases progress
 *   Tap end-call → VoiceConversationScreen dismissed
 *   Chat screen with composer is visible again
 *
 * Mocks:
 *   - Microphone input is mocked by Detox's `device.setSimulatorPermission`.
 *   - The VoiceService.transcribe call is intercepted via the app's
 *     EXPO_PUBLIC_E2E_VOICE_TRANSCRIPT launch arg (handled in services/voice.ts
 *     when the env var is set).
 *   - TTS output is silenced by EXPO_PUBLIC_E2E_TTS_SILENT=1.
 *   - No real LLM call; the app's sendMessage stub returns immediately in
 *     v1 when SEED_ONBOARDING_DONE is set.
 *
 * NOTE: Detox must be installed before running.
 *   pnpm add -D detox@20
 */

import { device, element, by, waitFor } from 'detox';

describe('Voice record and send — on-device STT', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
      launchArgs: {
        DETOX_DISABLE_BIOMETRIC: '1',
        SEED_ONBOARDING_DONE: '1',
        // Mock STT: transcribe() returns this text instead of running inference.
        EXPO_PUBLIC_E2E_VOICE_TRANSCRIPT: 'hello world',
        // Silence TTS so the test does not wait for audio playback.
        EXPO_PUBLIC_E2E_TTS_SILENT: '1',
      },
      permissions: {
        microphone: 'YES',
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

  it('long-pressing the mic button opens VoiceConversationScreen', async () => {
    await element(by.id('chat.composer.mic')).longPress(700);
    await waitFor(element(by.id('voice-conversation-screen')))
      .toBeVisible()
      .withTimeout(8000);
  });

  it('the pulsing orb is visible', async () => {
    await waitFor(element(by.id('voice-conversation-orb')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('tapping the orb starts listening phase', async () => {
    await element(by.id('voice-conversation-orb')).tap();
    // The screen shows "Listening..." accessible label on the orb button
    await waitFor(element(by.label('Listening...')))
      .toBeVisible()
      .withTimeout(6000);
  });

  it('tapping orb again stops recording and triggers thinking', async () => {
    // Wait 1 s to simulate some recording duration.
    await new Promise<void>((r) => setTimeout(r, 1000));
    await element(by.id('voice-conversation-orb')).tap();
    await waitFor(element(by.label('Thinking...')))
      .toBeVisible()
      .withTimeout(6000);
  });

  it('speaking phase follows (mocked TTS returns immediately)', async () => {
    await waitFor(element(by.label('Speaking...')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('tapping end-call dismisses the voice conversation screen', async () => {
    await element(by.id('voice-conversation-end-call')).tap();
    await waitFor(element(by.id('voice-conversation-screen')))
      .not.toBeVisible()
      .withTimeout(6000);
  });

  it('chat screen composer is visible again after closing voice mode', async () => {
    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(6000);
  });
});
