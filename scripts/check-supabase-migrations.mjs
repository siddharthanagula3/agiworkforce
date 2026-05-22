#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

const canonicalDir = 'supabase/migrations';
const legacyDir = 'apps/web/supabase/migrations';

const frozenLegacyMigrations = new Set([
  '20241223_init.sql',
  '20260101000000_consolidated_schema.sql',
  '20260101000001_add_missing_functions.sql',
  '20260101000002_fix_functions.sql',
  '20260101000003_add_stripe_integration.sql',
  '20260104000001_add_credits_function.sql',
  '20260105000000_optimize_rls_policies.sql',
  '20260106000000_add_device_authorization.sql',
  '20260107000000_fix_duplicate_indexes_and_rls.sql',
  '20260108000000_lock_down_credit_rpcs.sql',
  '20260108000001_fix_device_authorization_flow.sql',
  '20260108000002_fix_claim_beta_invite_rpc_security.sql',
  '20260108000003_add_device_token_consumption_rpc.sql',
  '20260108000004_fix_stripe_webhook_idempotency.sql',
  '20260109100000_fix_database_cleanup_and_security.sql',
  '20260110000000_add_desktop_devices.sql',
  '20260110000001_add_credit_idempotency.sql',
  '20260110000002_add_sync_data.sql',
  '20260110000003_add_mobile_devices.sql',
  '20260115000000_critical_fixes_gdpr_compliance.sql',
  '20260115100000_release_management.sql',
  '20260117000000_add_web_chat.sql',
  '20260118000000_add_missing_rls_policies.sql',
  '20260121000000_remove_unused_indexes.sql',
  '20260122000000_add_security_audit_logs.sql',
  '20260125000000_cleanup_unused_tables.sql',
  '20260128000000_add_missing_fk_indexes.sql',
  '20260222000000_add_waitlist_table.sql',
  '20260223000000_resilience_security_fixes.sql',
  '20260224000000_add_sso_connections.sql',
  '20260224000001_add_scim_fields.sql',
  '20260225000000_fix_feedback_rls.sql',
  '20260226000000_add_pinned_to_web_conversations.sql',
  '20260226100000_add_messaging_connections.sql',
  '20260226100001_add_user_memories.sql',
  '20260226100002_add_scheduled_tasks.sql',
  '20260226100003_add_conversation_tags.sql',
  '20260226200000_fix_mobile_schema.sql',
  '20260301_add_execution_rls.sql',
  '20260315000000_create_multi_agent_tables.sql',
  '20260318100000_user_projects.sql',
  '20260318200000_conversations_project_id.sql',
  '20260319000000_create_user_memories.sql',
  '20260319000001_fix_missing_rls.sql',
  '20260319000002_add_delete_policies.sql',
  '20260327000000_cursor_style_billing_budget.sql',
  '20260503000000_add_metadata_to_web_messages.sql',
  '20260505000000_fix_device_authorization_rls_leak.sql',
  '20260505000001_add_api_key_prefix.sql',
  '20260505000002_replace_authrole_with_role_grant.sql',
]);

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function sqlFiles(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs
    .readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

if (!exists(canonicalDir)) {
  errors.push(`Missing canonical Supabase migration directory: ${canonicalDir}`);
}

if (!exists(legacyDir)) {
  errors.push(
    `Missing frozen legacy Supabase migration directory: ${legacyDir}. Delete it only in the explicit consolidation PR.`,
  );
}

for (const filename of sqlFiles(canonicalDir)) {
  if (!/^\d{8,14}_.+\.sql$/.test(filename)) {
    errors.push(`${canonicalDir}/${filename} must use <timestamp>_<name>.sql naming.`);
  }
}

const legacyFiles = sqlFiles(legacyDir);
for (const filename of legacyFiles) {
  if (!frozenLegacyMigrations.has(filename)) {
    errors.push(
      `${legacyDir}/${filename} is not in the frozen legacy allowlist. New migrations must go in ${canonicalDir}.`,
    );
  }
}

for (const filename of frozenLegacyMigrations) {
  if (!legacyFiles.includes(filename)) {
    errors.push(
      `${legacyDir}/${filename} is missing from the frozen legacy set. Remove legacy files only in the consolidation PR.`,
    );
  }
}

if (exists('supabase/README.md')) {
  const body = readText('supabase/README.md');
  for (const expected of [
    'Always put new migrations here',
    'Frozen legacy directory',
    'Do not add new SQL files under `apps/web/supabase/migrations/`',
  ]) {
    if (!body.includes(expected)) {
      errors.push(`supabase/README.md must document: ${expected}`);
    }
  }
}

if (exists('apps/web/supabase/README.md')) {
  const body = readText('apps/web/supabase/README.md');
  if (!body.includes('Frozen legacy migrations')) {
    errors.push('apps/web/supabase/README.md must document frozen legacy migrations.');
  }
}

if (errors.length > 0) {
  console.error('Supabase migration check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Supabase migration check passed.');
