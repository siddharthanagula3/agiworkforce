import { describe, expect, it } from 'vitest';

import {
  canReadFileReference,
  createFileReference,
  documentClassFor,
  DOCUMENT_CLASSES,
  fileIdentityDefect,
  fileMediaTypeForName,
  InvalidFileIdentityError,
  isOwnedFileReference,
  localDeviceFileId,
  localDeviceManagedFile,
  MANAGED_FILE_ROLES,
  createManagedFile,
  deriveManagedFile,
  nextFileVersion,
  type FileReference,
  type ManagedFile,
} from '../index';

function reference(overrides: Partial<Parameters<typeof createFileReference>[0]> = {}) {
  return createFileReference({
    id: 'file-1',
    name: 'quarter.csv',
    mediaType: 'text/csv',
    byteCount: 2048,
    uri: '/api/files/file-1',
    origin: 'upload',
    ...overrides,
  });
}

describe('every fact a file reference has to carry', () => {
  it('answers each declared role with a field that is present', () => {
    const managed: ManagedFile = createManagedFile({
      id: 'file-1',
      name: 'quarter.csv',
      mediaType: 'text/csv',
      byteCount: 2048,
      uri: '/api/files/file-1',
      origin: 'upload',
    });
    const missing = Object.entries(MANAGED_FILE_ROLES).filter(
      ([, field]) => !(field in managed) || managed[field] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('names a distinct field for every role, so no field answers two questions', () => {
    const fields = Object.values(MANAGED_FILE_ROLES);
    expect(new Set(fields).size).toBe(fields.length);
  });
});

describe('identity is minted, never borrowed from an address', () => {
  it('refuses an id that is a url, an app path or the uri itself', () => {
    expect(() => reference({ id: 'https://cdn.example.test/o/file-1' })).toThrow(
      InvalidFileIdentityError,
    );
    expect(() => reference({ id: '/api/files/file-1' })).toThrow(InvalidFileIdentityError);
    expect(() => reference({ id: '/api/files/file-1', uri: '/api/files/file-1' })).toThrow(
      InvalidFileIdentityError,
    );
  });

  it('refuses an id carrying the parameters that grant access to the bytes', () => {
    expect(fileIdentityDefect('file-1?expires=99', '/api/files/file-1')).not.toBeNull();
    expect(fileIdentityDefect('file-1-signature-abc', '/api/files/file-1')).not.toBeNull();
    expect(fileIdentityDefect('file-1', '/api/files/file-1')).toBeNull();
  });

  it('gives bytes on a device a catalogued id that survives a move', () => {
    const before = localDeviceManagedFile({
      path: '/Users/q/Documents/report.pdf',
      name: 'report.pdf',
      deviceId: 'laptop',
    });
    expect(before.id).not.toBe(before.uri);
    expect(before.uri).toBe('/Users/q/Documents/report.pdf');
    expect(localDeviceFileId('/Users/q/Documents/report.pdf', 'laptop')).toBe(before.id);
    expect(localDeviceFileId('/Users/q/Documents/report.pdf', 'desktop')).not.toBe(before.id);
  });
});

describe('a file reference resolves for exactly one tenant', () => {
  it('resolves for nobody when it names no owner', () => {
    const orphan = reference();
    expect(isOwnedFileReference(orphan)).toBe(false);
    expect(canReadFileReference(orphan, { userId: 'user-1' })).toBe(false);
    expect(canReadFileReference(orphan, { workspaceId: 'ws-1' })).toBe(false);
  });

  it('resolves only for the workspace that owns it', () => {
    const owned = reference({ owner: { workspaceId: 'ws-1' } });
    expect(canReadFileReference(owned, { workspaceId: 'ws-1' })).toBe(true);
    expect(canReadFileReference(owned, { workspaceId: 'ws-2' })).toBe(false);
    expect(canReadFileReference(owned, { userId: 'user-1' })).toBe(false);
  });

  it('keeps an export inside the tenant of the file it came from', () => {
    const source = createManagedFile({
      id: 'file-1',
      name: 'quarter.csv',
      mediaType: 'text/csv',
      byteCount: 2048,
      uri: '/api/files/file-1',
      origin: 'upload',
      owner: { workspaceId: 'ws-1' },
    });
    const exported = deriveManagedFile(source, {
      id: 'file-2',
      name: 'quarter.xlsx',
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      byteCount: 4096,
      uri: '/api/files/file-2',
      origin: 'generated',
      derivation: 'export',
    });
    expect(exported.owner).toEqual(source.owner);
    expect(canReadFileReference(exported, { workspaceId: 'ws-2' })).toBe(false);
  });
});

describe('a new revision is not the old revision', () => {
  it('stops claiming the previous bytes were parsed and indexed', () => {
    const current: ManagedFile = {
      ...(createManagedFile({
        id: 'file-1',
        name: 'quarter.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        uri: '/api/files/file-1',
        origin: 'upload',
      }) satisfies FileReference as ManagedFile),
      parseStatus: 'parsed',
      indexStatus: 'indexed',
    };
    const next = nextFileVersion(current, { id: 'file-2', uri: '/api/files/file-2' });
    expect(next.parseStatus).toBe('pending');
    expect(next.indexStatus).toBe('not_indexed');
    expect(next.version).toBe(2);
    expect(next.parentVersionId).toBe('file-1');
  });

  it('leaves bytes nothing ever parses alone', () => {
    const image = createManagedFile({
      id: 'file-1',
      name: 'chart.png',
      mediaType: 'image/png',
      byteCount: 64,
      uri: '/api/files/file-1',
      origin: 'generated',
    });
    expect(nextFileVersion(image, { id: 'file-2', uri: '/u' }).parseStatus).toBe('not_applicable');
  });
});

describe('the declared document classes', () => {
  it('claims a media type for exactly one class', () => {
    const seen = new Map<string, string>();
    for (const documentClass of DOCUMENT_CLASSES) {
      for (const mediaType of documentClass.mediaTypes) {
        expect(seen.get(mediaType) ?? documentClass.id).toBe(documentClass.id);
        seen.set(mediaType, documentClass.id);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(DOCUMENT_CLASSES.length);
  });

  it('resolves every declared media type and extension back to its own class', () => {
    for (const documentClass of DOCUMENT_CLASSES) {
      for (const mediaType of documentClass.mediaTypes) {
        expect(documentClassFor('any', mediaType)?.id).toBe(documentClass.id);
      }
      for (const extension of documentClass.extensions) {
        expect(documentClassFor(`sample.${extension}`, 'application/octet-stream')?.id).toBe(
          documentClass.id,
        );
      }
    }
  });

  it('names one media type per extension, so no surface guesses a second', () => {
    for (const documentClass of DOCUMENT_CLASSES) {
      for (const extension of documentClass.extensions) {
        expect(documentClass.mediaTypes).toContain(fileMediaTypeForName(`sample.${extension}`));
      }
    }
  });
});
