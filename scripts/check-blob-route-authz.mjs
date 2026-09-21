#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
const API_ROOT = 'apps/web/app/api';
const CRON_PREFIX = `${API_ROOT}/cron/`;

const STORAGE_MODULES = [
  '@/lib/server/media-storage',
  '@/lib/server/object-storage',
  '@/lib/server/object-storage-runtime',
  '@/lib/server/project-knowledge-object-storage',
  '@/lib/server/object-backup',
  '@agiworkforce/object-storage',
];

// Exports of those modules that answer a question about configuration or build
// a URL string. Everything else they export reaches the bucket, so a new export
// is treated as byte-moving until it is named here.
const METADATA_ONLY_IMPORTS = new Set([
  'authenticatedMediaUrl',
  'sealedChatAttachmentPathname',
  'videoStoragePathname',
  'publicUrlForKey',
  'objectKeyFromStorageUri',
  'isMediaStorageConfigured',
  'isGeneratedMediaStorageConfigured',
  'isImageStorageConfigured',
  'isVideoStorageConfigured',
  'isObjectStorageConfigured',
  'isPrivateObjectStorageConfigured',
  'isProjectKnowledgeObjectStorageConfigured',
  'isSealedProjectKnowledgeKey',
  'objectStorageConfig',
  'objectStorageUploadOrigins',
  'resolveObjectStorageConfig',
  'hasObjectStorageCredentials',
  'bytesFromBase64',
  'bytesFromUrl',
  'StoredObjectTooLargeError',
  'ObjectStorageConfigError',
  'ObjectStorageTimeoutError',
  'ObjectChecksumMismatchError',
  'objectChecksum',
  'PRESIGNED_URL_MAX_TTL_SECONDS',
  'isPresignedUrlExpired',
  'presignedUrlExpiresAt',
]);

// The authorizations that answer "whose bytes are these" before the read.
const AUTHORIZATION_CALLS = [
  'getUserScopedDb',
  'getClerkAuthUser',
  'getOptionalAuthUser',
  'getRequestIdentity',
  'assertAccountActive',
  'createClaimedUserScopedDb',
  'requireOrganizationAdmin',
];

const CRON_AUTHORIZATION_CALLS = ['verifyCronRequest'];

function routeFiles(dir) {
  const abs = path.join(scanRoot, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const step = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('__')) continue;
        step(full);
      } else if (entry.name === 'route.ts') {
        out.push(path.relative(scanRoot, full).split(path.sep).join('/'));
      }
    }
  };
  step(abs);
  return out.sort();
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const IMPORT_PATTERN = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g;

function importedNames(clause) {
  return clause
    .split(',')
    .map((specifier) =>
      specifier
        .trim()
        .split(/\s+as\s+/)[0]
        ?.replace(/^type\s+/, '')
        .trim(),
    )
    .filter((name) => Boolean(name));
}

// A route that reaches the bucket through a helper beside it is still a route
// that serves bytes, so relative imports are followed rather than trusted.
function blobImports(file, source, seen = new Set()) {
  const named = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[2];
    if (STORAGE_MODULES.includes(specifier)) {
      for (const name of importedNames(match[1])) {
        if (!METADATA_ONLY_IMPORTS.has(name)) named.push(name);
      }
      continue;
    }
    if (!specifier.startsWith('.')) continue;

    const base = path.join(path.dirname(file), specifier);
    for (const candidate of ['.ts', '.tsx', '/index.ts'].map((suffix) => `${base}${suffix}`)) {
      const absolute = path.join(scanRoot, candidate);
      if (seen.has(candidate) || !fs.existsSync(absolute)) continue;
      seen.add(candidate);
      const source2 = stripComments(fs.readFileSync(absolute, 'utf8'));
      if (blobImports(candidate, source2, seen).length > 0) named.push(...importedNames(match[1]));
      break;
    }
  }
  return named;
}

function calls(source, names) {
  return names.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(source));
}

const findings = [];
let blobRoutes = 0;

for (const file of routeFiles(API_ROOT)) {
  const source = stripComments(fs.readFileSync(path.join(scanRoot, file), 'utf8'));
  const imported = blobImports(file, source);
  const used = calls(source, imported);
  if (used.length === 0) continue;
  blobRoutes += 1;

  const isCron = file.startsWith(CRON_PREFIX);
  const expected = isCron ? CRON_AUTHORIZATION_CALLS : AUTHORIZATION_CALLS;
  if (calls(source, expected).length > 0) continue;

  findings.push(
    `${file}: serves object-storage bytes (${used.join(', ')}) without calling one of ` +
      expected.join(', '),
  );
}

if (blobRoutes === 0) {
  console.error('check-blob-route-authz: found no object-storage routes; the module list is stale');
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Object-storage routes missing the shared authorization call:');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(
  `check-blob-route-authz: ${blobRoutes} object-storage routes all authorize their reads`,
);
