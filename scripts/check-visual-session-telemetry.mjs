#!/usr/bin/env node

// A live camera or screen share produces pixels of whatever the user is looking
// at, and the visual session contract promises that those pixels live in a
// bounded in-memory ring and reach nothing else: not a log line, not a metric,
// not browser storage, not a row. The promise is only as good as every consumer
// of a frame, so this guard reads the pixel-bearing field names out of the
// contract itself, then enumerates every file that imports the contract and
// refuses a frame field that reaches a sink which outlives the session.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/visual-session.ts';
export const SEARCH_ROOTS = ['apps', 'packages'];

const SKIP_DIRECTORIES = new Set(['node_modules', '.next', '.turbo', 'coverage', 'dist', 'build']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const CONTRACT_IMPORT = /visual-session|VisualFrame|VisualCaptureSession/;

/** Field names that carry image content rather than a description of it. */
const PIXEL_FIELD = /pixels|dataurl|bytes|base64|blob|imagedata|buffer/i;

/** Sinks that outlive the session: a log, a metric, storage, a row, a request. */
export const SINKS = [
  { label: 'a log', pattern: /\b(?:logger|console)\s*\.\s*[a-z]+\s*\(/ },
  { label: 'a metric', pattern: /\brecord[A-Z][A-Za-z]*\s*\(/ },
  { label: 'browser storage', pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/ },
  { label: 'a row', pattern: /\b(?:db|tx)\s*\.\s*(?:query|execute|transaction)\s*\(/ },
];

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function interfaceFields(source, name) {
  const declaration = new RegExp(`interface ${name}\\s*\\{`).exec(source);
  if (declaration === null) return null;
  const start = declaration.index;
  const open = source.indexOf('{', start);
  const close = source.indexOf('\n}', open);
  if (open === -1 || close === -1) return null;
  return [...source.slice(open, close).matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\??\s*:/gm)].map(
    (match) => match[1],
  );
}

export function readFrameFields(repoRoot = REPO_ROOT) {
  const contract = read(repoRoot, CONTRACT_PATH);
  if (contract === null) return null;
  const frame = interfaceFields(contract, 'VisualFrame');
  const telemetry = interfaceFields(contract, 'VisualFrameTelemetry');
  if (frame === null || telemetry === null) return null;
  return { frame, telemetry, pixel: frame.filter((field) => PIXEL_FIELD.test(field)) };
}

export function sourceFiles(repoRoot = REPO_ROOT, roots = SEARCH_ROOTS) {
  const found = [];
  const walk = (absolute, relative) => {
    let entries;
    try {
      entries = readdirSync(absolute);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith('.') || SKIP_DIRECTORIES.has(entry)) continue;
      const child = path.join(absolute, entry);
      const childRelative = path.join(relative, entry);
      let info;
      try {
        info = statSync(child);
      } catch {
        continue;
      }
      if (info.isDirectory()) walk(child, childRelative);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry))) found.push(childRelative);
    }
  };
  for (const root of roots) walk(path.join(repoRoot, root), root);
  return found.sort();
}

export function checkVisualSessionTelemetry(repoRoot = REPO_ROOT) {
  const failures = [];
  const fields = readFrameFields(repoRoot);
  if (fields === null) {
    failures.push('the visual session contract does not declare a frame and its telemetry');
    return failures;
  }
  if (fields.pixel.length === 0) {
    failures.push('no frame field carries image content; the guard has nothing to police');
    return failures;
  }

  for (const field of fields.pixel) {
    if (fields.telemetry.includes(field)) {
      failures.push(`VisualFrameTelemetry carries the frame's ${field}`);
    }
  }

  const contract = read(repoRoot, CONTRACT_PATH) ?? '';
  const projector = /export function toVisualFrameTelemetry[\s\S]*?\n}/.exec(contract);
  if (projector === null) {
    failures.push('the contract declares no frame telemetry projection');
  } else {
    for (const field of fields.pixel) {
      if (projector[0].includes(field)) {
        failures.push(`toVisualFrameTelemetry reads the frame's ${field}`);
      }
    }
  }

  const pattern = new RegExp(`\\.(?:${fields.pixel.join('|')})\\b`);
  for (const relativePath of sourceFiles(repoRoot)) {
    const source = read(repoRoot, relativePath);
    if (source === null || !CONTRACT_IMPORT.test(source)) continue;
    source.split('\n').forEach((line, index) => {
      if (!pattern.test(line)) return;
      for (const sink of SINKS) {
        if (sink.pattern.test(line)) {
          failures.push(`${relativePath}:${index + 1} sends frame pixels to ${sink.label}`);
        }
      }
    });
  }

  return failures;
}

function main() {
  const failures = checkVisualSessionTelemetry();
  if (failures.length > 0) {
    console.error('Visual session frame containment failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('Visual session frames: pixels reach no sink that outlives the session.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
