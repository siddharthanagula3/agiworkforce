/**
 * Composer draft persistence.
 *
 * Stores the user's unsent composer text per conversation so it survives the
 * screen unmounting, an app backgrounding, or a cold start — matching Claude /
 * ChatGPT, where a half-typed message is never silently lost.
 *
 * Drafts are local-only UI state written to encrypted MMKV on-device; they never
 * leave the device and are independent of Local/Cloud mode.
 */
import { mmkvStorage } from '@/lib/mmkv';

const PREFIX = 'composer-draft:';

/** Read the saved draft for a conversation key, or '' if none. */
export function getDraft(key: string | undefined): string {
  if (!key) return '';
  try {
    return (mmkvStorage.getItem(PREFIX + key) as string | null) ?? '';
  } catch {
    return '';
  }
}

/** Persist (or clear, when empty) the draft for a conversation key. */
export function setDraft(key: string | undefined, text: string): void {
  if (!key) return;
  try {
    if (text.trim().length === 0) {
      mmkvStorage.removeItem(PREFIX + key);
    } else {
      mmkvStorage.setItem(PREFIX + key, text);
    }
  } catch {
    // Persisting a draft must never throw into the render path.
  }
}

/** Remove the saved draft for a conversation key (e.g. after a successful send). */
export function clearDraft(key: string | undefined): void {
  if (!key) return;
  try {
    mmkvStorage.removeItem(PREFIX + key);
  } catch {
    // non-fatal
  }
}
