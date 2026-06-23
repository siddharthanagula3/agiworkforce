/**
 * First-run onboarding carousel for the AGI extension side panel.
 *
 * Extracted into features/side-panel/ so it is unit-testable without importing
 * the top-level side_panel.ts (which has build-time side effects that prevent
 * import under vitest/jsdom).
 *
 * Storage convention mirrors the in-file agi_ever_connected pattern:
 *   - Key: agi_onboarding_completed (boolean)
 *   - Read with chrome.storage.local.get({ agi_onboarding_completed: false }, cb)
 *   - Written with chrome.storage.local.set({ agi_onboarding_completed: true })
 */

export const ONBOARDING_COMPLETE_KEY = 'agi_onboarding_completed';

/**
 * Reads the onboarding-completed flag from chrome.storage.local.
 * Resolves to true if the user has already completed onboarding.
 * Guarded for jsdom/test environments where chrome.storage is unavailable.
 */
export function isOnboardingComplete(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get({ [ONBOARDING_COMPLETE_KEY]: false }, (items) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(items[ONBOARDING_COMPLETE_KEY] === true);
      });
    } catch {
      // chrome.storage unavailable (jsdom / test environment)
      resolve(false);
    }
  });
}

/**
 * Persists the onboarding-completed flag so the carousel is not shown again.
 * Guarded for environments where chrome.storage is unavailable.
 */
export function markOnboardingComplete(): void {
  try {
    chrome.storage.local.set({ [ONBOARDING_COMPLETE_KEY]: true }).catch(() => {});
  } catch {
    // chrome.storage unavailable (jsdom / test environment)
  }
}
