import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DATA_REGION_IDS } from '@agiworkforce/compliance';

const MIGRATION = '0230_job_origin_region_and_azure_kms.sql';
const RESIDENCY_MIGRATION = '0220_customer_managed_keys_and_data_region.sql';

describe('job origin region and Azure key vault migration (0230)', () => {
  const load = (file = MIGRATION) => readFile(join(process.cwd(), 'db/neon', file), 'utf8');

  it('pins deferred work to a region the build declares', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /alter table public\.background_jobs\s+add column if not exists origin_region text/i,
    );
    for (const region of DATA_REGION_IDS) {
      expect(sql).toMatch(new RegExp(`origin_region in \\([^)]*'${region}'`, 'i'));
    }
  });

  it('leaves null meaning the home region, exactly as the organization row does', async () => {
    const sql = await load();
    const applied = sql.slice(0, sql.indexOf('-- VERIFICATION'));
    expect(applied).toMatch(/origin_region is null or origin_region in/i);
    expect(applied).not.toMatch(/origin_region text not null/i);
    expect(applied).not.toMatch(/update\s+public\.background_jobs\s+set\s+origin_region/i);
  });

  it('indexes the claim a regional drain actually makes', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /create index if not exists idx_background_jobs_claimable_by_region[\s\S]{0,200}where status = 'queued'/i,
    );
  });

  it('declares the same regions the residency migration constrains a workspace to', async () => {
    const [jobs, residency] = await Promise.all([load(), load(RESIDENCY_MIGRATION)]);
    const declared = (sql: string, column: string) =>
      new Set(
        (sql.match(new RegExp(`${column} in \\(([^)]*)\\)`, 'i'))?.[1] ?? '')
          .split(',')
          .map((entry) => entry.trim().replace(/'/g, ''))
          .filter(Boolean),
      );
    expect(declared(jobs, 'origin_region')).toEqual(declared(residency, 'data_region'));
  });

  it('widens the key provider check to the third vendor rather than dropping it', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /check \(provider in \('aws_kms', 'gcp_kms', 'azure_key_vault', 'local'\)\)/i,
    );
    expect(sql).toMatch(/drop constraint %I/i);
  });

  it('never edits an applied migration to get there', async () => {
    const residency = await load(RESIDENCY_MIGRATION);
    expect(residency).toMatch(/provider in \('aws_kms', 'gcp_kms', 'local'\)/i);
  });
});
