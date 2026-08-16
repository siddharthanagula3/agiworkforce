
export const ONBOARDING_COMPLETE_KEY = 'agi_onboarding_completed';

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
      resolve(false);
    }
  });
}

export function markOnboardingComplete(): void {
  try {
    chrome.storage.local.set({ [ONBOARDING_COMPLETE_KEY]: true }).catch(() => {});
  } catch {
    // chrome.storage unavailable (jsdom / test environment)
  }
}
