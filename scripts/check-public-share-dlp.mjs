#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const SCAN_DIRS = ['apps/web/lib', 'apps/web/app'];

// Rows whose content is served from an unauthenticated URL. Writing one is the
// moment private content becomes public, which is the moment to inspect it.
const PUBLIC_SHARE_TABLES = ['shared_sessions', 'published_artifacts'];

// The inspections that decide whether content may leave the account. Any one of
// them satisfies the rule; none of them is optional.
const INSPECTORS = [
  'inspectOutboundContent',
  'scanForSecrets',
  'redactSecrets',
  'redactSecretsFromValue',
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('__')) continue;
      walk(full, out);
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
    out.push(path.relative(scanRoot, full).split(path.sep).join('/'));
  }
  return out;
}

const files = SCAN_DIRS.flatMap((dir) => walk(path.join(scanRoot, dir))).sort();
const sources = new Map(
  files.map((file) => [file, fs.readFileSync(path.join(scanRoot, file), 'utf8')]),
);

function publishesPublicly(source) {
  for (const match of source.matchAll(/insert\s+into\s+(?:public\.)?([a-z_]+)/gi)) {
    if (PUBLIC_SHARE_TABLES.includes(match[1])) return true;
  }
  return false;
}

function firstInspectionIndex(source) {
  const indexes = INSPECTORS.flatMap((name) => {
    const match = new RegExp(`\\b${name}\\s*\\(`).exec(source);
    return match?.index === undefined ? [] : [match.index];
  });
  return indexes.length === 0 ? -1 : Math.min(...indexes);
}

function firstPublicWriteIndex(source) {
  for (const match of source.matchAll(/insert\s+into\s+(?:public\.)?([a-z_]+)/gi)) {
    if (PUBLIC_SHARE_TABLES.includes(match[1])) return match.index ?? -1;
  }
  return -1;
}

/**
 * The exported functions of a publishing module that actually write the public
 * row, so a route is judged on whether it calls one of those rather than on
 * having imported the module at all: most importers only read a share back.
 */
function publishingExports(source) {
  const names = [];
  const spans = [...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)];
  for (let i = 0; i < spans.length; i += 1) {
    const start = spans[i].index ?? 0;
    const end = i + 1 < spans.length ? (spans[i + 1].index ?? source.length) : source.length;
    if (publishesPublicly(source.slice(start, end))) names.push(spans[i][1]);
  }
  return names;
}

const findings = [];
const publishingFunctions = new Map();
let publishers = 0;

for (const [file, source] of sources) {
  if (!publishesPublicly(source)) continue;
  publishers += 1;
  if (file.endsWith('/route.ts')) {
    const inspectionAt = firstInspectionIndex(source);
    const publishAt = firstPublicWriteIndex(source);
    if (inspectionAt < 0 || inspectionAt > publishAt) {
      findings.push(`${file}: publishes to a public URL without inspecting the content first`);
    }
    continue;
  }
  for (const name of publishingExports(source)) publishingFunctions.set(name, file);
}

for (const [file, source] of sources) {
  if (!file.endsWith('/route.ts')) continue;
  for (const [name, owner] of publishingFunctions) {
    const call = new RegExp(`\\b${name}\\s*\\(`).exec(source);
    if (!call) continue;
    const inspectionAt = firstInspectionIndex(source);
    if (inspectionAt >= 0 && inspectionAt < call.index) continue;
    findings.push(`${file}: calls ${name} (${owner}) without inspecting the content first`);
  }
}

if (publishers === 0) {
  console.error('check-public-share-dlp: found no public share writes; the table list is stale');
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Public shares that bypass outbound content inspection:');
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(`Call one of: ${INSPECTORS.join(', ')} before the row is written.`);
  process.exit(1);
}

console.log(
  `check-public-share-dlp: ${publishers} public share writers all inspect what they publish`,
);
