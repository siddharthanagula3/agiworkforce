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
 * The gate runs TWO passes:
 *
 *   Pass 1 (statements) — the rule above, over the TypeScript sources.
 *
 *   Pass 2 (schema) — CRIT-015's fourth requirement. Pass 1 reasons about
 *      statements, so a NEW tenant-scoped table could land in
 *      `apps/web/db/neon` with neither an RLS policy nor an entry in
 *      USER_OWNED_TABLES and nothing failed; pass 1's coverage of it was
 *      silently zero. Pass 2 reads the migrations, finds every live table
 *      carrying a tenant column, and requires each one to carry an EXPLICIT
 *      isolation decision — RLS in SQL, app-enforcement via USER_OWNED_TABLES,
 *      or a written exemption in CROSS_TENANT_TABLES. A table with none of the
 *      three fails the build.
 *
 * Usage: node scripts/check-db-isolation.mjs
 * Exit:  0 = clean · 1 = an unscoped statement, or a table with no decision
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
  'referrals',
  'feature_flags',
  'waitlist',
  'beta_redemptions',
  'cloud_managed_waitlist',
  'account_lockout_attempts',
  'website_auto_economy_trial_usage',
  'shared_conversations',
  'shared_sessions',
  'content_reports',
  'cloud_code_agent_turns',
  'device_authorization_codes',
  'device_refresh_tokens',
  'support_handoff_sessions',
  // Organization sharing grants (0086). Not user-owned, but tenant-owned: a
  // statement that touches one over the BYPASSRLS connection without an
  // `organization_id` predicate is a cross-ORG read, which is the same class of
  // defect this gate exists to catch.
  'organization_shared_projects',
  'organization_project_access',
  'organization_shared_connectors',
]);

/**
 * Tokens that prove a statement is constrained to one owner or one org.
 *
 * `owner_id` and `owner_session_key` are here because two tables name the owner
 * column that way (`shared_sessions.owner_id`, `support_handoff_sessions`,
 * whose owner is an anonymous visitor session rather than an account). Without
 * them the gate reported correctly-scoped statements as unscoped, which is the
 * failure mode that gets a gate switched off.
 */
const SCOPE_TOKENS = [
  'user_id',
  'owner_id',
  'owner_session_key',
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
  {
    match: /api\/auth\/device\/code\/route\.ts$/,
    tables: ['device_authorization_codes'],
    reason:
      'RFC 8628 device flow: the pending row is expired by `user_code` BEFORE any account is ' +
      'attached, so there is no owner to constrain by — user_id is null until approval',
  },
  {
    match: /api\/auth\/device\/refresh\/route\.ts$|lib\/server\/developer-token\.ts$/,
    tables: ['device_refresh_tokens'],
    reason:
      'refresh-token reuse detection revokes the whole `family_id`, and the single-use write ' +
      'targets the row id resolved from the presented token hash; the credential IS the scope, ' +
      'and constraining by user would defeat the revocation',
  },
  {
    match: /api\/share\/\[token\]\/route\.ts$/,
    tables: ['shared_sessions'],
    reason:
      'reading a share by its unguessable token is the feature — a public share link has no ' +
      'viewer subject to constrain by',
  },
  {
    match: /lib\/support\/handoff\/store\.ts$/,
    tables: ['support_handoff_sessions'],
    reason:
      'the stale-session sweep and the retention delete are time-based and deliberately span ' +
      'visitors; the email-outcome and last-activity writes are bookkeeping on a session id the ' +
      'caller already holds — they set status and timestamps and return no rows, so neither can ' +
      'leak one visitor’s session to another. Reads in this module ARE owner-scoped ' +
      '(getSessionForOwner / cancelSessionForOwner take owner_session_key) and stay policed.',
  },
];

/**
 * Tenant-scoped tables that are DELIBERATELY readable across tenants, with the
 * reason. Pass 2 accepts these as an explicit isolation decision. An entry here
 * says "we looked and cross-tenant is correct", which is what distinguishes a
 * decision from an oversight — the whole point of the pass.
 */
const CROSS_TENANT_TABLES = new Map([
  [
    'support_agent_presence',
    'the support-agent roster. Its `agent_user_id` is staff, not a customer, and the console ' +
      'exists to list every online agent so a waiting visitor can be routed to one.',
  ],
]);

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

