import { DATA_HANDLING_DISCLOSURES } from '../privacy/dataHandling';
import { WELCOME_PAGE_PATH } from '../onboarding/paths';

export const ONBOARDING_COMPLETE_KEY = 'agi_onboarding_completed';
export const ONBOARDING_DISCLOSURES_KEY = 'agi_onboarding_disclosures';
export const PIN_PROMPT_DISMISSED_KEY = 'agi_pin_prompt_dismissed';

export { WELCOME_PAGE_PATH };

export type OnboardingPromptKind = 'review' | 'pin';

export function disclosureVersion(
  disclosures: ReadonlyArray<{
    id: string;
    label: string;
    body: string;
  }> = DATA_HANDLING_DISCLOSURES,
): string {
  let hash = 5381;
  for (const char of JSON.stringify(disclosures)) {
    hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function readLocal(defaults: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(defaults, (items) => {
        if (chrome.runtime.lastError) {
          resolve(defaults);
          return;
        }
        resolve(items);
      });
    } catch {
      resolve(defaults);
    }
  });
}

export function isOnboardingComplete(): Promise<boolean> {
  return readLocal({ [ONBOARDING_COMPLETE_KEY]: false }).then(
    (items) => items[ONBOARDING_COMPLETE_KEY] === true,
  );
}

export async function isOnboardingCurrent(version: string = disclosureVersion()): Promise<boolean> {
  const items = await readLocal({
    [ONBOARDING_COMPLETE_KEY]: false,
    [ONBOARDING_DISCLOSURES_KEY]: null,
  });
  return items[ONBOARDING_COMPLETE_KEY] === true && items[ONBOARDING_DISCLOSURES_KEY] === version;
}

export function markOnboardingComplete(version: string = disclosureVersion()): void {
  try {
    chrome.storage.local
      .set({ [ONBOARDING_COMPLETE_KEY]: true, [ONBOARDING_DISCLOSURES_KEY]: version })
      .catch(() => {});
  } catch {
    // chrome.storage unavailable (jsdom / test environment)
  }
}

export function dismissPinPrompt(): void {
  try {
    chrome.storage.local.set({ [PIN_PROMPT_DISMISSED_KEY]: true }).catch(() => {});
  } catch {
    // chrome.storage unavailable (jsdom / test environment)
  }
}

export async function isPinnedToToolbar(): Promise<boolean | null> {
  try {
    const settings = await chrome.action.getUserSettings();
    return settings.isOnToolbar;
  } catch {
    return null;
  }
}

export async function onboardingPromptKind(
  version: string = disclosureVersion(),
): Promise<OnboardingPromptKind | null> {
  if (!(await isOnboardingCurrent(version))) return 'review';
  const dismissed = (await readLocal({ [PIN_PROMPT_DISMISSED_KEY]: false }))[
    PIN_PROMPT_DISMISSED_KEY
  ];
  if (dismissed === true) return null;
  return (await isPinnedToToolbar()) === false ? 'pin' : null;
}
