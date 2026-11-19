import { mmkvStorage, storage } from '@/lib/mmkv';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import { normalizedArtifactProvenance } from './provenance';
import type { MobileArtifactProvenance } from './types';

const PREFIX = 'artifact-draft:';
const DRAFT_RECORD_VERSION = 1;

export interface KeptArtifactDraft {
  base: string;
  content: string;
}

interface StoredArtifactDraft extends KeptArtifactDraft {
  version: typeof DRAFT_RECORD_VERSION;
  provenance: MobileArtifactProvenance;
}

function storageKey(artifactId: string, provenance: MobileArtifactProvenance): string {
  const scope =
    provenance.scope === 'local' ? 'local' : `cloud:${encodeURIComponent(provenance.ownerId)}`;
  return `${PREFIX}v${DRAFT_RECORD_VERSION}:${scope}:${encodeURIComponent(artifactId)}`;
}

function readable(provenance: MobileArtifactProvenance): boolean {
  return provenance.scope === 'local' || captureCloudAccountEpoch()?.ownerId === provenance.ownerId;
}

function parse(raw: string): StoredArtifactDraft | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || typeof value !== 'object') return null;
    const provenance = normalizedArtifactProvenance(value.provenance);
    if (
      value.version !== DRAFT_RECORD_VERSION ||
      typeof value.base !== 'string' ||
      typeof value.content !== 'string' ||
      !provenance
    ) {
      return null;
    }
    return { version: DRAFT_RECORD_VERSION, base: value.base, content: value.content, provenance };
  } catch {
    return null;
  }
}

/** Keeps an unsaved source edit on the device under its artifact's account scope. */
export function keepArtifactDraft(
  artifactId: string,
  provenance: MobileArtifactProvenance | undefined,
  draft: KeptArtifactDraft,
): void {
  const safe = normalizedArtifactProvenance(provenance);
  if (!safe || !readable(safe)) return;
  try {
    const key = storageKey(artifactId, safe);
    if (draft.content === draft.base) {
      mmkvStorage.removeItem(key);
      return;
    }
    const record: StoredArtifactDraft = {
      version: DRAFT_RECORD_VERSION,
      ...draft,
      provenance: safe,
    };
    mmkvStorage.setItem(key, JSON.stringify(record));
  } catch (error) {
    console.warn('[artifactDrafts] Draft could not be kept:', error);
  }
}

export function readArtifactDraft(
  artifactId: string,
  provenance: MobileArtifactProvenance | undefined,
): KeptArtifactDraft | null {
  const safe = normalizedArtifactProvenance(provenance);
  if (!safe || !readable(safe)) return null;
  try {
    const key = storageKey(artifactId, safe);
    const raw = mmkvStorage.getItem(key) as string | null;
    if (!raw) return null;
    const record = parse(raw);
    if (!record) {
      mmkvStorage.removeItem(key);
      return null;
    }
    return { base: record.base, content: record.content };
  } catch {
    return null;
  }
}

export function discardArtifactDraft(
  artifactId: string,
  provenance: MobileArtifactProvenance | undefined,
): void {
  const safe = normalizedArtifactProvenance(provenance);
  if (!safe) return;
  try {
    mmkvStorage.removeItem(storageKey(artifactId, safe));
  } catch {
    return;
  }
}

/** Removes every kept draft that belongs to a Cloud account or cannot be read; Local drafts stay. */
export function clearAccountScopedArtifactDrafts(): void {
  try {
    const keys = storage.getAllKeys?.() ?? [];
    for (const key of keys) {
      if (!key.startsWith(PREFIX)) continue;
      const raw = mmkvStorage.getItem(key) as string | null;
      const record = raw ? parse(raw) : null;
      if (!record || record.provenance.scope !== 'local') mmkvStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('[artifactDrafts] Account drafts could not be cleared:', error);
  }
}
