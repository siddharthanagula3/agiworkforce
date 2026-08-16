import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CONSENT = 'db/neon/0113_dpdp_consent_records.sql';
const REQUESTS = 'db/neon/0114_data_rights_requests.sql';
const APPEND_ONLY = 'db/neon/0116_consent_ledger_append_only.sql';

async function readMigration(relativePath: string): Promise<string> {
  return readFile(join(process.cwd(), relativePath), 'utf8');
}

function statementsOf(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

describe('0113 — DPDP consent ledger', () => {
  it('grants only select and insert (necessary, and by itself not sufficient)', async () => {
    const sql = statementsOf(await readMigration(CONSENT));

    const grant = /grant\s+([^;]+?)\s+on\s+public\.consent_records\s+to\s+app_rls/i.exec(sql)?.[1];
    expect(grant).toBeDefined();
    expect(grant).toMatch(/select/i);
    expect(grant).toMatch(/insert/i);
    expect(grant).not.toMatch(/update/i);
    expect(grant).not.toMatch(/delete/i);
  });

  it('keeps user_id nullable so consent can be recorded without an account', async () => {
    const sql = statementsOf(await readMigration(CONSENT));
    const userIdColumn = /^\s*user_id\s+text[^,\n]*/im.exec(sql)?.[0] ?? '';

    expect(userIdColumn).toMatch(/references public\.profiles\(id\)/i);
    expect(userIdColumn).not.toMatch(/not null/i);
  });

  it('requires every row to name a subject one way or the other', async () => {
    const sql = statementsOf(await readMigration(CONSENT));
    expect(sql).toMatch(/constraint consent_records_has_subject/i);
    expect(sql).toMatch(
      /check\s*\(\s*user_id is not null or subject_email_sha256 is not null\s*\)/i,
    );
  });

  it('stores a notice revision and a surface with every decision', async () => {
    const sql = statementsOf(await readMigration(CONSENT));
    expect(sql).toMatch(/notice_version\s+text not null/i);
    expect(sql).toMatch(/surface\s+text not null/i);
    expect(sql).toMatch(/granted\s+boolean not null/i);
  });

  it('forces row-level security and isolates by the requesting subject', async () => {
    const sql = statementsOf(await readMigration(CONSENT));
    expect(sql).toMatch(/alter table public\.consent_records enable row level security/i);
    expect(sql).toMatch(/alter table public\.consent_records force row level security/i);
    expect(sql).toMatch(/using \(user_id = public\.current_app_user_id\(\)\)/i);
    expect(sql).toMatch(/with check \(user_id = public\.current_app_user_id\(\)\)/i);
  });

  it('never stores a plaintext email in the ledger', async () => {
    const sql = statementsOf(await readMigration(CONSENT));
    expect(sql).toMatch(/subject_email_sha256\s+text/i);
    expect(sql).not.toMatch(/^\s*email\s+text/im);
  });
});

describe('0114 — data-rights requests', () => {
  it('constrains the request type to the rights the product can actually action', async () => {
    const sql = statementsOf(await readMigration(REQUESTS));
    for (const right of [
      'access',
      'correction',
      'erasure',
      'withdrawal',
      'nomination',
      'grievance',
    ]) {
      expect(sql).toContain(`'${right}'`);
    }
    expect(sql).toMatch(/request_type text not null check/i);
  });

  it('gives every request a unique, quotable reference', async () => {
    const sql = statementsOf(await readMigration(REQUESTS));
    expect(sql).toMatch(/reference text not null unique/i);
  });

  it('does not grant update or delete on the queue', async () => {
    const sql = statementsOf(await readMigration(REQUESTS));
    const grant = /grant\s+([^;]+?)\s+on\s+public\.data_rights_requests\s+to\s+app_rls/i.exec(
      sql,
    )?.[1];
    expect(grant).toBeDefined();
    expect(grant).not.toMatch(/update/i);
    expect(grant).not.toMatch(/delete/i);
  });

  it('forces row-level security so one requester cannot read another', async () => {
    const sql = statementsOf(await readMigration(REQUESTS));
    expect(sql).toMatch(/alter table public\.data_rights_requests enable row level security/i);
    expect(sql).toMatch(/alter table public\.data_rights_requests force row level security/i);
    expect(sql).toMatch(/using \(user_id = public\.current_app_user_id\(\)\)/i);
  });

  it('cascades account-bound requests so erasure actually erases them', async () => {
    const sql = statementsOf(await readMigration(REQUESTS));
    expect(sql).toMatch(/user_id text references public\.profiles\(id\) on delete cascade/i);
  });
});

describe('0116 — what actually makes the ledger append-only', () => {
  it('revokes the update and delete that ALTER DEFAULT PRIVILEGES handed out', async () => {
    const sql = statementsOf(await readMigration(APPEND_ONLY));
    expect(sql).toMatch(/revoke update, delete on public\.consent_records from app_rls/i);
    expect(sql).toMatch(/revoke update, delete on public\.data_rights_requests from app_rls/i);
  });

  it('installs a BEFORE UPDATE OR DELETE trigger, because a REVOKE is not re-grant-proof', async () => {
    const sql = statementsOf(await readMigration(APPEND_ONLY));
    expect(sql).toMatch(/create trigger consent_records_append_only/i);
    expect(sql).toMatch(/before update or delete on public\.consent_records/i);
    expect(sql).toMatch(/execute function public\.consent_records_forbid_mutation\(\)/i);
  });

  it('guards on the table OWNER, so a new application role is refused by default', async () => {
    const sql = statementsOf(await readMigration(APPEND_ONLY));
    expect(sql).toMatch(/pg_get_userbyid\(relowner\)/i);
    expect(sql).toMatch(/current_user is distinct from table_owner/i);
    expect(sql).toMatch(/raise exception/i);
  });

  it('still lets the owner mutate, so account erasure keeps working', async () => {
    const sql = await readMigration(APPEND_ONLY);
    expect(sql).toMatch(/account erasure/i);
    expect(statementsOf(sql)).not.toMatch(/revoke[^;]*from\s+(current_user|neondb_owner)/i);
  });

  it('does not edit an already-applied migration to fix the defect', async () => {
    const consent = await readMigration(CONSENT);
    expect(consent).not.toMatch(/revoke update, delete/i);
    expect(consent).not.toMatch(/create trigger/i);
  });
});