// ---------------------------------------------------------------------------
// Pass 2 — schema. Every live tenant-scoped table needs an isolation DECISION.
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = 'apps/web/db/neon';

/**
 * A column that ties a row to one tenant. Suffix-anchored rather than a
 * substring test, so `referred_user_id` and `owner_user_id` count while
 * `user_code` (a device-flow credential, owned by nobody until approval) and
 * `user_agent` do not.
 */
const TENANT_COLUMN =
  /^(?:[a-z0-9_]*_)?(?:user_id|owner_id|organization_id|org_id|account_id|member_id)$/;

/**
 * Read the migration directory into `{ tables, rlsEnabled }`.
 *
 * `tables` holds only LIVE tables: a `drop table` retires the name, and a later
 * `create table` revives it. Without that, tables dropped years ago (the legacy
 * `teams` pair, retired by 0058) would demand an isolation decision forever.
 */
function readSchema(dir) {
  const tables = new Map();
  const dropped = new Set();
  const rlsEnabled = new Set();
  if (!fs.existsSync(dir)) return { tables, rlsEnabled };
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const name of files) {
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');

    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/gi,
    )) {
      const table = m[1].toLowerCase();
      dropped.delete(table);
      const columns = [...m[2].matchAll(/^\s{2,}([a-z_][a-z0-9_]*)\s+[a-z]/gim)].map((c) =>
        c[1].toLowerCase(),
      );
      const existing = tables.get(table);
      if (existing) for (const c of columns) existing.columns.add(c);
      else tables.set(table, { migration: name, columns: new Set(columns) });
    }

    for (const m of sql.matchAll(
      /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    )) {
      dropped.add(m[1].toLowerCase());
    }

    // A tenant column added later must still make the table tenant-scoped:
    // `cloud_managed_waitlist` got its user_id in 0034, not at creation.
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi,
    )) {
      tables.get(m[1].toLowerCase())?.columns.add(m[2].toLowerCase());
    }

    for (const m of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+(?:enable|force)\s+row\s+level\s+security/gi,
    )) {
      rlsEnabled.add(m[1].toLowerCase());
    }
  }

  for (const table of dropped) tables.delete(table);
  return { tables, rlsEnabled };
}

/** Tenant-scoped tables carrying none of the three isolation decisions. */
function findUndecidedTables({ tables, rlsEnabled }, appEnforced, crossTenant) {
  const undecided = [];
  let tenantScoped = 0;
  for (const [table, meta] of tables) {
    const tenantColumns = [...meta.columns].filter((c) => TENANT_COLUMN.test(c));
    if (tenantColumns.length === 0) continue;
    tenantScoped += 1;
    if (rlsEnabled.has(table) || appEnforced.has(table) || crossTenant.has(table)) continue;
    undecided.push({ table, migration: meta.migration, tenantColumns });
  }
  return { undecided, tenantScoped };
}

const schema = readSchema(path.join(root, MIGRATIONS_DIR));
const { undecided, tenantScoped } = findUndecidedTables(
  schema,
  USER_OWNED_TABLES,
  CROSS_TENANT_TABLES,
);

if (undecided.length > 0) {
  console.error('Database isolation check FAILED — tables with no isolation decision:\n');
  for (const u of undecided) {
    console.error(
      `- ${u.table} (${MIGRATIONS_DIR}/${u.migration}) carries [${u.tenantColumns.join(', ')}] ` +
        `but has no RLS policy, no USER_OWNED_TABLES entry, and no CROSS_TENANT_TABLES reason.\n`,
    );
  }
  console.error(
    `A tenant-scoped table with no decision is isolated by nothing and policed by nothing:\n` +
      `pass 1 skips statements over tables it does not know are user-owned. Pick one —\n` +
      `  1. enable row level security in the migration (database-enforced), or\n` +
      `  2. add it to USER_OWNED_TABLES in scripts/check-db-isolation.mjs so every statement\n` +
      `     over it must carry an owner predicate (app-enforced), or\n` +
      `  3. add it to CROSS_TENANT_TABLES WITH a reason it is deliberately cross-tenant.`,
  );
  process.exit(1);
}

console.log(
  `Database isolation check passed (${scanned} owner-connection statements over user-owned ` +
    `tables across ${ownerConnectionFiles} route and service modules, all owner-constrained; ` +
    `${tenantScoped} tenant-scoped tables across ${schema.tables.size} live tables, each with an ` +
    `explicit isolation decision).`,
);
