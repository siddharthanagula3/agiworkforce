import type { JobApplicationProfile } from '../../../types';
import {
  CONTACT_PROFILE_FIELDS,
  parseContactAutofillProfile,
  type ContactAutofillProfile,
} from './contactProfile';

export const AUTOFILL_PROFILE_STORAGE_KEY = 'agi_autofill_profile';

export async function loadAutofillProfile(
  options: { throwOnError?: boolean } = {},
): Promise<JobApplicationProfile> {
  try {
    const result = await chrome.storage.local.get(AUTOFILL_PROFILE_STORAGE_KEY);
    const stored = result[AUTOFILL_PROFILE_STORAGE_KEY];
    if (stored && typeof stored === 'object') {
      return stored as JobApplicationProfile;
    }
  } catch (error) {
    if (options.throwOnError) throw error;
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

export async function loadContactAutofillProfile(): Promise<ContactAutofillProfile | null> {
  const profile = await loadAutofillProfile({ throwOnError: true });
  const entries = Object.keys(CONTACT_PROFILE_FIELDS).flatMap((key) => {
    const parsed = parseContactAutofillProfile({
      [key]: profile[key as keyof JobApplicationProfile],
    });
    return parsed ? Object.entries(parsed) : [];
  });
  return entries.length ? Object.fromEntries(entries) : null;
}
