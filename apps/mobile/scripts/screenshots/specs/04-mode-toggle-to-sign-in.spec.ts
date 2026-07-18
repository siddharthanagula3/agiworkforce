/**
 * E2E spec — 04: mode-toggle-to-sign-in
 *
 * Critical path:
 *   Tap the Cloud half of ModeToggle while signed out
 *   Router pushes /(auth)/login (Clerk AuthView), not an invite/waitlist modal
 *   Capture the Cloud sign-in frame
 *
 * Precondition: onboarding is complete, a local model is installed on the
 * simulator, and no Clerk session is active. This visual spec does not
 * submit the sign-in form.
 *
 * Managed Cloud went to public alpha on 2026-06-27 (founder decision, PA-2):
 * there is no invite-code/waitlist gate anymore. Tapping the Cloud side of
 * ModeToggle routes a signed-out user straight to Clerk sign-in — see
 * handleTapCloudMode in app/(app)/(tabs)/chat.tsx.
 *
 * NOTE: Detox must be installed before running.
 *   pnpm add -D detox@20
 */

import { device, element, by, waitFor } from 'detox';

describe('Mode toggle → cloud sign-in (public alpha)', () => {
  const capturePath = process.env.DETOX_CAPTURE_PATH ?? '/tmp/04.png';

  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: false,
    });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('lands on the chat screen', async () => {
    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('ModeToggle is visible in the chat header', async () => {
    await waitFor(element(by.id('chat.mode-toggle')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('tapping the Cloud side routes to Clerk sign-in and captures the frame', async () => {
    await element(by.id('chat.mode-toggle.cloud')).tap();
    // Clerk's native AuthView covers its React wrapper, so the app-owned close
    // control is the reliable visible marker that Cloud sign-in is open.
    await waitFor(element(by.id('cloud-sign-in-dismiss')))
      .toBeVisible()
      .withTimeout(15000);
    const closeAttributes = (await element(by.id('cloud-sign-in-dismiss')).getAttributes()) as {
      frame: { x: number; y: number; width: number; height: number };
    };
    if (closeAttributes.frame.y >= 120 || closeAttributes.frame.x <= 300) {
      throw new Error(
        `Cloud sign-in close control is outside the expected top-right region: ${JSON.stringify(closeAttributes.frame)}`,
      );
    }

    await device.takeScreenshot('04-cloud-sign-in');
    // Detox writes to its own artifact dir; the pipeline copies to DETOX_CAPTURE_PATH
    console.log(`Captured to ${capturePath}`);
  });

  it('dismisses Cloud sign-in and returns to the Local chat', async () => {
    await waitFor(element(by.id('cloud-sign-in-dismiss')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('cloud-sign-in-dismiss')).tap();
    await waitFor(element(by.id('chat.composer.input')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
