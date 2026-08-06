/* global console */
/**
 * Comment extraction and reference resolution for the reference-integrity gate.
 *
 * Why a scanner instead of `stripComments` from `./module-graph.mjs`: that helper
 * deletes comments and loses line numbers, which is the exact inverse of what a
 * reference audit needs. This module keeps the comment text and the line it sat on.
 *
 * The extractor is deliberately line-oriented rather than a parser. A `//` inside a
 * string literal therefore yields a phantom comment. That is harmless here because
 * every detector additionally requires an anchored, extension-qualified path (or a
 * declared prefix), so phantom text produces no candidates.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

export const REPO_ROOT = process.cwd();

/** Top-level directories a repo-root-relative reference may start with. */
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

/** Extensions a path reference must end in to be considered a path at all. */
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

/**
 * Tracked + untracked-but-not-ignored files, the enumeration idiom used by
 * `scripts/check-structure-conventions.mjs`.
 */
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

/**
 * Extract comments as `{ line, text }`, 1-indexed.
 *
 * Handles `//` and `/* *\/` for TS/JS/Rust (`///` and `//!` are prefixes of `//`,
 * so Rust doc comments fall out for free) and `#` for TOML. Returns [] for any
 * other extension — Markdown and JSON have their own extractors in the caller.
 */
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

      // `https://` and friends: a `//` preceded by `:` is part of a URL scheme.
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
        // Skip past the scheme and keep scanning this line for a real comment.
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
    // Crude string guard: an odd number of quotes before `#` means we are inside one.
    const before = lines[i].slice(0, hash);
    const quotes = (before.match(/"/g) ?? []).length;
    if (quotes % 2 === 1) continue;
    const text = lines[i].slice(hash + 1);
    if (text.trim()) out.push({ line: i + 1, text });
  }
  return out;
}

/**
 * Markdown lines outside fenced code blocks, as `{ line, text }`.
 * Paths inside fences are skipped — under-reporting is the correct bias here.
 */
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

/**
 * Path index supporting the three-tier resolution cascade.
 *
 * The suffix index is what lets a Rust module-relative citation such as
 * `sys/commands/orchestration.rs` resolve without the caller knowing the surface root.
 */
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

/**
 * Resolve a reference against the index.
 *
 * Order matters and each tier earns its place:
 *   1. exact repo-root path
 *   2. join against each ancestor directory of the referencing file — worth ~90
 *      false positives, because `services/streaming.ts` inside `apps/mobile` is
 *      how people actually write paths
 *   3. unique suffix match
 *
 * `allowDirectory` is set for Markdown, where `crates/sandbox-policy` is a
 * legitimate reference to a directory.
 */
export function resolveReference(reference, fromFile, index, { allowDirectory = false } = {}) {
  // A trailing slash is how prose spells "this directory" (`docs/decisions/`); the
  // directory index stores bare paths, so normalise before every lookup.
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

/** Extension of a repo-relative path, including the dot. */
export function extensionOf(relativePath) {
  return path.extname(relativePath).toLowerCase();
}
