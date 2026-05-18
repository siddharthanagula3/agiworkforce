/**
 * E2E spec — 05: image-with-question
 *
 * Critical path:
 *   From chat, tap the Image chip (navigates to /(app)/image)
 *   Image picker chooser appears
 *   Tap "Photo Library" (image-picker-library-btn)
 *   Photo picker mock returns a fixture image (fixture is pre-seeded in
 *     simulator Photos app via device.sendUserNotification / setSimulatorPermission)
 *   Select the first image
 *   ImageWithQuestion screen appears with default question "What is in this image?"
 *   Type "what is this?" into the input (replaces default)
 *   Tap send (image-with-question-send-btn)
 *   On-device vision response renders (image-with-question-answer)
 *   PerformanceChip appears with model + tier
 *
 * Mocks:
 *   - expo-image-picker is NOT mocked at the Detox layer (the real system
 *     photo picker is used). We pre-load a fixture JPEG into the simulator's
 *     Photos library using `xcrun simctl addmedia` before the test run.
 *   - The vision model (runVisionQuery) is the real on-device stub that ships
 *     with the app. No network call is made.
 *
 * NOTE: Detox must be installed before running.
 *   pnpm add -D detox@20
 *
 * Pre-condition (CI setup):
 *   xcrun simctl addmedia <udid> scripts/screenshots/fixtures/sample.jpg
 */

import { device, element, by, waitFor } from 'detox';

describe('Image with question — on-device vision', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
      launchArgs: {
        DETOX_DISABLE_BIOMETRIC: '1',
        SEED_ONBOARDING_DONE: '1',
        // Grant photo library permission without a system prompt.
        EXPO_PUBLIC_E2E_PHOTO_GRANTED: '1',
      },
      permissions: {
        // Detox permission overrides for iOS simulator
        photos: 'YES',
      },
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

  it('tapping the Image task chip navigates to the image picker screen', async () => {
    // TaskChips renders an "Image" chip that calls router.push('/(app)/image').
    // The chip is identified by its accessible label.
    await element(by.label('Image')).tap();
    await waitFor(element(by.id('image-picker-library-btn')))
      .toBeVisible()
      .withTimeout(8000);
  });

  it('tapping Photo Library opens the system picker', async () => {
    await element(by.id('image-picker-library-btn')).tap();
    // On iOS the system photo picker is a native sheet — Detox can interact
    // with it via native element matchers.
    // We wait for the picker to appear by checking for the "All Photos" label
    // which the iOS system picker always shows.
    await waitFor(element(by.label('All Photos')))
      .toBeVisible()
      .withTimeout(8000);
  });

  it('selects the first photo from the library', async () => {
    // Tap the first image cell in the photo grid.
    // On iOS 16+ the system picker uses an accessibility element for each asset.
    try {
      await element(by.label('Photo, August 1')).tap();
    } catch {
      // Fallback: label differs on the CI simulator — tap the first grid cell.
      await element(by.label('Photo')).atIndex(0).tap();
    }
    // After selection the ImageWithQuestion screen should appear.
    await waitFor(element(by.id('image-with-question-input')))
      .toBeVisible()
      .withTimeout(8000);
  });

  it('clears the default question and types "what is this?"', async () => {
    await element(by.id('image-with-question-input')).clearText();
    await element(by.id('image-with-question-input')).typeText('what is this?');
  });

  it('tapping send triggers on-device vision inference', async () => {
    await element(by.id('image-with-question-send-btn')).tap();
  });

  it('vision response renders in the answer area', async () => {
    // On-device vision inference may take up to 30 s on Tier-3 devices.
    await waitFor(element(by.id('image-with-question-answer')))
      .toBeVisible()
      .withTimeout(60000);
  });

  it('PerformanceChip appears after inference completes', async () => {
    await waitFor(element(by.id('performance-chip')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
