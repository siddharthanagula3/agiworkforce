#!/usr/bin/env node
import fs from 'node:fs';
import { stripComments } from './lib/module-graph.mjs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

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
  'organization_shared_projects',
  'organization_project_access',
  'organization_shared_connectors',
]);

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

const SCOPE_TOKEN_RE = new RegExp(`\\b(?:${SCOPE_TOKENS.join('|')})\\b`);

function mentionsScopeToken(lowercasedSql) {
  return SCOPE_TOKEN_RE.test(lowercasedSql);
}

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
    match: /lib\/services\/waitlistService\.ts$/,
    tables: ['cloud_managed_waitlist', 'waitlist'],
    reason:
      'the same pre-account rows the api/waitlist entry retires, reached through the service ' +
      'rather than the route: a waitlist row is an email captured before any account exists, ' +
      'so there is no owner to constrain by',
  },
  {
    match: /lib\/server\/security-log-retention\.ts$/,
    tables: ['security_audit_logs'],
    reason:
      'retention sweep over the whole audit log, reached only from api/cron and api/admin ' +
      '(both already retired above). It deletes by age, not by subject: constraining by owner ' +
      "would leave every other tenant's expired rows unpurged",
  },
  {
    match: /lib\/server\/content-report-triage\.ts$/,
    tables: ['content_reports'],
    reason:
      'moderation triage queue, reached only from api/admin/content-reports (which the ' +
      "api/admin entry already retires). Reading every reporter's rows is the queue's " +
      'purpose: constraining by owner would show a moderator only their own reports',
  },
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
    functions: [
      'listFreshOnlineAgents',
      'getSessionById',
      'claimExpiredWaitingSession',
      'claimExpiredWaitingBatch',
      'recordEmailOutcome',
      'listWaitingQueue',
      'claimSessionForAgent',
      'appendHandoffMessage',
      'closeIdleConnectedSessions',
      'purgeOldHandoffSessions',
    ],
    reason:
      'a handoff session is owned by an anonymous VISITOR, and the other side of the feature is ' +
      'staff: listFreshOnlineAgents (per-agent load count), getSessionById and listWaitingQueue ' +
      '(agent console), claimSessionForAgent (an agent taking any waiting visitor) all span ' +
      'visitors by design — their `agent_user_id` is a staff id and must NOT be read as an owner ' +
      'predicate. claimExpiredWaitingSession / claimExpiredWaitingBatch / ' +
      'closeIdleConnectedSessions / purgeOldHandoffSessions are time-based sweeps. ' +
      'recordEmailOutcome and appendHandoffMessage’s last-activity write are bookkeeping on a ' +
      'session id the caller already holds — they set status and timestamps and return no rows. ' +
      'FUNCTION-SCOPED ON PURPOSE: getSessionForOwner and cancelSessionForOwner are NOT listed, ' +
      'so they stay policed and deleting `and owner_session_key = $2` from either one fails this ' +
      'gate. That regression was green before this entry was narrowed.',
  },
  {
    match: /api\/shared\/route\.ts$/,
    tables: ['shared_conversations'],
    functions: ['handleGet'],
    reason:
      'reading a shared conversation by its unguessable UUID v4 token is the feature — a public ' +
      'share link has no viewer subject to constrain by. Scoped to handleGet so the POST insert, ' +
      'which must carry user_id, stays policed.',
  },
  {
    match: /lib\/services\/api-key-service\.ts$/,
    tables: ['api_keys'],
    functions: ['verifyKey'],
    reason:
      'verifyKey stamps last_used_at on the row id it just resolved from the presented key and ' +
      'confirmed with Argon2; the credential IS the subject, and there is no request user to ' +
      'constrain by. createApiKey/listApiKeys/revokeApiKey stay policed.',
  },
  {
    match: /lib\/services\/cloud-code-agent-service\.ts$/,
    tables: ['cloud_code_agent_turns'],
    functions: ['executePersistedAgentTurn'],
    reason:
      'every write here targets `turnId`, which the caller obtained from an insert keyed on ' +
      '(user_id, idempotency_key) with the authenticated owner (startCloudCodeAgentTurn) or from ' +
      'a read carrying `and user_id = $3` (decideCloudCodeAgentApproval). The id IS the owner ' +
      'constraint. startCloudCodeAgentTurn’s own insert stays policed.',
  },
  {
    match: /lib\/services\/cloud-code-agent-approval-service\.ts$/,
    tables: ['cloud_code_agent_turns'],
    functions: ['decideCloudCodeAgentApproval'],
    reason:
      'the resume UPDATE re-states the turn id that the same function loaded earlier with a ' +
      'select carrying `and user_id = $3`; the join in listCloudCodeAgentApprovals and the ' +
      'expiry sweep both carry t.user_id and stay policed.',
  },
];

