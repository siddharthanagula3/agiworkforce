#!/usr/bin/env node
/**
 * Database isolation gate.
 *
 * The repo runs TWO isolation regimes and it is not obvious from a route which
 * one applies:
 *
 *   1. RLS-enforced — `getUserScopedDb(request)` binds the subject and runs as
 *      the non-BYPASSRLS `app_rls` role, so migrations 0037/0054/0073 police
 *      every row. A forgotten predicate is caught by the database.
 *
 *   2. App-enforced — `getNeonDb()` / `getNeonChatDb()` use the Neon owner
 *      connection, which HAS BYPASSRLS. Every policy is inert on this path and
 *      isolation rests entirely on a hand-written `where user_id = $1`.
 *
 * Regime 2 is the majority of the API surface, so a single forgotten predicate
 * on a user-owned table is a cross-tenant read with no backstop. That class of
 * bug is invisible in review and produces no test failure — exactly the shape
 * that ships. This gate makes it mechanical.
 *
 * The rule: a SQL statement that touches a user-owned table over the owner
 * connection must constrain by owner (`user_id`), by an owner-scoped parent
 * (`conversation_id`, `task_id`, `artifact_id`, `project_id`, `organization_id`),
 * or be explicitly allowlisted below with a reason.
 *
 * Scope: `apps/web/app/api` AND `apps/web/lib`. The service layer is not a
 * second-class caller — 40 modules under `apps/web/lib` open the same BYPASSRLS
 * owner connection, and `docs/engineering/service-layer-architecture.md` moves
 * query bodies OUT of routes and INTO those modules. Scanning routes alone
 * meant this gate's coverage shrank every time the migration it exists to
 * protect made progress.
 *
 * Usage: node scripts/check-db-isolation.mjs
 * Exit:  0 = clean · 1 = at least one unscoped statement
 *
 * NOT covered (tracked as CRIT-015, still open): this gate reasons about
 * statements, not about schema. A NEW tenant-scoped table can land in
 * `apps/web/db/neon` with neither an RLS policy nor an entry in
 * USER_OWNED_TABLES below, and nothing here fails. Eleven tables are in that
 * state today.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

/**
 * Tables whose rows belong to a specific user. Derived from the migrations:
 * every table carrying a `user_id` column, plus the child tables that inherit
 * ownership through a parent FK.
 */
const USER_OWNED_TABLES = new Set([
  'web_conversations',
  'web_messages',
  'web_artifacts',
  'web_artifact_versions',
  'user_projects',
  'project_knowledge_files',
  'user_memories',
  'media_assets',
  'scheduled_tasks',
  'scheduled_task_runs',
  'cloud_agent_runs',
  'cloud_agent_events',
  'cloud_agent_approval_checkpoints',
  'cloud_agent_execution_operations',
  'user_connectors',
  'user_custom_connectors',
  'connector_tool_permissions',
  'api_keys',
  'managed_usage_requests',
  'managed_usage_request_extensions',
  'usage_events',
  'credit_transactions',
  'token_credits',
  'subscriptions',
  'user_settings',
  'user_memories',
  'conversation_tags',
  'conversation_branches',
  'conversation_branch_messages',
  'chat_folders',
  'message_bookmarks',
  'message_reactions',
  'search_history',
  'notifications',
  'user_shortcuts',
  'support_tickets',
  'support_ticket_replies',
  'agent_tools',
  'agent_tool_executions',
  'desktop_devices',
  'mobile_devices',
  'sync_data',
  'github_installations',
  'messaging_connections',
  'email_preferences',
  'user_two_factor',
  'account_sessions',
  'security_audit_logs',
  'feedback',
  // Organization sharing grants (0086). Not user-owned, but tenant-owned: a
  // statement that touches one over the BYPASSRLS connection without an
  // `organization_id` predicate is a cross-ORG read, which is the same class of
  // defect this gate exists to catch.
  'organization_shared_projects',
  'organization_project_access',
  'organization_shared_connectors',
]);

/** Tokens that prove a statement is constrained to one owner or one org. */
const SCOPE_TOKENS = [
  'user_id',
  'organization_id',
  'conversation_id',
  'task_id',
  'artifact_id',
  'project_id',
  'ticket_id',
  'installation_id',
  'device_id',
  'run_id',
  'session_id',
];

/**
 * Statements that legitimately span users. Each entry must say WHY, because an
 * unexplained allowlist entry is how this gate quietly stops working.
 *
 * An entry with `tables` exempts that file ONLY for the named tables; every
 * other user-owned table in the same file is still policed. Prefer that form —
 * a bare `match` retires a whole file, including code written after the reason
 * was true.
 */
