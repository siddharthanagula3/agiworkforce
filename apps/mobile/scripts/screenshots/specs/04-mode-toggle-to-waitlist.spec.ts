/**
 * E2E spec — 04: mode-toggle-to-waitlist
 *
 * Critical path:
 *   Tap the Cloud half of ModeToggle
 *   InviteCodeModal appears (invite-code-modal), defaultTab=waitlist
 *   Email field and submit control are visible
 *   Capture the gated Cloud waitlist frame
 *
 * Precondition: onboarding is complete and a local model is installed on the
 * simulator. This visual spec does not submit the waitlist form.
 *
 * NOTE: Detox must be installed before running.
 *   pnpm add -D detox@20
 */

import { device, element, by, waitFor } from 'detox';

describe('Mode toggle → cloud InviteCodeModal', () => {
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

  // NOTE (2026-07-04): the invite-code/waitlist gate this spec was written
  // against no longer exists. Managed Cloud went to public alpha on
  // 2026-06-27 (founder decision, PA-2) — tapping the Cloud side of
  // ModeToggle now routes a signed-out user straight to Clerk sign-in
  // (`/(auth)/login`), not an invite-code-modal/waitlist sheet. See
  // handleTapCloudMode in app/(app)/(tabs)/chat.tsx. This spec (and the
  // "Cloud is invite-gated" screenshot copy in scripts/screenshots/pipeline.ts
  // and the waitlist description in store-listing/screenshots/specs/README.md)
  // needs a product-confirmed rewrite for the current sign-in-gated flow
  // before it can capture a real store screenshot. Left failing intentionally
  // rather than papering over it with a fake assertion.
  it('tapping the Cloud side routes to Clerk sign-in (current public-alpha flow)', async () => {
    await element(by.id('chat.mode-toggle.cloud')).tap();
    await waitFor(element(by.id('invite-code-modal')))
      .toBeVisible()
      .withTimeout(6000);
  });
});
