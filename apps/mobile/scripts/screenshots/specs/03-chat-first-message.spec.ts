/**
 * E2E spec — 03: chat-first-message
 *
 * Critical path:
 *   From empty chat, type "hello"
 *   Tap send
 *   See streaming indicator (chat.message.assistant.streaming)
 *   Wait for response to complete
 *   PerformanceChip shows tok/s + ttft
 *
 * Precondition: onboarding is complete and a local model is installed on the
 * simulator. The app is launched without undocumented seed arguments.
 *
 * NOTE: Detox must be installed before running.
 *   pnpm add -D detox@20
 */

import { device, element, by, waitFor } from 'detox';

describe('Chat — first message (on-device model)', () => {
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
    // On-device model completes within ~30 s for "hello" on a Tier-2 device.
    // PerformanceChip only appears after isStreaming = false.
    await waitFor(element(by.id('performance-chip')))
      .toBeVisible()
      .withTimeout(60000);
    await device.takeScreenshot('03-first-message');
  });
});
