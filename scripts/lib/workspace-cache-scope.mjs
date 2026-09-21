import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRECTORIES = new Set(['node_modules', '__tests__', '__mocks__', '.next', 'dist']);

export function sourceFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** The store modules the sign-out sweep knows how to reset, by their label. */
export function registeredStoreModules(source) {
  const start = source.indexOf('USER_SCOPED_STORE_MODULES');
  if (start < 0) return null;
  const close = source.indexOf('\n];', start);
  if (close < 0) return null;
  const block = source.slice(start, close);
  return [...block.matchAll(/label:\s*'([^']+)'[\s\S]{0,120}?import\('([^']+)'\)/g)].map(
    (match) => ({ label: match[1], specifier: match[2] }),
  );
}

export function workspaceScopedLabels(source) {
  const start = source.indexOf('WORKSPACE_SCOPED_STORE_LABELS');
  if (start < 0) return null;
  const close = source.indexOf(']', start);
  return [...source.slice(start, close).matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function storagePatterns(source, constant) {
  const start = source.indexOf(`${constant}:`);
  if (start < 0) return null;
  const open = source.indexOf('[', start);
  const close = source.indexOf('\n];', open);
  if (open < 0 || close < 0) return null;
  return [...source.slice(open, close).matchAll(/\/((?:[^/\\\n]|\\.)+)\/([a-z]*)/g)].map(
    (match) => new RegExp(match[1], match[2]),
  );
}

/** A module that writes state which outlives the page it was created on. */
export function persistedStoreName(source) {
  if (!/\bpersist\(/.test(source)) return null;
  const match = source.match(/persist\([\s\S]{0,6000}?\bname:\s*'([^']+)'/);
  return match ? match[1] : null;
}

export function literalStorageKeys(source) {
  const keys = [];
  for (const match of source.matchAll(
    /(?:local|session)Storage\.(?:setItem|getItem|removeItem)\(\s*['"`]([^'"`]+)['"`]/g,
  )) {
    keys.push(match[1]);
  }
  const persisted = persistedStoreName(source);
  if (persisted) keys.push(persisted);
  return keys;
}
