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
      .withTimeout(4000);
  });

  it('tapping the Cloud side opens the InviteCodeModal', async () => {
    await element(by.id('chat.mode-toggle.cloud')).tap();
    await waitFor(element(by.id('invite-code-modal')))
      .toBeVisible()
      .withTimeout(6000);
  });

  it('shows the email input field', async () => {
    await waitFor(element(by.id('cloud-waitlist-email-input')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('the submit button is present for Cloud waitlist entry', async () => {
    await waitFor(element(by.id('cloud-waitlist-submit-btn')))
      .toBeVisible()
      .withTimeout(4000);
  });

  it('captures the Cloud waitlist modal without submitting', async () => {
    await device.takeScreenshot('04-cloud-waitlist');
  });
});
