import { mmkvStorage, storage } from '@/lib/mmkv';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import type { Attachment } from './components/AttachmentPreview';

const PREFIX = 'composer-draft:';
const DRAFT_RECORD_VERSION = 1;

export type DraftProvenance = { scope: 'local' } | { scope: 'cloud'; ownerId: string };

export type DraftAttachment = Omit<Attachment, 'sendFailed' | 'unavailable'>;

interface StoredDraftRecord {
  version: typeof DRAFT_RECORD_VERSION;
  text: string;
  provenance: DraftProvenance;
  attachments?: DraftAttachment[];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function storedAttachment(value: unknown, provenance: DraftProvenance): DraftAttachment | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const { id, uri, mimeType, fileName } = item;
  if (
    typeof id !== 'string' ||
    typeof uri !== 'string' ||
    typeof mimeType !== 'string' ||
    typeof fileName !== 'string'
  ) {
    return null;
  }
  const assetId = optionalString(item.assetId);
  if (assetId !== undefined && provenance.scope !== 'cloud') return null;
  const attachment: DraftAttachment = { id, uri, mimeType, fileName };
  const width = optionalNumber(item.width);
  const height = optionalNumber(item.height);
  const fileSize = optionalNumber(item.fileSize);
  const pastedText = optionalString(item.pastedText);
  if (width !== undefined) attachment.width = width;
  if (height !== undefined) attachment.height = height;
  if (fileSize !== undefined) attachment.fileSize = fileSize;
  if (assetId !== undefined) attachment.assetId = assetId;
  if (pastedText !== undefined) attachment.pastedText = pastedText;
  return attachment;
}

function storedAttachments(value: unknown, provenance: DraftProvenance): DraftAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const attachment = storedAttachment(item, provenance);
    return attachment ? [attachment] : [];
  });
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
    const attachments = storedAttachments(record.attachments, provenance);
    return {
      version: DRAFT_RECORD_VERSION,
      text: record.text,
      provenance,
      ...(attachments.length > 0 ? { attachments } : {}),
    };
  } catch {
    return null;
  }
}

function provenanceIsReadable(provenance: DraftProvenance): boolean {
  if (provenance.scope === 'local') return true;
  return captureCloudAccountEpoch()?.ownerId === provenance.ownerId;
}

function readDraftRecord(
  key: string | undefined,
  provenance: DraftProvenance | undefined,
): StoredDraftRecord | null {
  if (!key) return null;
  try {
    const safeProvenance = normalizedProvenance(provenance);
    if (!safeProvenance || !provenanceIsReadable(safeProvenance)) {
      mmkvStorage.removeItem(PREFIX + key);
      return null;
    }
    const storageKey = scopedStorageKey(key, safeProvenance);
    const raw = mmkvStorage.getItem(storageKey) as string | null;
    if (!raw) return null;
    const record = parseStoredDraft(raw);
    if (!record || !hasSameProvenance(record.provenance, safeProvenance)) {
      mmkvStorage.removeItem(storageKey);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function getDraft(key: string | undefined, provenance?: DraftProvenance): string {
  return readDraftRecord(key, provenance)?.text ?? '';
}

export function getDraftAttachments(
  key: string | undefined,
  provenance?: DraftProvenance,
): DraftAttachment[] {
  return readDraftRecord(key, provenance)?.attachments ?? [];
}

export function setDraft(
  key: string | undefined,
  text: string,
  provenance?: DraftProvenance,
  attachments: readonly Attachment[] = [],
): void {
  if (!key) return;
  try {
    const safeProvenance = normalizedProvenance(provenance);
    if (!safeProvenance) {
      mmkvStorage.removeItem(PREFIX + key);
      return;
    }
    const storageKey = scopedStorageKey(key, safeProvenance);
    if (safeProvenance.scope === 'cloud') {
      const currentAccount = captureCloudAccountEpoch();
      if (!currentAccount) return;
      if (currentAccount.ownerId !== safeProvenance.ownerId) {
        mmkvStorage.removeItem(storageKey);
        return;
      }
    }
    const keptAttachments = storedAttachments(
      attachments.map(({ sendFailed: _sendFailed, unavailable: _unavailable, ...rest }) => rest),
      safeProvenance,
    );
    if (text.trim().length === 0 && keptAttachments.length === 0) {
      mmkvStorage.removeItem(storageKey);
      return;
    }

    mmkvStorage.removeItem(PREFIX + key);
    const record: StoredDraftRecord = {
      version: DRAFT_RECORD_VERSION,
      text,
      provenance: safeProvenance,
      ...(keptAttachments.length > 0 ? { attachments: keptAttachments } : {}),
    };
    mmkvStorage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Persisting a draft must never throw into the render path.
  }
}

export function clearDraft(key: string | undefined, provenance?: DraftProvenance): void {
  if (!key) return;
  try {
    const safeProvenance = normalizedProvenance(provenance);
    if (safeProvenance) {
      mmkvStorage.removeItem(scopedStorageKey(key, safeProvenance));
    }
    mmkvStorage.removeItem(PREFIX + key);
  } catch {
    // non-fatal
  }
}

export function clearAccountScopedDrafts(): void {
  const keys = storage.getAllKeys?.() ?? [];
  for (const storageKey of keys) {
    if (!storageKey.startsWith(PREFIX)) continue;
    const raw = mmkvStorage.getItem(storageKey) as string | null;
    const record = raw ? parseStoredDraft(raw) : null;
    if (!record || record.provenance.scope !== 'local') {
      mmkvStorage.removeItem(storageKey);
    }
  }
}