const ALLOWLIST = [
  {
    match: /api\/cron\//,
    reason: 'cron routes are platform-scoped by design and run without a user',
  },
  {
    match: /api\/stripe-webhook/,
    reason: 'webhook resolves its own subject from the Stripe event',
  },
  {
    match: /api\/webhooks\//,
    reason: 'inbound webhooks resolve their subject from the signed payload',
  },
  { match: /api\/admin\//, reason: 'platform-admin routes are deliberately cross-user' },
  { match: /api\/health/, reason: 'health probe touches no user data' },
  { match: /api\/releases/, reason: 'release metadata is global, not user-owned' },
  { match: /api\/waitlist/, reason: 'waitlist rows are pre-account' },
  {
    match: /lib\/server\/account-erasure\.ts$/,
    tables: ['media_assets'],
    reason:
      'eraseUserMedia() deletes by id from a list it just read with `where user_id = $1`, ' +
      'after the R2 objects are gone; the id list IS the owner constraint',
  },
  {
    match: /lib\/services\/push-notification-service\.ts$/,
    tables: ['mobile_devices'],
    reason:
      'invalidateTokens() clears the exact push tokens Expo reported as unregistered; a token ' +
      'is a device credential, not a user, and the whole point is that it may belong to anyone',
  },
  {
    match: /lib\/services\/schedule-service\.ts$/,
    tables: ['scheduled_tasks'],
    reason:
      'the scheduler worker writes back to the task id it claimed from the due-set in the same ' +
      'transaction; there is no request subject to constrain by',
  },
  {
    match: /lib\/services\/security-monitoring-service\.ts$/,
    tables: ['security_audit_logs'],
    reason:
      'getTopIpAddresses() is platform abuse detection — per-user counts cannot detect an ' +
      'attacker spraying many accounts from one IP',
  },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '__tests__')
        continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Extract template-literal and quoted SQL bodies that read or write a table. */
function extractStatements(source) {
  const statements = [];
  const re = /`([^`]*?(?:from|into|update|join)\s+(?:public\.)?[a-z_]+[\s\S]*?)`/gi;
  let m;
  while ((m = re.exec(source))) {
    // The span between two unrelated backticks is not a query. Eight such spans
    // were being "scanned" — JS bodies containing the word `from` in a comment —
    // and one of them is prose naming a user-owned table, which would otherwise
    // have to be allowlisted as if it were a real cross-user statement. A query
    // opens with a query verb; nothing else does.
    if (/^\s*(?:with|select|insert|update|delete)\b/i.test(m[1])) statements.push(m[1]);
  }
  return statements;
}

function tablesIn(sql) {
  const found = new Set();
  const re = /\b(?:from|into|update|join)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const t = m[1].toLowerCase();
    if (USER_OWNED_TABLES.has(t)) found.add(t);
  }
  return [...found];
}

/**
 * Does `name` resolve, directly or through one level of indirection, to a
 * declaration that mentions a scope token?
 *
 * Predicates and column lists are routinely assembled across two variables
 * (`const cols = [...baseColumns, ...]` where `baseColumns` holds 'user_id'),
 * so a single-level lookup reports correct code as unscoped. Depth is bounded
 * so this stays a cheap textual check rather than a dataflow analysis.
 */
function resolvesToScope(source, name, depth) {
  if (depth < 0) return false;
  const decl = new RegExp(`(?:const|let|var)\\s+${name}\\b[\\s\\S]{0,600}`, 'g');
  const blocks = source.match(decl);
  if (!blocks) return false;
  for (const block of blocks) {
    if (SCOPE_TOKENS.some((tok) => block.toLowerCase().includes(tok))) return true;
    if (depth > 0) {
      const referenced = [...block.matchAll(/\.\.\.([A-Za-z_$][\w$]*)|\b([A-Za-z_$][\w$]*)\b/g)]
        .map((m) => m[1] || m[2])
        .filter((n) => n && n !== name);
      for (const next of new Set(referenced)) {
        if (resolvesToScope(source, next, depth - 1)) return true;
      }
    }
  }
  return false;
}

const errors = [];
const files = [
  ...walk(path.join(root, 'apps/web/app/api')),
  ...walk(path.join(root, 'apps/web/lib')),
];
let scanned = 0;
let ownerConnectionFiles = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  if (!/getNeonDb\(\)|getNeonChatDb\(\)/.test(source)) continue;
  ownerConnectionFiles += 1;
  const exemptions = ALLOWLIST.filter((a) => a.match.test(rel));
  if (exemptions.some((a) => !a.tables)) continue;
  const exemptTables = new Set(exemptions.flatMap((a) => a.tables));

  for (const sql of extractStatements(source)) {
    const tables = tablesIn(sql).filter((t) => !exemptTables.has(t));
    if (tables.length === 0) continue;
    scanned += 1;
    const lower = sql.toLowerCase();
    if (SCOPE_TOKENS.some((tok) => lower.includes(tok))) continue;
    // The predicate is often assembled in a variable (`where ${clauses.join(' and ')}`).
    // Resolve each interpolated identifier back to its declaration in the same
    // file and accept the statement when that declaration seeds a scope token.
    // Without this the gate fires on correct code, and a gate that cries wolf
    // gets switched off.
    const interpolated = [...sql.matchAll(/\$\{\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    const resolvedByVariable = interpolated.some((name) => resolvesToScope(source, name, 2));
    if (resolvedByVariable) continue;
    errors.push(
      `${rel}: statement over user-owned table(s) [${tables.join(', ')}] has no owner constraint ` +
        `on the BYPASSRLS owner connection.\n    ${sql.replace(/\s+/g, ' ').trim().slice(0, 160)}`,
    );
  }
}

if (errors.length > 0) {
  console.error('Database isolation check FAILED:\n');
  for (const e of errors) console.error(`- ${e}\n`);
  console.error(
    `\nEach statement above runs on the Neon owner role, which HAS BYPASSRLS, so no policy\n` +
      `applies. Constrain it by owner, move the route to getUserScopedDb(request), or add an\n` +
      `allowlist entry in scripts/check-db-isolation.mjs WITH a reason.`,
  );
  process.exit(1);
}

console.log(
  `Database isolation check passed (${scanned} owner-connection statements over user-owned ` +
    `tables across ${ownerConnectionFiles} route and service modules, all owner-constrained).`,
);
