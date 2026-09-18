import { describe, expect, it } from 'vitest';
import {
  createManagedFile,
  deriveManagedFile,
  isDerivedFile,
  isRevisionOf,
  latestFileVersion,
  managedFileIdentity,
  nextFileVersion,
  sortFileVersions,
  toManagedFile,
  UNTRACED_FILE_LINEAGE,
} from '../file-model';
import { createFileReference } from '../file-reference';

function upload() {
  return createManagedFile({
    id: 'upload-1',
    name: 'quarterly.xlsx',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byteCount: 2048,
    uri: '/api/files/upload-1',
    origin: 'upload',
    checksumSha256: 'a'.repeat(64),
    lineage: { uploadedByUserId: 'user_1', conversationId: 'conv-1' },
  });
}

describe('createManagedFile', () => {
  it('starts at version 1 with no parent and an untraced lineage', () => {
    const file = createManagedFile({
      id: 'f1',
      name: 'notes.md',
      mediaType: 'text/markdown',
      byteCount: 10,
      uri: '/api/files/f1',
      origin: 'generated',
    });
    expect(file.version).toBe(1);
    expect(file.parentVersionId).toBeNull();
    expect(file.lineage).toEqual(UNTRACED_FILE_LINEAGE);
    expect(isDerivedFile(file)).toBe(false);
  });

  it('clamps a nonsense version rather than storing it', () => {
    const file = createManagedFile({
      id: 'f1',
      name: 'n.md',
      mediaType: 'text/markdown',
      byteCount: 1,
      uri: '/f1',
      origin: 'upload',
      version: 0,
    });
    expect(file.version).toBe(1);
  });

  it('keeps every FileReference field so a consumer of the base type still works', () => {
    const reference = createFileReference({
      id: 'f1',
      name: 'n.md',
      mediaType: 'text/markdown',
      byteCount: 4,
      uri: '/f1',
      origin: 'upload',
    });
    const managed = toManagedFile(reference);
    for (const key of Object.keys(reference) as Array<keyof typeof reference>) {
      expect(managed[key]).toEqual(reference[key]);
    }
  });
});

describe('nextFileVersion', () => {
  it('appends a revision that names the revision it replaced', () => {
    const v1 = upload();
    const v2 = nextFileVersion(v1, {
      id: 'upload-1-v2',
      uri: '/api/files/upload-1-v2',
      byteCount: 4096,
      checksumSha256: 'b'.repeat(64),
    });

    expect(v2.version).toBe(2);
    expect(v2.parentVersionId).toBe('upload-1');
    expect(isRevisionOf(v2, v1)).toBe(true);
    expect(v2.byteCount).toBe(4096);
  });

  it('carries the lineage forward because a new version is the same file', () => {
    const v2 = nextFileVersion(upload(), { id: 'upload-1-v2', uri: '/api/files/upload-1-v2' });
    expect(v2.lineage.uploadedByUserId).toBe('user_1');
    expect(v2.lineage.derivedFromFileId).toBeNull();
  });

  it('drops a stale checksum when the caller does not supply a new one', () => {
    const v2 = nextFileVersion(upload(), { id: 'u2', uri: '/u2', byteCount: 99 });
    expect(v2.checksumSha256).toBeNull();
  });
});

describe('deriveManagedFile', () => {
  it('records the source file and starts its own version chain', () => {
    const source = upload();
    const exported = deriveManagedFile(source, {
      id: 'export-1',
      name: 'quarterly.pdf',
      mediaType: 'application/pdf',
      byteCount: 900,
      uri: '/api/files/export-1',
      origin: 'generated',
      derivation: 'export',
      lineage: { generatedByTurnId: 'turn-9' },
    });

    expect(exported.lineage.derivedFromFileId).toBe('upload-1');
    expect(exported.lineage.derivation).toBe('export');
    expect(exported.lineage.generatedByTurnId).toBe('turn-9');
    expect(exported.version).toBe(1);
    expect(exported.parentVersionId).toBeNull();
    expect(isDerivedFile(exported)).toBe(true);
  });

  it('inherits the conversation from the source when the caller does not name one', () => {
    const exported = deriveManagedFile(upload(), {
      id: 'export-1',
      name: 'q.pdf',
      mediaType: 'application/pdf',
      byteCount: 10,
      uri: '/export-1',
      origin: 'generated',
      derivation: 'conversion',
    });
    expect(exported.lineage.conversationId).toBe('conv-1');
  });
});

describe('version identity and ordering', () => {
  it('distinguishes two revisions of identical bytes', () => {
    const v1 = upload();
    const v2 = nextFileVersion(v1, { id: 'u2', uri: '/u2', checksumSha256: v1.checksumSha256 });
    expect(managedFileIdentity(v1)).not.toBe(managedFileIdentity(v2));
  });

  it('orders newest first and reports the latest', () => {
    const v1 = upload();
    const v2 = nextFileVersion(v1, { id: 'u2', uri: '/u2' });
    const v3 = nextFileVersion(v2, { id: 'u3', uri: '/u3' });
    expect(sortFileVersions([v1, v3, v2]).map((file) => file.version)).toEqual([3, 2, 1]);
    expect(latestFileVersion([v1, v3, v2])?.id).toBe('u3');
    expect(latestFileVersion([])).toBeNull();
  });
});
