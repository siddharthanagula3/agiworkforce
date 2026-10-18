import type { JobApplicationProfile } from '../../../types';

export const AUTOFILL_PROFILE_STORAGE_KEY = 'agi_autofill_profile';

export async function loadAutofillProfile(): Promise<JobApplicationProfile> {
  try {
    const result = await chrome.storage.local.get(AUTOFILL_PROFILE_STORAGE_KEY);
    const stored = result[AUTOFILL_PROFILE_STORAGE_KEY];
    if (stored && typeof stored === 'object') {
      return stored as JobApplicationProfile;
    }
  } catch {
    // storage.local may not be available in all contexts
  }
  return {};
}

export async function saveAutofillProfile(profile: JobApplicationProfile): Promise<void> {
  await chrome.storage.local.set({ [AUTOFILL_PROFILE_STORAGE_KEY]: profile });
}

export async function clearAutofillProfile(): Promise<void> {
  try {
    await chrome.storage.local.remove([AUTOFILL_PROFILE_STORAGE_KEY]);
  } catch {
    // storage.local may not be available in all contexts
  }
}
