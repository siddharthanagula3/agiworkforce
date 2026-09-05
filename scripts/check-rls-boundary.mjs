#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { stripComments } from './lib/module-graph.mjs';
import { USER_OWNED_TABLES } from './lib/db-isolation-tables.mjs';

const root = process.cwd();
const ALLOWLIST_PATH = 'scripts/config/rls-boundary-allowlist.json';
const SCAN_ROOTS = ['apps/web/app', 'apps/web/lib', 'apps/web/features'];
const PENDING_REASON = 'pending scoped migration';
const MIN_REASON_LENGTH = 10;
const IGNORED_DIRECTORY_NAMES = new Set(['node_modules', '.next', '__tests__']);
const ALLOWED_TOP_LEVEL_KEYS = new Set(['schemaVersion', 'entries']);
const ALLOWED_ENTRY_KEYS = new Set(['path', 'reason']);

const UNSCOPED_HANDLE_IDENTIFIERS = ['getNeonDb', 'getNeonChatDb', 'getStripeWebhookDb'];
const GET_NEON_DB_RE = new RegExp(`\\b(?:${UNSCOPED_HANDLE_IDENTIFIERS.join('|')})\\b`);
const TABLE_PATTERNS = new Map(
  [...USER_OWNED_TABLES].map((table) => [table, new RegExp(`\\b${table}\\b`)]),
);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function findOffendingTables(strippedSource) {
  const found = [];
  for (const [table, pattern] of TABLE_PATTERNS) {
    if (pattern.test(strippedSource)) found.push(table);
  }
  return found;
}

function loadAllowlist() {
  const abs = path.join(root, ALLOWLIST_PATH);
  if (!fs.existsSync(abs)) return { schemaVersion: 1, entries: [] };
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function validateAllowlist(allowlist, errors) {
  for (const key of Object.keys(allowlist)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      errors.push(`${ALLOWLIST_PATH}: unknown top-level key "${key}".`);
    }
  }
  const seen = new Set();
  for (const entry of allowlist.entries ?? []) {
    for (const key of Object.keys(entry)) {
      if (!ALLOWED_ENTRY_KEYS.has(key)) {
        errors.push(
          `${ALLOWLIST_PATH}: entry ${entry.path ?? '(unknown)'} has unknown key "${key}".`,
        );
      }
    }
    if (!entry.path || typeof entry.path !== 'string') {
      errors.push(`${ALLOWLIST_PATH}: an entry is missing a "path" string.`);
      continue;
    }
    if (seen.has(entry.path)) errors.push(`${ALLOWLIST_PATH}: duplicate entry for ${entry.path}.`);
    seen.add(entry.path);
    if (
      !entry.reason ||
      typeof entry.reason !== 'string' ||
      entry.reason.trim().length < MIN_REASON_LENGTH
    ) {
      errors.push(
        `${ALLOWLIST_PATH}: entry ${entry.path} needs a one-line reason of at least ` +
          `${MIN_REASON_LENGTH} characters.`,
      );
    }
  }
}

function findOffenders() {
  const offenders = new Map();
  const files = SCAN_ROOTS.flatMap((dir) => walk(path.join(root, dir)));
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    const stripped = stripComments(source);
    if (!GET_NEON_DB_RE.test(stripped)) continue;
    const tables = findOffendingTables(stripped);
    if (tables.length === 0) continue;
    offenders.set(rel, tables);
  }
  return offenders;
}

const allowlist = loadAllowlist();
const errors = [];
validateAllowlist(allowlist, errors);

const allowlistByPath = new Map((allowlist.entries ?? []).map((entry) => [entry.path, entry]));
const offenders = findOffenders();

for (const [rel, tables] of offenders) {
  if (allowlistByPath.has(rel)) continue;
  errors.push(
    `${rel}: reaches the BYPASSRLS getNeonDb() connection and references user-owned table(s) ` +
      `[${tables.join(', ')}], with no entry in ${ALLOWLIST_PATH}.`,
  );
}

const stale = (allowlist.entries ?? [])
  .map((entry) => entry.path)
  .filter((relPath) => !offenders.has(relPath));

if (stale.length > 0) {
  errors.push(
    `${ALLOWLIST_PATH}: ${stale.length} entr(ies) no longer offend and must be removed, this ` +
      `list only ratchets down:\n  ${stale.join('\n  ')}`,
  );
}

if (errors.length > 0) {
  console.error('RLS import-boundary check FAILED:\n');
  for (const error of errors) console.error(`- ${error}\n`);
  console.error(
    'Each file above reaches getNeonDb(), which runs BYPASSRLS, while touching a user-owned ' +
      'table. Move the call site to getUserScopedDb()/getCurrentUserRlsDb() from ' +
      'apps/web/lib/server/rls-db.ts, or add an entry to ' +
      `${ALLOWLIST_PATH} with an honest one-line reason (cron, webhook, admin, operator, SCIM, ` +
      'waitlist, or a documented reason the row id already carries the owner constraint).',
  );
  process.exit(1);
}

const pending = (allowlist.entries ?? []).filter((entry) => entry.reason === PENDING_REASON).length;

console.log(
  `RLS import-boundary check passed (${offenders.size} file(s) reach getNeonDb() over a ` +
    `user-owned table, all allowlisted in ${ALLOWLIST_PATH}; ${pending} marked ${PENDING_REASON}).`,
);
