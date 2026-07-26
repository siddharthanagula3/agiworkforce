/**
 * Composer draft persistence.
 *
 * Stores the user's unsent composer text per conversation so it survives the
 * screen unmounting, an app backgrounding, or a cold start — matching Claude /
 * ChatGPT, where a half-typed message is never silently lost.
 *
 * Drafts never leave encrypted on-device storage, but their content still
 * inherits the conversation trust boundary. Local drafts survive Cloud
 * sign-out; Cloud drafts are bound to the Clerk account that created them.
 */
import { mmkvStorage, storage } from '@/lib/mmkv';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';

const PREFIX = 'composer-draft:';
const DRAFT_RECORD_VERSION = 1;

export type DraftProvenance = { scope: 'local' } | { scope: 'cloud'; ownerId: string };

interface StoredDraftRecord {
  version: typeof DRAFT_RECORD_VERSION;
  text: string;
  provenance: DraftProvenance;
}

function normalizedOwnerId(ownerId: unknown): string | null {
  return typeof ownerId === 'string' && ownerId.trim().length > 0 ? ownerId.trim() : null;
}

function normalizedProvenance(value: unknown): DraftProvenance | null {
  if (!value || typeof value !== 'object') return null;
  const provenance = value as Record<string, unknown>;
  if (provenance.scope === 'local') return { scope: 'local' };
  const ownerId = normalizedOwnerId(provenance.ownerId);
  return provenance.scope === 'cloud' && ownerId ? { scope: 'cloud', ownerId } : null;
}

function hasSameProvenance(left: DraftProvenance, right: DraftProvenance): boolean {
  if (left.scope !== right.scope) return false;
  if (left.scope === 'local') return true;
  return left.ownerId === (right as { scope: 'cloud'; ownerId: string }).ownerId;
}

function scopedStorageKey(key: string, provenance: DraftProvenance): string {
  const scopeKey =
    provenance.scope === 'local' ? 'local' : `cloud:${encodeURIComponent(provenance.ownerId)}`;
  return `${PREFIX}v${DRAFT_RECORD_VERSION}:${scopeKey}:${encodeURIComponent(key)}`;
}

function parseStoredDraft(raw: string): StoredDraftRecord | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const provenance = normalizedProvenance(record.provenance);
    if (record.version !== DRAFT_RECORD_VERSION || typeof record.text !== 'string' || !provenance) {
      return null;
    }
    return { version: DRAFT_RECORD_VERSION, text: record.text, provenance };
  } catch {
    // Raw strings are legacy unowned drafts and must not cross accounts.
    return null;
  }
}

function provenanceIsReadable(provenance: DraftProvenance): boolean {
  if (provenance.scope === 'local') return true;
  return captureCloudAccountEpoch()?.ownerId === provenance.ownerId;
}

/** Read the saved draft for one explicit trust-boundary key, or '' if none. */
export function getDraft(key: string | undefined, provenance?: DraftProvenance): string {
  if (!key) return '';
  try {
    const safeProvenance = normalizedProvenance(provenance);
    if (!safeProvenance || !provenanceIsReadable(safeProvenance)) {
      // Raw pre-provenance records are ambiguous and cannot be adopted.
      mmkvStorage.removeItem(PREFIX + key);
      return '';
    }
    const storageKey = scopedStorageKey(key, safeProvenance);
    const raw = mmkvStorage.getItem(storageKey) as string | null;
    if (!raw) return '';
    const record = parseStoredDraft(raw);
    if (!record || !hasSameProvenance(record.provenance, safeProvenance)) {
      // One-time fail-closed migration for raw or malformed legacy drafts.
      mmkvStorage.removeItem(storageKey);
      return '';
    }
    return record.text;
  } catch {
    return '';
  }
}

/** Persist (or clear, when empty) the draft for a conversation key. */
export function setDraft(
  key: string | undefined,
  text: string,
  provenance?: DraftProvenance,
): void {
  if (!key) return;
  try {
    const safeProvenance = normalizedProvenance(provenance);
    if (!safeProvenance) {
      mmkvStorage.removeItem(PREFIX + key);
      return;
    }
    const storageKey = scopedStorageKey(key, safeProvenance);
    if (text.trim().length === 0) {
      mmkvStorage.removeItem(storageKey);
      return;
    }

    if (
      safeProvenance.scope === 'cloud' &&
      captureCloudAccountEpoch()?.ownerId !== safeProvenance.ownerId
    ) {
      // Missing or stale ownership is never adopted implicitly. Keeping the
      // previous value would also risk exposing it under the next account.
      mmkvStorage.removeItem(storageKey);
      return;
    }

    // Delete the old unscoped location on the first safe write. Its contents
    // cannot be proven Local or tied to the current Cloud owner.
    mmkvStorage.removeItem(PREFIX + key);
    const record: StoredDraftRecord = {
      version: DRAFT_RECORD_VERSION,
      text,
      provenance: safeProvenance,
    };
    mmkvStorage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Persisting a draft must never throw into the render path.
  }
}

/** Remove the saved draft for one explicit trust boundary after a successful send. */
export function clearDraft(key: string | undefined, provenance?: DraftProvenance): void {
  if (!key) return;
  try {
    const safeProvenance = normalizedProvenance(provenance);
    if (safeProvenance) {
      mmkvStorage.removeItem(scopedStorageKey(key, safeProvenance));
    }
    // Always clear the ambiguous pre-provenance location too.
    mmkvStorage.removeItem(PREFIX + key);
  } catch {
    // non-fatal
  }
}

/**
 * Remove every Cloud, legacy-unowned, or malformed draft while retaining only
 * records explicitly marked Local. Must run after encrypted MMKV is ready.
 */
export function clearAccountScopedDrafts(): void {
  try {
    const keys = storage.getAllKeys?.() ?? [];
    for (const storageKey of keys) {
      if (!storageKey.startsWith(PREFIX)) continue;
      const raw = mmkvStorage.getItem(storageKey) as string | null;
      const record = raw ? parseStoredDraft(raw) : null;
      if (!record || record.provenance.scope !== 'local') {
        mmkvStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Account teardown is best-effort per store; its caller retries after
    // hydration and independently prevents Cloud data from rendering.
  }
}
