#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  callerByteReads,
  deferralIsHonoured,
  inspectsUploadedBytes,
  readsCallerBytes,
  routeFiles,
} from './lib/upload-ingest.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const MODULE = 'apps/web/lib/security/upload-scan.ts';
const API_ROOT = 'apps/web/app/api';
const WEB_ROOT = 'apps/web';

/**
 * Routes that stage bytes for a second step. Each names every file that can
 * finish the upload, and the guard reads each one rather than trusting the
 * claim: one finishing path that skips inspection is enough to let bytes in.
 * A file that finishes without reading the bytes itself names the calls that
 * stand in for that read, and the guard requires each of them.
 */
const DEFERRED = [
  {
    route: 'apps/web/app/api/files/uploads/[uploadId]/route.ts',
    completedBy: [
      'apps/web/lib/server/chat-attachment-completion.ts',
      'apps/web/lib/server/project-knowledge-extraction.ts',
      {
        file: 'apps/web/lib/server/chat-file-intake/steps.ts',
        requires: ['inspectUploadHead', 'submitSourceScan'],
      },
    ],
  },
  {
    route: 'apps/web/app/api/uploads/chat-attachment/put/route.ts',
    completedBy: ['apps/web/lib/server/chat-attachment-completion.ts'],
  },
  {
    route: 'apps/web/app/api/uploads/knowledge-file/put/route.ts',
    completedBy: ['apps/web/lib/server/project-knowledge-extraction.ts'],
  },
];

const failures = [];
const modulePath = path.join(scanRoot, MODULE);

if (!fs.existsSync(modulePath)) {
  console.error(`check-upload-inspection-coverage: ${MODULE} is missing; nothing inspects.`);
  process.exit(1);
}

const moduleSource = fs.readFileSync(modulePath, 'utf8');
for (const required of [
  { pattern: /scanUploadForCredentials/, detail: 'looks for credentials in the bytes' },
  { pattern: /uploadFindingRejects/, detail: 'decides which findings refuse the upload' },
  { pattern: /inspectUploadBytes/, detail: 'checks the declared type against the bytes' },
]) {
  if (!required.pattern.test(moduleSource)) {
    failures.push(`${MODULE} no longer ${required.detail}`);
  }
}

const relative = (file) => path.relative(scanRoot, file).split(path.sep).join('/');
const deferredByRoute = new Map(DEFERRED.map((entry) => [entry.route, entry]));

function completingFile(completedBy) {
  return typeof completedBy === 'string' ? completedBy : completedBy.file;
}

function callsFunction(source, name) {
  return new RegExp(`(?<!function\\s)\\b${name}\\s*\\(`).test(source);
}

function completionIsHonoured(completedBy) {
  const completing = path.join(scanRoot, completingFile(completedBy));
  const source = fs.existsSync(completing) ? fs.readFileSync(completing, 'utf8') : null;
  if (typeof completedBy === 'string') return deferralIsHonoured(source);
  return (
    typeof source === 'string' && completedBy.requires.every((name) => callsFunction(source, name))
  );
}

const ingesting = [];
let inspected = 0;

for (const file of routeFiles(path.join(scanRoot, API_ROOT), fs, path)) {
  const source = fs.readFileSync(file, 'utf8');
  if (!readsCallerBytes(source)) continue;
  const route = relative(file);
  ingesting.push(route);

  if (inspectsUploadedBytes(source)) {
    inspected += 1;
    if (deferredByRoute.has(route)) {
      failures.push(`${route} inspects in place now; remove its deferral entry`);
    }
    continue;
  }

  const deferred = deferredByRoute.get(route);
  if (deferred) {
    const unhonoured = deferred.completedBy.filter(
      (completedBy) => !completionIsHonoured(completedBy),
    );
    for (const completedBy of unhonoured) {
      failures.push(
        `${route} defers inspection to ${completingFile(completedBy)}, which does not inspect ` +
          `the bytes, so nothing on that path ever does`,
      );
    }
    if (unhonoured.length === 0) inspected += 1;
    continue;
  }

  failures.push(
    `${route} reads caller bytes (${callerByteReads(source).join(', ')}) and inspects none of them`,
  );
}

const present = new Set(ingesting);
for (const entry of DEFERRED) {
  if (!present.has(entry.route)) {
    failures.push(`stale entry: ${entry.route} no longer reads caller bytes`);
  }
}

/**
 * A chat attachment becomes a media row only where its bytes were judged: the
 * synchronous completion for a small file and the seal for a large one.
 */
const CHAT_ATTACHMENT_MEDIA_WRITERS = new Set([
  'apps/web/lib/server/chat-attachment-completion.ts',
  'apps/web/lib/server/chat-file-intake/seal.ts',
]);
const SCANNED_MEDIA_WRITER = 'apps/web/lib/server/chat-file-intake/seal.ts';
const CHAT_ATTACHMENT_SOURCE = /\bsource\s*:\s*['"`]chat-attachment['"`]/;
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.next',
  '__tests__',
  'e2e',
  'test',
  'test-results',
  'coverage',
]);

function productSources(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) out.push(...productSources(full));
    } else if (
      /\.(?:ts|tsx|mts|js|mjs)$/.test(entry.name) &&
      !/\.(?:test|spec)\./.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out.sort();
}

for (const file of productSources(path.join(scanRoot, WEB_ROOT))) {
  const source = fs.readFileSync(file, 'utf8');
  const name = relative(file);
  if (
    !CHAT_ATTACHMENT_MEDIA_WRITERS.has(name) &&
    CHAT_ATTACHMENT_SOURCE.test(source) &&
    (callsFunction(source, 'insertMediaAsset') ||
      callsFunction(source, 'insertMediaAssetsAtomically'))
  ) {
    failures.push(
      `${name} writes a chat-attachment media row; only the synchronous completion and ` +
        `the seal may, because only they judged the bytes`,
    );
  }
  if (name !== SCANNED_MEDIA_WRITER && callsFunction(source, 'insertScannedChatFileMediaAsset')) {
    failures.push(
      `${name} calls insertScannedChatFileMediaAsset; only ${SCANNED_MEDIA_WRITER} may, ` +
        `from the scanner's own clean answer`,
    );
  }
}

if (failures.length === 0) {
  console.log(
    `check-upload-inspection-coverage: ${ingesting.length} routes read caller bytes, ` +
      `${inspected} inspected, ${DEFERRED.length} of them at the step that finishes the upload.`,
  );
  process.exit(0);
}

console.error('Caller bytes that enter the product without being inspected:\n');
for (const failure of failures) console.error(`  - ${failure}`);
console.error(`\n${failures.length} finding(s).`);
process.exit(1);
