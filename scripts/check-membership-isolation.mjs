#!/usr/bin/env node
/**
 * Every statement over a membership table names the workspace it means.
 *
 * Membership, invitations, role grants and group mappings are the tables that
 * decide who may do what, so a statement over one of them that carries no
 * organization predicate reads or writes across tenants. This enumerates them
 * from the SQL in the source rather than from a list of places to look: every
 * template and quoted statement in apps/web that touches one of the tables the
 * migrations define with an `organization_id` column, each checked for that
 * column in its own text. Statements that are correct without it are declared
 * one at a time with the reason, and a declaration that stops matching fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { stripComments } from './lib/module-graph.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const WEB = path.join(scanRoot, 'apps/web');
const MIGRATIONS = path.join(WEB, 'db/neon');
const SCAN_DIRS = ['lib', 'app'];

/**
 * The tables that answer "who is in this workspace and what may they do".
 * Each must carry organization_id in the schema, or this guard is looking at
 * the wrong thing and says so.
 */
export const MEMBERSHIP_TABLES = [
  'organization_members',
  'organization_invitations',
  'organization_member_roles',
  'organization_group_roles',
  'organization_group_managers',
  'organization_admin_delegations',
  'organization_project_access',
  'scim_group_members',
];

const SCOPE = /\borganization_id\b|\bcurrent_app_org_id\b|\bapp_has_org_permission\b/;

/** A statement that ends somebody's membership, and the revocation it owes. */
const ENDS_MEMBERSHIP =
  /delete\s+from\s+(?:public\.)?organization_members\b|update\s+(?:public\.)?organization_members[\s\S]*?status\s*=\s*'(?:suspended|deprovisioned)'/i;
const REVOKE = /\bdeprovisionMember\b/;

/**
 * Where the delete and the revocation sit in different modules, the caller that
 * owes it is named here and checked: it must call the ending function AND
 * revoke. A caller that stops doing either fails.
 */
export const REVOCATION_AT_CALLER = [
  {
    file: 'apps/web/lib/services/organization-membership-service.ts',
    symbol: 'leaveOrganization',
    caller: 'apps/web/app/api/settings/organization/leave/route.ts',
  },
];

/**
 * Statements whose correctness does not depend on a workspace predicate, with
 * the reason each one reads or writes across workspaces. An entry that matches
 * nothing is stale and fails: the code it apologised for has moved on.
 */
export const CROSS_WORKSPACE_STATEMENTS = [
  {
    file: 'apps/web/lib/services/organization-invitation-service.ts',
    match: /set status = 'expired'[\s\S]*?where status = 'pending'/,
    reason:
      'the sweep retires every workspace’s lapsed invitations; a workspace predicate would leave the rest pending forever',
  },
  {
    file: 'apps/web/lib/services/organization-invitation-service.ts',
    match: /where token_hash = \$1/,
    reason:
      'an invitation link names no workspace until the token is looked up; the single-use hash is what finds the one it belongs to',
  },
  {
    file: 'apps/web/lib/services/organization-invitation-service.ts',
    match: /set status = 'accepted'/,
    reason:
      'the row was already resolved from a single-use token hash inside this transaction, so its primary key is the scope',
  },
  {
    file: 'apps/web/lib/services/organization-invitation-service.ts',
    match: /set status = 'declined'/,
    reason:
      'the row was already resolved from a single-use token hash inside this transaction, so its primary key is the scope',
  },
];

function walk(directory, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full, files);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (entry.name.includes('.test.') || entry.name.endsWith('.fixture.ts')) continue;
    files.push(full);
  }
  return files;
}

