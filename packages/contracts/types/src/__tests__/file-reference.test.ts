import { describe, expect, it } from 'vitest';
import {
  createFileReference,
  fileReferenceIdentity,
  isExternalResourceRef,
  isFetchableFileReference,
} from '../file-reference';

describe('FileReference', () => {
  it('defaults a connector file to external storage and everything else to managed cloud', () => {
    expect(
      createFileReference({
        id: 'f1',
        name: 'notes.md',
        mediaType: 'text/markdown',
        byteCount: 10,
        uri: '/api/files/f1',
        origin: 'upload',
      }).storage,
    ).toBe('managed_cloud');

    expect(
      createFileReference({
        id: 'f2',
        name: 'page',
        mediaType: 'text/html',
        byteCount: 0,
        uri: 'https://notion.so/page',
        origin: 'connector',
      }).storage,
    ).toBe('external');
  });

  it('starts every file private, so visibility is a decision and not a default', () => {
    const reference = createFileReference({
      id: 'f3',
      name: 'a.png',
      mediaType: 'image/png',
      byteCount: 5,
      uri: '/api/files/f3',
      origin: 'generated',
    });
    expect(reference.visibility).toBe('private');
    expect(reference.parseStatus).toBe('not_applicable');
    expect(reference.externalResource).toBeNull();
  });

  it('refuses a negative or fractional byte count', () => {
    expect(
      createFileReference({
        id: 'f4',
        name: 'a',
        mediaType: 'text/plain',
        byteCount: -12,
        uri: '/a',
        origin: 'upload',
      }).byteCount,
    ).toBe(0);
    expect(
      createFileReference({
        id: 'f5',
        name: 'a',
        mediaType: 'text/plain',
        byteCount: 12.7,
        uri: '/a',
        origin: 'upload',
      }).byteCount,
    ).toBe(12);
  });

  it('identifies the same bytes by connector address, then checksum, then id', () => {
    const external = createFileReference({
      id: 'f6',
      name: 'row',
      mediaType: 'application/json',
      byteCount: 1,
      uri: 'https://example.test/row',
      origin: 'connector',
      checksumSha256: 'abc',
      externalResource: {
        connectorId: 'inst-1',
        provider: 'notion',
        resourceType: 'page',
        resourceId: 'p1',
        uri: null,
        label: null,
      },
    });
    expect(fileReferenceIdentity(external)).toBe('notion:page:p1');

    const hashed = createFileReference({
      id: 'f7',
      name: 'a',
      mediaType: 'text/plain',
      byteCount: 1,
      uri: '/a',
      origin: 'upload',
      checksumSha256: 'abc',
    });
    expect(fileReferenceIdentity(hashed)).toBe('sha256:abc');

    const bare = createFileReference({
      id: 'f8',
      name: 'a',
      mediaType: 'text/plain',
      byteCount: 1,
      uri: '/a',
      origin: 'upload',
    });
    expect(fileReferenceIdentity(bare)).toBe('file:f8');
  });

  it('will not claim a device-local file is fetchable', () => {
    const local = createFileReference({
      id: 'f9',
      name: 'a',
      mediaType: 'text/plain',
      byteCount: 1,
      uri: 'file:///Users/a',
      origin: 'upload',
      storage: 'local_device',
    });
    expect(isFetchableFileReference(local)).toBe(false);
  });

  it('recognises an external reference only when it carries a full address', () => {
    expect(
      isExternalResourceRef({
        connectorId: 'c',
        provider: 'github',
        resourceType: 'issue',
        resourceId: '1',
      }),
    ).toBe(true);
    expect(isExternalResourceRef({ provider: 'github', resourceId: '1' })).toBe(false);
    expect(isExternalResourceRef(null)).toBe(false);
  });
});
