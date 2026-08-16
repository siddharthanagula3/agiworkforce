/* global console */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

export const REPO_ROOT = process.cwd();

export const REPO_ROOTS = [
  'apps',
  'packages',
  'crates',
  'services',
  'scripts',
  'docs',
  'tools',
  'infrastructure',
  'examples',
  'dev-scripts',
  '.github',
  '.claude',
];

export const REFERENCE_EXTENSIONS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'rs',
  'md',
  'json',
  'toml',
  'sql',
  'yaml',
  'yml',
  'sh',
  'py',
  'css',
];

const SLASH_COMMENT_LANGS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.rs']);

const HASH_COMMENT_LANGS = new Set(['.toml']);

export function workspaceFiles() {
  const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return output.split('\n').filter(Boolean);
}

export function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

export function extractComments(source, extension) {
  if (HASH_COMMENT_LANGS.has(extension)) {
    return extractHashComments(source);
  }
  if (!SLASH_COMMENT_LANGS.has(extension)) {
    return [];
  }

  const out = [];
  const lines = source.split('\n');
  let inBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    let buffer = '';
    let column = 0;

    while (column < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', column);
        if (end === -1) {
          buffer += line.slice(column);
          column = line.length;
        } else {
          buffer += line.slice(column, end);
          column = end + 2;
          inBlock = false;
        }
        continue;
      }

      const lineStart = line.indexOf('//', column);
      const blockStart = line.indexOf('/*', column);

      const lineIsUrl = lineStart > 0 && line[lineStart - 1] === ':';

      if (lineStart !== -1 && !lineIsUrl && (blockStart === -1 || lineStart < blockStart)) {
        buffer += line.slice(lineStart + 2);
        column = line.length;
        continue;
      }
      if (blockStart !== -1) {
        column = blockStart + 2;
        inBlock = true;
        continue;
      }
      if (lineIsUrl) {
        column = lineStart + 2;
        continue;
      }
      break;
    }

    if (buffer.trim()) {
      out.push({ line: i + 1, text: buffer });
    }
  }

  return out;
}

function extractHashComments(source) {
  const out = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const hash = lines[i].indexOf('#');
    if (hash === -1) continue;
    const before = lines[i].slice(0, hash);
    const quotes = (before.match(/"/g) ?? []).length;
    if (quotes % 2 === 1) continue;
    const text = lines[i].slice(hash + 1);
    if (text.trim()) out.push({ line: i + 1, text });
  }
  return out;
}

export function markdownProseLines(source) {
  const out = [];
  const lines = source.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(?:```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    out.push({ line: i + 1, text: lines[i] });
  }
  return out;
}

export function buildPathIndex(files) {
  const exact = new Set(files);
  const directories = new Set();
  const suffixes = new Map();

  for (const file of files) {
    const segments = file.split('/');
    for (let i = 1; i < segments.length; i += 1) {
      directories.add(segments.slice(0, i).join('/'));
    }
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const suffix = segments.slice(i).join('/');
      if (!suffixes.has(suffix)) suffixes.set(suffix, []);
      suffixes.get(suffix).push(file);
    }
  }

  return { exact, directories, suffixes };
}

export function resolveReference(reference, fromFile, index, { allowDirectory = false } = {}) {
  const clean = reference.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!clean) return true;

  if (index.exact.has(clean)) return true;
  if (allowDirectory && index.directories.has(clean)) return true;

  const segments = fromFile.split('/');
  for (let i = segments.length - 1; i > 0; i -= 1) {
    const candidate = `${segments.slice(0, i).join('/')}/${clean}`;
    if (index.exact.has(candidate)) return true;
    if (allowDirectory && index.directories.has(candidate)) return true;
  }

  const bySuffix = index.suffixes.get(clean);
  if (bySuffix && bySuffix.length > 0) return true;

  return false;
}

export function extensionOf(relativePath) {
  return path.extname(relativePath).toLowerCase();
}
