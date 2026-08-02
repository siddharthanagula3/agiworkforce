'use strict';

const path = require('node:path');

function validateArchiveEntries(entries) {
  if (entries.length === 0) throw new Error('VSIX archive is empty');

  const normalizedEntries = entries.map((entry) => entry.replaceAll('\\', '/'));
  const duplicateEntries = normalizedEntries.filter(
    (entry, index) => normalizedEntries.indexOf(entry) !== index,
  );
  if (duplicateEntries.length > 0) {
    throw new Error(
      `VSIX contains duplicate archive paths:\n${[...new Set(duplicateEntries)].join('\n')}`,
    );
  }

  const caseInsensitivePaths = new Map();
  const caseCollisions = [];
  for (const entry of normalizedEntries) {
    const key = entry.normalize('NFC').toLowerCase();
    const existing = caseInsensitivePaths.get(key);
    if (existing !== undefined && existing !== entry) {
      caseCollisions.push(`${existing} <> ${entry}`);
    } else {
      caseInsensitivePaths.set(key, entry);
    }
  }
  if (caseCollisions.length > 0) {
    throw new Error(`VSIX contains case-colliding archive paths:\n${caseCollisions.join('\n')}`);
  }

  const invalidPaths = entries.filter((entry) => {
    const normalized = entry.replaceAll('\\', '/');
    const withoutTrailingSlash = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    const segments = withoutTrailingSlash.split('/');
    return (
      normalized.length === 0 ||
      normalized !== normalized.normalize('NFC') ||
      Buffer.byteLength(normalized, 'utf8') > 4096 ||
      entry !== normalized ||
      path.posix.isAbsolute(normalized) ||
      path.win32.isAbsolute(normalized) ||
      segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
      /[\u0000-\u001f\u007f<>:"|?*]/u.test(normalized) ||
      segments.some(
        (segment) =>
          Buffer.byteLength(segment, 'utf8') > 255 ||
          /[. ]$/u.test(segment) ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(segment),
      )
    );
  });
  if (invalidPaths.length > 0) {
    throw new Error(`VSIX contains unsafe archive paths:\n${invalidPaths.join('\n')}`);
  }

  const canonicalTargets = new Map();
  for (const entry of normalizedEntries) {
    const canonical = entry.replace(/\/$/u, '').normalize('NFC').toLowerCase();
    const existing = canonicalTargets.get(canonical);
    if (existing !== undefined) {
      throw new Error(`VSIX contains colliding extraction targets:\n${existing} <> ${entry}`);
    }
    canonicalTargets.set(canonical, entry);
  }
  const fileTargets = new Set(
    normalizedEntries
      .filter((entry) => !entry.endsWith('/'))
      .map((entry) => entry.normalize('NFC').toLowerCase()),
  );
  for (const entry of normalizedEntries) {
    const segments = entry.replace(/\/$/u, '').normalize('NFC').toLowerCase().split('/');
    for (let index = 1; index < segments.length; index += 1) {
      const parent = segments.slice(0, index).join('/');
      if (fileTargets.has(parent)) {
        throw new Error(`VSIX file entry is an ancestor of another target: ${parent}`);
      }
    }
  }

  return normalizedEntries;
}

module.exports = {
  validateArchiveEntries,
};
