import type { JobApplicationProfile } from '../../../types';

export const AUTOFILL_PROFILE_STORAGE_KEY = 'agi_autofill_profile';

const AUTOFILL_MIGRATION_DONE_KEY = 'agi_autofill_profile_migrated';

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
  try {
    await chrome.storage.sync?.remove([AUTOFILL_PROFILE_STORAGE_KEY]);
  } catch {
    // a pre-migration synced copy may already be gone
  }
}

export async function migrateAutofillProfile(): Promise<boolean> {
  try {
    const localResult = await chrome.storage.local.get([
      AUTOFILL_MIGRATION_DONE_KEY,
      AUTOFILL_PROFILE_STORAGE_KEY,
    ]);
    if (localResult[AUTOFILL_MIGRATION_DONE_KEY] === true) {
      return false;
    }

    const syncResult = await chrome.storage.sync.get(AUTOFILL_PROFILE_STORAGE_KEY);
    const syncProfile = syncResult[AUTOFILL_PROFILE_STORAGE_KEY];
    const localProfile = localResult[AUTOFILL_PROFILE_STORAGE_KEY];

    let copied = false;
    if (
      (!localProfile ||
        typeof localProfile !== 'object' ||
        Object.keys(localProfile).length === 0) &&
      syncProfile &&
      typeof syncProfile === 'object'
    ) {
      await chrome.storage.local.set({ [AUTOFILL_PROFILE_STORAGE_KEY]: syncProfile });
      copied = true;
    }

    await chrome.storage.sync.remove(AUTOFILL_PROFILE_STORAGE_KEY).catch(() => {});
    await chrome.storage.local.set({ [AUTOFILL_MIGRATION_DONE_KEY]: true });
    return copied;
  } catch {
    return false;
  }
}
