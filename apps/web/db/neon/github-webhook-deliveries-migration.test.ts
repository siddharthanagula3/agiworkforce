import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('github webhook deliveries migration (0106)', () => {
  it('creates the delivery ledger with a unique delivery_id — the dedup arbiter', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0106_github_webhook_deliveries.sql'),
      'utf8',
    );

    expect(sql).toMatch(/create table if not exists public\.github_webhook_deliveries/i);
    expect(sql).toMatch(/delivery_id text not null unique/i);
    expect(sql).toMatch(/received_at timestamptz not null default now\(\)/i);
    expect(sql).toMatch(/create index if not exists idx_github_webhook_deliveries_received_at/i);
  });

  it('stores no payload — the ledger is idempotency state, not an audit log', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0106_github_webhook_deliveries.sql'),
      'utf8',
    );
    const withoutComments = sql.replace(/--[^\n]*/g, '');
    expect(withoutComments).not.toMatch(/payload|body|jsonb/i);
  });

  it('ships a reversal that drops exactly what the migration creates', async () => {
    const down = await readFile(
      join(process.cwd(), 'db/neon/down/0106_github_webhook_deliveries.down.sql'),
      'utf8',
    );
    expect(down).toMatch(/drop table if exists public\.github_webhook_deliveries/i);
    expect(down).toMatch(/drop index if exists idx_github_webhook_deliveries_received_at/i);
  });
});
