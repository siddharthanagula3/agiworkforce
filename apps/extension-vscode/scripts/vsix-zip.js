'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } = require('@zip.js/zip.js/index-native.js');
const { validateArchiveEntries } = require('./vsix-archive.js');

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 4096;
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;
const UNIX_DIRECTORY = 0o040000;
const UNIX_FILE = 0o100000;
const UNIX_HOST = 3;
const UNIX_SPECIAL_BITS = 0o7000;
const UNIX_TYPE_MASK = 0o170000;
const ZIP_OPTIONS = Object.freeze({
  checkOverlappingEntry: true,
  checkSignature: true,
  // Inflate through the platform's DecompressionStream, not zip.js's bundled JS
  // implementation. On @zip.js/zip.js 2.8.26 the JS path fails checkSignature
  // for entries large enough to span multiple chunks: packaging this extension
  // produced `ERROR: Invalid signature` on extension/out/extension.js (~1 MB,
  // deflated) while the other 16 entries passed. The archive was intact —
  // `unzip -t` reported no errors and an independently recomputed CRC32 matched
  // both the central directory and the value zip.js itself reported. So the
  // bytes were fine and the JS inflate path's own verification was wrong.
  //
  // This keeps checkSignature ON. It changes which inflater runs, not whether
  // the CRC is verified.
  useCompressionStream: true,
  useWebWorkers: false,
});

function validateEntryMetadata(entry) {
  if (entry.encrypted) throw new Error(`VSIX entry is encrypted: ${entry.filename}`);
  if (entry.diskNumberStart !== 0) {
    throw new Error(`VSIX entry belongs to an unsupported split archive: ${entry.filename}`);
  }
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw new Error(`VSIX entry uses an unsupported compression method: ${entry.filename}`);
  }
  if (
    !Number.isSafeInteger(entry.offset) ||
    entry.offset < 0 ||
    !Number.isSafeInteger(entry.compressedSize) ||
    entry.compressedSize < 0 ||
    entry.compressedSize > MAX_ARCHIVE_BYTES ||
    !Number.isSafeInteger(entry.uncompressedSize) ||
    entry.uncompressedSize < 0 ||
    entry.uncompressedSize > MAX_ENTRY_BYTES
  ) {
    throw new Error(`VSIX entry has an invalid or excessive size or offset: ${entry.filename}`);
  }
  if (
    !entry.filenameUTF8 ||
    !Buffer.from(entry.rawFilename).equals(Buffer.from(entry.filename, 'utf8'))
  ) {
    throw new Error(`VSIX entry name is not canonical UTF-8: ${entry.filename}`);
  }

  const directory = entry.filename.endsWith('/');
  if (entry.directory !== directory) {
    throw new Error(`VSIX entry has inconsistent directory metadata: ${entry.filename}`);
  }
  const host = entry.versionMadeBy >>> 8;
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const unixType = unixMode & UNIX_TYPE_MASK;
  if (host === UNIX_HOST && unixType !== 0) {
    const expectedType = directory ? UNIX_DIRECTORY : UNIX_FILE;
    if (unixType !== expectedType) {
      throw new Error(`VSIX contains a non-file archive entry: ${entry.filename}`);
    }
    if ((unixMode & UNIX_SPECIAL_BITS) !== 0) {
      throw new Error(`VSIX entry carries privileged Unix mode bits: ${entry.filename}`);
    }
  }
  if (entry.msDosCompatible && Boolean(entry.msdosAttributes?.directory) !== directory) {
    throw new Error(`VSIX entry has inconsistent DOS directory metadata: ${entry.filename}`);
  }
  if (directory && (entry.compressedSize !== 0 || entry.uncompressedSize !== 0)) {
    throw new Error(`VSIX directory entry contains data: ${entry.filename}`);
  }
}

function safeExtractionPath(root, archivePath) {
  const segments = archivePath.replace(/\/$/u, '').split('/');
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`VSIX entry resolves outside the extraction root: ${archivePath}`);
  }
  return target;
}

async function inspectVsixArchive(vsixPath, options = {}) {
  const archiveMetadata = fs.statSync(vsixPath);
  if (
    !archiveMetadata.isFile() ||
    archiveMetadata.size <= 0 ||
    archiveMetadata.size > MAX_ARCHIVE_BYTES
  ) {
    throw new Error('VSIX archive has an invalid or excessive compressed size');
  }
  const archiveBytes = fs.readFileSync(vsixPath);
  const reader = new ZipReader(new Uint8ArrayReader(archiveBytes), ZIP_OPTIONS);
  try {
    const entries = await reader.getEntries();
    if (entries.length === 0 || entries.length > MAX_ENTRIES) {
      throw new Error(`VSIX archive has an invalid entry count: ${entries.length}`);
    }
    const entryNames = validateArchiveEntries(entries.map((entry) => entry.filename));
    let totalCompressedBytes = 0;
    let totalExpandedBytes = 0;
    for (const entry of entries) {
      validateEntryMetadata(entry);
      totalCompressedBytes += entry.compressedSize;
      totalExpandedBytes += entry.uncompressedSize;
      if (totalCompressedBytes > MAX_ARCHIVE_BYTES) {
        throw new Error('VSIX contains excessive cumulative compressed data');
      }
      if (totalExpandedBytes > MAX_EXPANDED_BYTES) {
        throw new Error('VSIX expands beyond the 128 MiB verification limit');
      }
    }

    const contentsByName = new Map();
    for (const entry of entries) {
      if (entry.directory) continue;
      if (typeof entry.getData !== 'function') {
        throw new Error(`VSIX file entry has no readable data: ${entry.filename}`);
      }
      const contents = Buffer.from(await entry.getData(new Uint8ArrayWriter(), ZIP_OPTIONS));
      if (contents.length !== entry.uncompressedSize) {
        throw new Error(`VSIX entry size does not match its header: ${entry.filename}`);
      }
      contentsByName.set(entry.filename, contents);
    }

    let extractionRoot;
    if (options.extractTo !== undefined) {
      extractionRoot = path.resolve(options.extractTo);
      fs.mkdirSync(extractionRoot, { recursive: true, mode: 0o700 });
      if (fs.readdirSync(extractionRoot).length !== 0) {
        throw new Error(`VSIX extraction root must be empty: ${extractionRoot}`);
      }
      extractionRoot = fs.realpathSync(extractionRoot);
      for (const entry of entries) {
        const extractionPath = safeExtractionPath(extractionRoot, entry.filename);
        if (entry.directory) {
          fs.mkdirSync(extractionPath, { recursive: true, mode: 0o700 });
          continue;
        }
        const contents = contentsByName.get(entry.filename);
        if (contents === undefined) {
          throw new Error(`Verified VSIX entry data is missing: ${entry.filename}`);
        }
        fs.mkdirSync(path.dirname(extractionPath), { recursive: true, mode: 0o700 });
        fs.writeFileSync(extractionPath, contents, { flag: 'wx', mode: 0o600 });
      }
    }
    return {
      entries: entryNames,
      packagedManifest: contentsByName.get('extension/package.json'),
    };
  } finally {
    await reader.close();
  }
}

module.exports = { inspectVsixArchive, validateEntryMetadata };
