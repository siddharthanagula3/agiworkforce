#!/usr/bin/env node
// Refuses to publish an artifact that carries a provider secret or points at a
// dev endpoint. Run against the built bundle, never the source tree.

import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readableText, scanText } from '../lib/rollout/artifact-scan.mjs';

const ALLOWLIST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'release-scan-allowlist.json',
);
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);
// A universal desktop binary is hundreds of megabytes, so it is scanned in
// chunks that overlap by more than the longest pattern can match.
const CHUNK_BYTES = 8 * 1024 * 1024;
const CHUNK_OVERLAP_BYTES = 4096;
const WHOLE_FILE_LIMIT = CHUNK_BYTES;

function readAllowlist() {
  try {
    const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
    if (!Array.isArray(parsed.allowed)) throw new Error('allowlist must hold an "allowed" array');
    for (const entry of parsed.allowed) {
      if (typeof entry.value !== 'string' || typeof entry.why !== 'string' || entry.why === '') {
        throw new Error('every allowlist entry states the literal value and why it is public');
      }
    }
    return parsed.allowed.map((entry) => entry.value);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function collectFiles(root) {
  const stats = statSync(root);
  if (stats.isFile()) return [root];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      files.push(...collectFiles(path.join(root, entry.name)));
      continue;
    }
    if (entry.isFile()) files.push(path.join(root, entry.name));
  }
  return files;
}

function scanLargeFile(file, allowlist) {
  const findings = [];
  const handle = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(CHUNK_BYTES);
    let position = 0;
    let carry = '';
    for (;;) {
      const read = readSync(handle, buffer, 0, CHUNK_BYTES, position);
      if (read === 0) break;
      const chunk = readableText(buffer.subarray(0, read));
      findings.push(...scanText(carry + chunk, file, allowlist));
      carry = chunk.slice(-CHUNK_OVERLAP_BYTES);
      position += read;
    }
  } finally {
    closeSync(handle);
  }
  // The overlap means a match on a chunk boundary is seen twice.
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.rule}:${finding.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scanArtifact(root, allowlist) {
  const findings = [];
  for (const file of collectFiles(root)) {
    findings.push(
      ...(statSync(file).size > WHOLE_FILE_LIMIT
        ? scanLargeFile(file, allowlist)
        : scanText(readableText(readFileSync(file)), file, allowlist)),
    );
  }
  return findings;
}

function main() {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    console.error('usage: scan-release-artifact.mjs <built-bundle-path>...');
    process.exit(2);
  }
  const allowlist = readAllowlist();
  const findings = roots.flatMap((root) => scanArtifact(root, allowlist));
  if (findings.length === 0) {
    console.log(`Release scan clean: ${roots.join(', ')}`);
    return;
  }
  for (const finding of findings) {
    console.error(`${finding.file}: ${finding.rule}: ${finding.detail}`);
  }
  console.error(
    `\n${findings.length} release-scan violation(s). A value that is genuinely public belongs in ` +
      `${path.relative(process.cwd(), ALLOWLIST_PATH)} with the reason it is public.`,
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