const CROSS_TENANT_TABLES = new Map([
  [
    'support_agent_presence',
    'the support-agent roster. Its `agent_user_id` is staff, not a customer, and the console ' +
      'exists to list every online agent so a waiting visitor can be routed to one.',
  ],
  [
    'provider_cost_events',
    'a cost-of-goods record of what a request cost US, not what a customer was charged. Its ' +
      '`user_id` is nullable attribution that account erasure nulls while the cost row survives ' +
      '(0127). Every read goes through the platform-wide `cogs_summary()` aggregate from a cron ' +
      'route; no user-facing path selects from it, so there is no tenant to scope a read to.',
  ],
  [
    'cogs_adjustments',
    'the non-provider half of the same ledger — processing fees, refunds, chargebacks, discounts ' +
      'and goodwill. Same shape and same reason as `provider_cost_events` above.',
  ],
]);

const UNPOLICED_APP_ENFORCED_TABLES = new Map([
  ...[
    'account_lockout_attempts',
    'account_sessions',
    'agent_tool_executions',
    'agent_tools',
    'chat_folders',
    'message_bookmarks',
    'message_reactions',
    'search_history',
    'shared_conversations',
    'support_ticket_replies',
    'support_tickets',
    'user_shortcuts',
    'messaging_connections',
  ].map((t) => [
    t,
    'only query site is the interpolated-table erasure loop in ' +
      'lib/server/account-erasure.ts, which deletes `where ${column} = $1` from ' +
      'USER_SCOPED_TABLES; owner-scoped, but not attributable to a table by a textual scan',
  ]),
  [
    'waitlist',
    'real SQL lives in app/api/waitlist/route.ts, retired wholesale by the bare `api/waitlist` ' +
      'ALLOWLIST entry (waitlist rows are pre-account). The insert does carry user_id.',
  ],
  [
    'cloud_managed_waitlist',
    'real SQL lives in app/api/waitlist/public and /cloud-managed, retired wholesale by the same ' +
      'bare `api/waitlist` ALLOWLIST entry.',
  ],
  [
    'feature_flags',
    'no SQL anywhere in the repo. The `feature_flags` in app/api/me/route.ts is a plain JS object ' +
      'assembled from entitlements, not a read of this table.',
  ],
  [
    'referrals',
    'no query site at all — the table is provisioned by 0016_misc.sql and nothing reads or ' +
      'writes it yet.',
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

function extractStatements(source) {
  const statements = [];
  const patterns = [
    /`([^`]*?(?:from|into|update|join)\s+(?:public\.)?[a-z_]+[\s\S]*?)`/gi,
    /'([^'\n]*?(?:from|into|update|join)\s+(?:public\.)?[a-z_]+[^'\n]*?)'/gi,
    /"([^"\n]*?(?:from|into|update|join)\s+(?:public\.)?[a-z_]+[^"\n]*?)"/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source))) {
      if (/^\s*(?:with|select|insert|update|delete)\b/i.test(m[1]))
        statements.push({ sql: m[1], index: m.index });
    }
  }
  return statements;
}

const NOT_A_DECLARATION = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'throw',
  'yield',
  'await',
  'typeof',
  'void',
  'delete',
  'new',
  'else',
  'do',
  'try',
  'case',
  'with',
  'in',
  'of',
  'function',
  'class',
  'const',
  'let',
  'var',
  'import',
  'export',
]);

function maskLiterals(source) {
  const out = source.split('');
  const n = source.length;
  let i = 0;
  while (i < n) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') out[i++] = ' ';
    } else if (c === '/' && source[i + 1] === '*') {
      out[i++] = ' ';
      out[i++] = ' ';
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < n) {
        out[i++] = ' ';
        out[i++] = ' ';
      }
    } else if (c === '`' || c === "'" || c === '"') {
      i += 1;
      while (i < n) {
        if (source[i] === '\\') {
          out[i] = ' ';
          if (i + 1 < n && source[i + 1] !== '\n') out[i + 1] = ' ';
          i += 2;
          continue;
        }
        if (source[i] === c) {
          i += 1;
          break;
        }
        if (source[i] !== '\n') out[i] = ' ';
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return out.join('');
}

function declarationIndex(source) {
  const decls = [];
  const callable =
    /(?:^|\n)[ \t]*(?:export\s+)?(?:default\s+)?(?:static\s+)?(?:async\s+)?(?:function\s*\*?\s*)?([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>)?\s*(\()/g;
  const arrow =
    /(?:^|\n)[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
  let m;
  while ((m = callable.exec(source))) {
    if (NOT_A_DECLARATION.has(m[1])) continue;
    if (!opensABody(source, m.index + m[0].length - 1)) continue;
    decls.push({ name: m[1], index: m.index });
  }
  while ((m = arrow.exec(source))) {
    if (NOT_A_DECLARATION.has(m[1])) continue;
    decls.push({ name: m[1], index: m.index });
  }
  decls.sort((a, b) => a.index - b.index);
  return decls;
}

function opensABody(source, open) {
  let depth = 0;
  let i = open;
  for (; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return false;
  let angle = 0;
  for (i += 1; i < source.length; i += 1) {
    const c = source[i];
    if (c === '<') angle += 1;
    else if (c === '>') angle = Math.max(0, angle - 1);
    else if (angle === 0) {
      if (c === '{') return true;
      if (c === ';' || c === ')' || c === ',' || c === '(') return false;
      if (!/[\s:|&[\]?.\w$]/.test(c)) return false;
    }
  }
  return false;
}

function enclosingDeclaration(decls, index) {
  let found = null;
  for (const d of decls) {
    if (d.index > index) break;
    found = d.name;
  }
  return found;
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

// Comments are stripped before the scope-token scan. The window below is 600
// raw characters after a declaration, so a doc comment that merely MENTIONS
// user_id was enough to convince this check the statement was owner-scoped.
// waitlistService.ts passed for exactly that reason until the prose moved.
function resolvesToScope(rawSource, name, depth) {
  if (depth < 0) return false;
  const source = stripComments(rawSource);
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

function scopingInterpolations(sql, lower) {
  const names = [];
  const start = lower.search(/\b(?:where|on\s+conflict)\b/);
  if (start >= 0) {
    const tail = lower.slice(start).search(/\b(?:returning|order\s+by|group\s+by|limit)\b/);
    const end = tail < 0 ? lower.length : start + tail;
    for (const m of sql.matchAll(/\$\{\s*([A-Za-z_$][\w$]*)/g)) {
      if (m.index >= start && m.index < end) names.push(m[1]);
    }
  }
  for (const m of sql.matchAll(
    /insert\s+into\s+(?:public\.)?[a-z_]+\s*\(\s*\$\{\s*([A-Za-z_$][\w$]*)/gi,
  )) {
    names.push(m[1]);
  }
  return names;
}

const errors = [];
const files = [
  ...walk(path.join(root, 'apps/web/app/api')),
  ...walk(path.join(root, 'apps/web/lib')),
];
let scanned = 0;
let ownerConnectionFiles = 0;
const policedByTable = new Map();

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  if (!/getNeonDb\(\)|getNeonChatDb\(\)|DatabaseAdapter/.test(source)) continue;
  ownerConnectionFiles += 1;
  const exemptions = ALLOWLIST.filter((a) => a.match.test(rel));
  if (exemptions.some((a) => !a.tables)) continue;
  const decls = declarationIndex(maskLiterals(source));

  for (const { sql, index } of extractStatements(source)) {
    const where = enclosingDeclaration(decls, index);
    const exemptTables = new Set(
      exemptions
        .filter((a) => !a.functions || (where !== null && a.functions.includes(where)))
        .flatMap((a) => a.tables),
    );
    const tables = tablesIn(sql).filter((t) => !exemptTables.has(t));
    if (tables.length === 0) continue;
    scanned += 1;
    for (const t of tables) policedByTable.set(t, (policedByTable.get(t) ?? 0) + 1);
    const lower = sql.toLowerCase();
    if (mentionsScopeToken(lower)) continue;
    const interpolated = scopingInterpolations(sql, lower);
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

const MIGRATIONS_DIR = 'apps/web/db/neon';

const TENANT_COLUMN =
  /^(?:[a-z0-9_]*_)?(?:user_id|owner_id|organization_id|org_id|account_id|member_id)$/;

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

function findHollowDecisions({ tables, rlsEnabled }, appEnforced, policed, declared) {
  const hollow = [];
  const stale = [];
  for (const table of appEnforced) {
    if (!tables.has(table) || rlsEnabled.has(table)) continue;
    const count = policed.get(table) ?? 0;
    if (count === 0 && !declared.has(table)) hollow.push(table);
    if (count > 0 && declared.has(table)) stale.push({ table, count });
  }
  return { hollow, stale };
}

const { hollow, stale } =
  ownerConnectionFiles > 0
    ? findHollowDecisions(schema, USER_OWNED_TABLES, policedByTable, UNPOLICED_APP_ENFORCED_TABLES)
    : { hollow: [], stale: [] };

if (hollow.length > 0 || stale.length > 0) {
  console.error('Database isolation check FAILED — app-enforcement that enforces nothing:\n');
  for (const table of hollow) {
    console.error(
      `- ${table} is in USER_OWNED_TABLES and has no RLS policy, but pass 1 policed ZERO\n` +
        `  statements over it. Nothing enforces its isolation: not the database, not this gate.\n`,
    );
  }
  for (const { table, count } of stale) {
    console.error(
      `- ${table} is listed in UNPOLICED_APP_ENFORCED_TABLES but pass 1 now polices ${count}\n` +
        `  statement(s) over it. The written reason has stopped being true.\n`,
    );
  }
  console.error(
    `Pass 2 accepts USER_OWNED_TABLES membership as an isolation decision, which is only\n` +
      `honest while pass 1 can actually READ the statements. For a hollow table, either:\n` +
      `  1. find why the SQL is invisible (quoting style, an injected db handle, an\n` +
      `     interpolated table name) and fix the scan, or\n` +
      `  2. enable row level security in the migration, or\n` +
      `  3. add it to UNPOLICED_APP_ENFORCED_TABLES WITH the reason zero is correct.\n` +
      `For a stale entry, delete it — the coverage it apologised for now exists.`,
  );
  process.exit(1);
}

console.log(
  `Database isolation check passed (${scanned} owner-connection statements over user-owned ` +
    `tables across ${ownerConnectionFiles} route and service modules, all owner-constrained; ` +
    `${tenantScoped} tenant-scoped tables across ${schema.tables.size} live tables, each with an ` +
    `explicit isolation decision; ${UNPOLICED_APP_ENFORCED_TABLES.size} app-enforced tables ` +
    `declared as policing zero statements, with reasons).`,
);
