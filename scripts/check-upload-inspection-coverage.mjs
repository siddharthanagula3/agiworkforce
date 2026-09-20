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

/**
 * Routes that stage bytes for a second step. Each names the file that finishes
 * the upload, and the guard reads that file rather than trusting the claim.
 */
const DEFERRED = [
  {
    route: 'apps/web/app/api/uploads/chat-attachment/put/route.ts',
    completedBy: 'apps/web/app/api/uploads/chat-attachment/complete/route.ts',
  },
  {
    route: 'apps/web/app/api/uploads/knowledge-file/put/route.ts',
    completedBy: 'apps/web/lib/server/project-knowledge-extraction.ts',
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
    const completing = path.join(scanRoot, deferred.completedBy);
    const completingSource = fs.existsSync(completing) ? fs.readFileSync(completing, 'utf8') : null;
    if (!deferralIsHonoured(completingSource)) {
      failures.push(
        `${route} defers inspection to ${deferred.completedBy}, which does not inspect the ` +
          `bytes, so nothing on that path ever does`,
      );
    } else {
      inspected += 1;
    }
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