function extractStatements(source) {
  const statements = [];
  const patterns = [
    /`([^`]*?(?:from|into|update|join)\s+(?:public\.)?[a-z_]+[\s\S]*?)`/gi,
    /'([^'\n]*?(?:from|into|update|join)\s+(?:public\.)?[a-z_]+[^'\n]*?)'/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      if (/^\s*(?:with|select|insert|update|delete)\b/i.test(match[1])) {
        statements.push(match[1]);
      }
    }
  }
  return statements;
}

function lineOf(source, statement) {
  const at = source.indexOf(statement);
  return at < 0 ? 0 : source.slice(0, at).split('\n').length;
}

/** Every table the migrations give an organization_id column. */
function schemaScopedTables() {
  const scoped = new Set();
  let names;
  try {
    names = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'));
  } catch {
    return scoped;
  }
  for (const name of names.sort()) {
    const source = stripComments(fs.readFileSync(path.join(MIGRATIONS, name), 'utf8'));
    const tables = /create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi;
    let match;
    while ((match = tables.exec(source))) {
      if (/\borganization_id\b/i.test(match[2])) scoped.add(match[1].toLowerCase());
    }
    const added =
      /alter table public\.([a-z_]+)[\s\S]{0,400}?add column (?:if not exists )?organization_id/gi;
    while ((match = added.exec(source))) scoped.add(match[1].toLowerCase());
  }
  return scoped;
}

function relative(file) {
  return path.relative(scanRoot, file).replace(/\\/gu, '/');
}

function main() {
  const scoped = schemaScopedTables();
  const failures = [];

  const unscopedTables = MEMBERSHIP_TABLES.filter((table) => !scoped.has(table));
  if (unscopedTables.length > 0) {
    failures.push(
      `${unscopedTables.length} membership table(s) have no organization_id in the schema.\n` +
        '  A table that does not name its workspace cannot be isolated by one.\n' +
        unscopedTables.map((table) => `  ${table}`).join('\n'),
    );
  }

  const tablePattern = new RegExp(`\\b(?:public\\.)?(${MEMBERSHIP_TABLES.join('|')})\\b`);
  const leaks = [];
  const unrevoked = [];
  const usedDeclarations = new Set();
  const usedCallers = new Set();
  let scanned = 0;
  let declared = 0;
  let endings = 0;

  for (const directory of SCAN_DIRS) {
    for (const file of walk(path.join(WEB, directory)).sort()) {
      const fileRelative = relative(file);
      const source = stripComments(fs.readFileSync(file, 'utf8'));
      if (!tablePattern.test(source)) continue;
      const revokes = REVOKE.test(source);
      for (const statement of extractStatements(source)) {
        if (!tablePattern.test(statement)) continue;
        scanned += 1;
        if (ENDS_MEMBERSHIP.test(statement)) {
          endings += 1;
          const delegated = REVOCATION_AT_CALLER.filter((entry) => entry.file === fileRelative);
          if (!revokes && delegated.length === 0) {
            unrevoked.push(
              `${fileRelative}:${lineOf(source, statement)}  ${statement.replace(/\s+/g, ' ').trim().slice(0, 100)}`,
            );
          }
          for (const entry of delegated) {
            usedCallers.add(entry);
            const callerPath = path.join(scanRoot, entry.caller);
            const caller = fs.existsSync(callerPath)
              ? stripComments(fs.readFileSync(callerPath, 'utf8'))
              : '';
            if (!caller.includes(entry.symbol) || !REVOKE.test(caller)) {
              unrevoked.push(
                `${entry.caller} no longer both calls ${entry.symbol} and revokes its credentials`,
              );
            }
          }
        }
        if (SCOPE.test(statement)) continue;
        const declaration = CROSS_WORKSPACE_STATEMENTS.find(
          (entry) => entry.file === fileRelative && entry.match.test(statement),
        );
        if (declaration) {
          usedDeclarations.add(declaration);
          declared += 1;
          continue;
        }
        leaks.push(
          `${fileRelative}:${lineOf(source, statement)}  ${statement.replace(/\s+/g, ' ').trim().slice(0, 120)}`,
        );
      }
    }
  }

  const stale = CROSS_WORKSPACE_STATEMENTS.filter(
    (entry) => !usedDeclarations.has(entry) && fs.existsSync(path.join(scanRoot, entry.file)),
  );
  for (const entry of REVOCATION_AT_CALLER) {
    if (usedCallers.has(entry) || !fs.existsSync(path.join(scanRoot, entry.file))) continue;
    unrevoked.push(
      `${entry.file} no longer ends a membership; drop its REVOCATION_AT_CALLER entry`,
    );
  }

  if (leaks.length > 0) {
    failures.push(
      `${leaks.length} membership statement(s) name no workspace.\n` +
        '  Constrain by organization_id, or declare the statement with the reason it spans workspaces.\n' +
        leaks.map((entry) => `  ${entry}`).join('\n'),
    );
  }
  if (unrevoked.length > 0) {
    failures.push(
      `${unrevoked.length} statement(s) end a membership without revoking what it authorized.\n` +
        '  Dropping the row stops the next request; sessions, API keys and device tokens are\n' +
        '  already live. Call deprovisionMember in the same module.\n' +
        unrevoked.map((entry) => `  ${entry}`).join('\n'),
    );
  }
  if (stale.length > 0) {
    failures.push(
      `${stale.length} cross-workspace declaration(s) match nothing any more.\n` +
        '  Delete them; the set may only shrink.\n' +
        stale.map((entry) => `  ${entry.file}  ${entry.match}`).join('\n'),
    );
  }

  if (failures.length > 0) {
    console.error(`check:membership-isolation failed.\n\n${failures.join('\n\n')}\n`);
    process.exit(1);
  }

  console.log(
    `check:membership-isolation, ${scanned} statement(s) over ${MEMBERSHIP_TABLES.length} ` +
      `membership table(s) each name their workspace, ${declared} declared as crossing one ` +
      `deliberately, ${endings} membership ending(s) each revoking what they authorized, ` +
      `${scoped.size} workspace-scoped tables in the schema.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
