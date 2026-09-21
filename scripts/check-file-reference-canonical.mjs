#!/usr/bin/env node

// One description of a file, everywhere. This guard enumerates the roles the
// contract declares, every site in the tree that mints a file reference, and
// every module that caps extracted text, then fails on a borrowed identity, a
// missing role or a second copy of the one limit.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT = 'packages/contracts/types/src/file-reference.ts';
export const MODEL = 'packages/contracts/types/src/file-model.ts';

/** Every fact the canonical reference has to answer, from the checklist. */
export const REQUIRED_ROLES = Object.freeze([
  'fileId',
  'owner',
  'storageBackend',
  'mediaType',
  'size',
  'checksum',
  'name',
  'version',
  'acl',
  'created',
  'source',
  'availability',
  'parsedStatus',
  'indexStatus',
]);

const MINT_CALLS = /(createFileReference|createManagedFile|localDeviceManagedFile)\s*\(/g;

/** An identity taken from one of these is an address or a grant, not a name. */
const BORROWED_IDENTITY =
  /\b(?:uri|url|href|signedUrl|downloadUrl|storage_url|storageUrl|shareUrl|key|pathname|file_path|filePath|providerFileId|provider_file_id)\b/;

/**
 * Modules that still declare their own copy of the extracted-text cap. Each
 * names why it is not fixed here; the guard refuses a new one.
 */
export const TEXT_LIMIT_BASELINE = Object.freeze({
  'apps/web/lib/server/pdf-attachment-content.ts':
    'owned by the pdf extraction lane; change MAX_PDF_TEXT_CHARS to MAX_FILE_TEXT_CHARS there',
  'apps/web/lib/server/project-knowledge-extraction.ts':
    'owned by the project knowledge lane; change MAX_EXTRACTED_PROJECT_TEXT_CHARS to MAX_FILE_TEXT_CHARS there',
});

const TEXT_LIMIT_DECLARATION = /export const MAX_[A-Z_]*TEXT_CHARS\s*=\s*([0-9_]+)\s*;/;

/** A module that turns file bytes into text; a cap on page text is another question. */
const READS_FILE_BYTES = /\b(?:Buffer|Uint8Array)\b/;

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  'out',
  'coverage',
  'target',
  'generated',
]);

export function sourceFiles(root, scanRoot = root) {
  const found = [];
  const walk = (directory) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      found.push(path.relative(scanRoot, full).split(path.sep).join('/'));
    }
  };
  for (const top of ['apps', 'packages']) walk(path.join(root, top));
  return found.sort();
}

function read(scanRoot, relativePath) {
  try {
    return fs.readFileSync(path.join(scanRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

/** The role names the contract declares, read from the two registries. */
export function declaredRoles(contractSource, modelSource) {
  const roles = new Map();
  for (const source of [contractSource, modelSource]) {
    const block = /_ROLES\s*=\s*\{([\s\S]*?)\}\s*as const/.exec(source ?? '');
    if (!block) continue;
    for (const entry of block[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) {
      roles.set(entry[1], entry[2]);
    }
  }
  return roles;
}

/** The fields the FileReference and ManagedFile interfaces actually declare. */
export function declaredFields(contractSource, modelSource) {
  const fields = new Set();
  for (const [source, name] of [
    [contractSource, 'FileReference'],
    [modelSource, 'ManagedFile'],
  ]) {
    const block = new RegExp(`interface ${name}[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(source ?? '');
    if (!block) continue;
    for (const entry of block[1].matchAll(/^\s*(\w+)\??:/gm)) fields.add(entry[1]);
  }
  return fields;
}

/** The expression each mint site passes as the file's identity. */
export function mintedIdentities(source) {
  const identities = [];
  for (const call of source.matchAll(MINT_CALLS)) {
    const from = call.index + call[0].length;
    const body = source.slice(from, from + 600);
    const id = /(?:^|[\s,{])(?:id|fileId)\s*:\s*([^,\n]+)/.exec(body);
    if (id) identities.push({ callee: call[1], expression: id[1].trim() });
  }
  return identities;
}

export function evaluate(scanRoot) {
  const failures = [];
  const contractSource = read(scanRoot, CONTRACT);
  const modelSource = read(scanRoot, MODEL);

  if (contractSource === null || modelSource === null) {
    return {
      failures: [`${CONTRACT} or ${MODEL} is missing; nothing describes a file.`],
      mints: 0,
    };
  }

  const roles = declaredRoles(contractSource, modelSource);
  const fields = declaredFields(contractSource, modelSource);
  for (const role of REQUIRED_ROLES) {
    const field = roles.get(role);
    if (!field) {
      failures.push(`the canonical file reference answers no "${role}" question`);
      continue;
    }
    if (!fields.has(field)) {
      failures.push(`role "${role}" names field "${field}", which no file interface declares`);
    }
  }

  const byField = new Map();
  for (const [role, field] of roles) {
    const first = byField.get(field);
    if (first) failures.push(`field "${field}" answers both "${first}" and "${role}"`);
    else byField.set(field, role);
  }

  let mints = 0;
  const files = sourceFiles(scanRoot);
  for (const relativePath of files) {
    const source = read(scanRoot, relativePath);
    if (source === null) continue;

    if (relativePath !== CONTRACT && relativePath !== MODEL) {
      for (const { callee, expression } of mintedIdentities(source)) {
        mints += 1;
        if (BORROWED_IDENTITY.test(expression)) {
          failures.push(
            `${relativePath} mints a file through ${callee} with id ${expression}, which is an ` +
              `address or an access grant rather than an identity`,
          );
        }
      }
    }

    const limit = TEXT_LIMIT_DECLARATION.exec(source);
    if (!limit) continue;
    if (relativePath === CONTRACT) continue;
    if (!READS_FILE_BYTES.test(source)) continue;
    if (Object.hasOwn(TEXT_LIMIT_BASELINE, relativePath)) continue;
    if (/MAX_FILE_TEXT_CHARS/.test(source)) continue;
    failures.push(
      `${relativePath} declares its own extracted-text cap (${limit[1]}); import ` +
        `MAX_FILE_TEXT_CHARS instead so one change moves every extractor`,
    );
  }

  for (const stale of Object.keys(TEXT_LIMIT_BASELINE)) {
    const source = read(scanRoot, stale);
    if (
      source === null ||
      !TEXT_LIMIT_DECLARATION.test(source) ||
      !READS_FILE_BYTES.test(source) ||
      /MAX_FILE_TEXT_CHARS/.test(source)
    ) {
      failures.push(`stale baseline entry: ${stale} no longer declares its own cap`);
    }
  }

  return { failures, mints };
}

function main() {
  const rootIndex = process.argv.indexOf('--root');
  const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : REPO_ROOT;
  const { failures, mints } = evaluate(scanRoot);

  if (failures.length === 0) {
    console.log(
      `check-file-reference-canonical: ${REQUIRED_ROLES.length} roles declared, ${mints} mint ` +
        `sites carry a minted identity, ${Object.keys(TEXT_LIMIT_BASELINE).length} module(s) ` +
        `still hold their own text cap.`,
    );
    process.exit(0);
  }

  console.error('Files that are not described the one canonical way:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n${failures.length} finding(s).`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
