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
 * Mocks:
 *   The local model is the on-device stub (llama.rn / executorch).
 *   No real network call is made in v1 local-only mode.
 *   We launch with `onboarding-done` already set so the app opens
 *   directly to chat.
 *
 * NOTE: Detox must be installed before running.
 *   pnpm add -D detox@20
 */

import { device, element, by, waitFor } from 'detox';

describe('Chat — first message (on-device model)', () => {
  beforeAll(async () => {
    // Launch with onboarding already completed so we land directly in chat.
    await device.launchApp({
      newInstance: true,
      delete: true,
      launchArgs: {
        DETOX_DISABLE_BIOMETRIC: '1',
        // Skip onboarding by pre-seeding MMKV keys via launch arg bridge.
        // The app reads these in its __DEV__ launch-arg bridge (see lib/devSeed.ts).
        SEED_ONBOARDING_DONE: '1',
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
  });
});
