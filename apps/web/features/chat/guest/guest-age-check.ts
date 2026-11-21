import { adultEligibilityIsCurrent } from '@agiworkforce/types';

export const GUEST_AGE_CHECK_STORAGE_KEY = 'agi.guest-age-checked-minimum';

export function readStoredAgeCheck(): number | null {
  try {
    const raw = window.localStorage.getItem(GUEST_AGE_CHECK_STORAGE_KEY);
    if (raw === null) return null;
    const minimumAge = Number(raw);
    return adultEligibilityIsCurrent({ minimumAge }) ? minimumAge : null;
  } catch {
    return null;
  }
}

export function storeAgeCheck(minimumAge: number): void {
  try {
    window.localStorage.setItem(GUEST_AGE_CHECK_STORAGE_KEY, String(minimumAge));
  } catch {
    return;
  }
}

export function clearStoredAgeCheck(): void {
  try {
    window.localStorage.removeItem(GUEST_AGE_CHECK_STORAGE_KEY);
  } catch {
    return;
  }
}
