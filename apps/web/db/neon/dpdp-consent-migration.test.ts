import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards for the two DPDP migrations.
 *
 * These are not schema documentation. Each assertion corresponds to a property
 * that, if it were quietly dropped, would turn a working compliance surface
 * into one that only looks like it works — and would do so without failing any
 * other test in the repository:
 *
 *  - If `consent_records` ever gains an UPDATE grant, a withdrawal could
 *    overwrite the grant it withdraws, and the ledger stops being able to show
 *    that consent was ever held. That is the one property the whole design
 *    rests on.
 *  - If `user_id` becomes NOT NULL, the anonymous waitlist intake — the largest
 *    unconsented collection point in the product, and the reason the ledger
 *    exists — can no longer record consent at all.
 *  - If the subject constraint is dropped, rows can accumulate that belong to
 *    nobody: unexportable, unerasable, and useless as evidence.
 *  - If RLS or FORCE RLS is dropped, one user can read another's consent and
 *    grievance history on the scoped handle.
 */

const CONSENT = 'db/neon/0113_dpdp_consent_records.sql';
const REQUESTS = 'db/neon/0114_data_rights_requests.sql';

async function readMigration(relativePath: string): Promise<string> {
  return readFile(join(process.cwd(), relativePath), 'utf8');
}

/** Migration text with SQL comments removed, so prose cannot satisfy a guard. */
function statementsOf(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

describe('0113 — DPDP consent ledger', () => {
  it('is append-only by grant: insert and select, never update or delete', async () => {
    const sql = statementsOf(await readMigration(CONSENT));

    const grant = /grant\s+([^;]+?)\s+on\s+public\.consent_records\s+to\s+app_rls/i.exec(sql)?.[1];
    expect(grant).toBeDefined();
    expect(grant).toMatch(/select/i);
    expect(grant).toMatch(/insert/i);
    // A withdrawal must be a new row. An UPDATE grant would let it become an
    // overwrite of the grant it withdraws.
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
    // Both NOT NULL: a consent that cannot name the text shown, or the flow it
    // came from, is not evidence of anything.
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
    // The address lives in cloud_managed_waitlist; this table holds a digest.
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
