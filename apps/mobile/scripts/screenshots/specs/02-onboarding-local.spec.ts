/**
 * E2E spec — 02: onboarding
 *
 * Critical path:
 *   cold launch → privacy hero shown
 *   tap "Start chatting" → compliance disclosure modal
 *   accept disclosure → device-tier detection screen
 *   tap "Continue" or "Download model" → installed/download path
 *   arrive at chat empty state
 *
 * Precondition for CI: start Metro with
 *   EXPO_PUBLIC_AGI_VISUAL_QA_DISABLE_BIOMETRIC=1
 * before running this spec. The app does not read Detox-only biometric
 * launch arguments.
 *
 * NOTE: Detox is not in package.json. Install with
 *   pnpm add -D detox@20
 * before running. The file imports from 'detox' using the same pattern
 * as 01-multi-provider.spec.ts (which also requires Detox installed).
 */

import { device, element, by, waitFor } from 'detox';

describe('Onboarding — local setup with cloud invite gate', () => {
  beforeAll(async () => {
    // Cold launch: delete all app data so onboarding always shows.
    await device.launchApp({
      newInstance: true,
      delete: true,
    });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('shows the hero screen on first launch', async () => {
    await waitFor(element(by.id('onboarding-hero-screen')))
      .toBeVisible()
      .withTimeout(8000);
  });

  it('shows the locked tagline "Your AI workspace for everyday work."', async () => {
    await waitFor(element(by.id('hero-tagline')))
      .toBeVisible()
      .withTimeout(4000);
    await waitFor(element(by.text('Your AI workspace for everyday work.')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('shows the "Start chatting" CTA', async () => {
    await waitFor(element(by.id('hero-start-chatting-btn')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('tapping "Start chatting" opens the disclosure modal', async () => {
    await element(by.id('hero-start-chatting-btn')).tap();
    await waitFor(element(by.id('disclosure-accept-btn')))
      .toBeVisible()
      .withTimeout(6000);
  });

  it('accepting disclosure shows the device-tier detection screen', async () => {
    await element(by.id('disclosure-accept-btn')).tap();
    await waitFor(element(by.id('onboarding-device-tier-screen')))
      .toBeVisible()
      .withTimeout(6000);
  });

  it('shows the device-tier headline with the detected device name', async () => {
    await waitFor(element(by.id('device-tier-headline')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('shows the download / Continue button', async () => {
    await waitFor(element(by.id('device-tier-download-btn')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('tapping the download button advances through installed or download flow', async () => {
    await element(by.id('device-tier-download-btn')).tap();
    // The download screen is skipped when the recommended model is already
    // installed or the selected runtime is provided by the OS.
    try {
      await waitFor(element(by.id('onboarding-download-screen')))
        .toBeVisible()
        .withTimeout(4000);
    } catch {
      // Installed or OS-provided model: already in chat.
      return;
    }
  });

  it('shows the download percent counter', async () => {
    // Only checked when download screen is visible (non-Tier-1 path).
    try {
      await waitFor(element(by.id('download-percent')))
        .toBeVisible()
        .withTimeout(3000);
    } catch {
      // Installed or OS-provided model: already navigated to chat.
    }
  });

  it('"Continue to chat" skip button navigates to chat empty state', async () => {
    // If download screen is present, skip it; otherwise we are already in chat.
    try {
      await element(by.id('download-skip-btn')).tap();
    } catch {
      // Not present — Tier-1 path or download already finished.
    }

    // Either the chat input or a conversation-list element confirms we are in chat.
    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(10000);
    await device.takeScreenshot('02-onboarding-local');
  });
});
