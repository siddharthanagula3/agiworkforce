import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  validateArchiveEntries,
}: {
  validateArchiveEntries: (entries: string[]) => string[];
} = require('../../scripts/vsix-archive.js');
const {
  validateEntryMetadata,
}: {
  validateEntryMetadata: (entry: {
    compressedSize: number;
    compressionMethod: number;
    directory: boolean;
    diskNumberStart: number;
    encrypted: boolean;
    externalFileAttributes: number;
    filename: string;
    filenameUTF8: boolean;
    msDosCompatible: boolean;
    msdosAttributes: { directory: boolean };
    offset: number;
    rawFilename: Uint8Array;
    uncompressedSize: number;
    versionMadeBy: number;
  }) => void;
} = require('../../scripts/vsix-zip.js');

describe('VSIX archive safety', () => {
  it('rejects duplicate and case-colliding extraction targets', () => {
    expect(() =>
      validateArchiveEntries(['extension/package.json', 'extension/package.json']),
    ).toThrow(/duplicate archive paths/u);
    expect(() => validateArchiveEntries(['extension/README.md', 'extension/readme.md'])).toThrow(
      /case-colliding archive paths/u,
    );
  });

  it('rejects traversal, platform separators, and control characters', () => {
    expect(() => validateArchiveEntries(['extension/../outside'])).toThrow(/unsafe archive paths/u);
    expect(() => validateArchiveEntries(['extension\\package.json'])).toThrow(
      /unsafe archive paths/u,
    );
    expect(() => validateArchiveEntries(['extension/bad\u0007name'])).toThrow(
      /unsafe archive paths/u,
    );
    expect(() => validateArchiveEntries(['C:/outside'])).toThrow(/unsafe archive paths/u);
    expect(() => validateArchiveEntries(['extension//package.json'])).toThrow(
      /unsafe archive paths/u,
    );
    expect(() => validateArchiveEntries(['extension/CON.txt'])).toThrow(/unsafe archive paths/u);
    expect(() => validateArchiveEntries(['extension/caf\u00e9', 'extension/cafe\u0301'])).toThrow(
      /case-colliding archive paths|unsafe archive paths/u,
    );
    expect(() => validateArchiveEntries(['extension/file', 'extension/file/child'])).toThrow(
      /ancestor of another target/u,
    );
    expect(() => validateArchiveEntries(['extension/folder', 'extension/folder/'])).toThrow(
      /colliding extraction targets/u,
    );
  });

  it('rejects symlinks and excessive expansion metadata', () => {
    expect(() =>
      validateEntryMetadata({
        compressedSize: 4,
        compressionMethod: 8,
        directory: false,
        diskNumberStart: 0,
        encrypted: false,
        externalFileAttributes: (0o120777 << 16) >>> 0,
        filename: 'extension/link',
        filenameUTF8: true,
        msDosCompatible: false,
        msdosAttributes: { directory: false },
        offset: 0,
        rawFilename: Buffer.from('extension/link'),
        uncompressedSize: 4,
        versionMadeBy: 3 << 8,
      }),
    ).toThrow(/non-file archive entry/u);
    expect(() =>
      validateEntryMetadata({
        compressedSize: 4,
        compressionMethod: 8,
        directory: false,
        diskNumberStart: 0,
        encrypted: false,
        externalFileAttributes: (0o100644 << 16) >>> 0,
        filename: 'extension/huge',
        filenameUTF8: true,
        msDosCompatible: false,
        msdosAttributes: { directory: false },
        offset: 0,
        rawFilename: Buffer.from('extension/huge'),
        uncompressedSize: 40_000_000,
        versionMadeBy: 3 << 8,
      }),
    ).toThrow(/invalid or excessive size/u);
  });
});
