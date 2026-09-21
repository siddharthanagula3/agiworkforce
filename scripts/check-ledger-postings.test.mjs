import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  LEDGER_WRITE_PROTECTION,
  MIGRATIONS_DIR,
  REPO_ROOT,
  checkLedgerPostings,
  effectiveFunctions,
  ledgerWriters,
  uniqueIndexes,
} from './check-ledger-postings.mjs';

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'ledger-postings-'));
  const dir = path.join(root, MIGRATIONS_DIR);
  mkdirSync(dir, { recursive: true });
  for (const [name, sql] of Object.entries(files)) writeFileSync(path.join(dir, name), sql);
  return root;
}

const PERIOD_INDEX = `create unique index if not exists idx_token_credits_unique_period
  on public.token_credits(user_id, subscription_id, period_start, period_end);
`;

function writerSql(name, { description = "'a reason'", columns = 'description' } = {}) {
  return `create or replace function public.${name}(
  p_user_id text
)
returns void
language plpgsql
as $$
begin
  insert into public.token_credits (user_id) values (p_user_id);
  insert into public.credit_transactions (
    user_id, transaction_type, amount_microusd, ${columns}
  ) values (
    p_user_id, 'refund', 1, ${description}
  );
end;
$$;
`;
}

test('the repository passes its own rule', () => {
  const { writers, violations, stale } = checkLedgerPostings();
  assert.ok(writers.length >= 7, 'every credit ledger writer is discovered');
  assert.deepEqual(violations, []);
  assert.deepEqual(stale, []);
});

test('the declared writers are the writers that ship', () => {
  const found = ledgerWriters().map((writer) => writer.name);
  assert.deepEqual(found, Object.keys(LEDGER_WRITE_PROTECTION).sort());
});

test('a later migration replacing a function is the one that is policed', () => {
  const root = fixture({
    '0001_first.sql': writerSql('post_credit', { columns: 'description' }),
    '0002_second.sql': writerSql('post_credit', { columns: 'memo' }),
  });
  const effective = effectiveFunctions(root).get('post_credit');
  assert.equal(effective.migration, '0002_second.sql');
  assert.match(effective.body, /memo/);
});

test('a new writer that names no defence fails', () => {
  const root = fixture({ '0001_new.sql': PERIOD_INDEX + writerSql('mint_credit') });
  const { violations } = checkLedgerPostings(root);
  assert.equal(violations.length, 1);
  assert.match(violations[0].why, /names no defence against applying it twice/);
});

test('a writer that posts without naming what moved it fails', () => {
  const root = fixture({
    '0001_untraceable.sql':
      PERIOD_INDEX +
      writerSql('get_or_create_credit_account_microusd', {
        columns: 'metadata',
        description: "'{}'",
      }),
  });
  const { violations } = checkLedgerPostings(root);
  assert.equal(violations.length, 1);
  assert.match(violations[0].why, /without naming what moved it/);
});

test('a unique index that no migration creates fails', () => {
  const root = fixture({
    '0001_no_index.sql': writerSql('get_or_create_credit_account_microusd'),
  });
  const { violations } = checkLedgerPostings(root);
  assert.equal(violations.length, 1);
  assert.match(violations[0].why, /idx_token_credits_unique_period, which no migration creates/);
});

test('a unique index on a table the writer never touches fails', () => {
  const root = fixture({
    '0001_wrong_table.sql':
      `create unique index if not exists idx_token_credits_unique_period
  on public.some_other_table(user_id);
` + writerSql('get_or_create_credit_account_microusd'),
  });
  const { violations } = checkLedgerPostings(root);
  assert.equal(violations.length, 1);
  assert.match(violations[0].why, /but it is on some_other_table/);
});

test('a keyed writer that stops taking a key fails', () => {
  const root = fixture({
    '0001_unkeyed.sql': PERIOD_INDEX + writerSql('deduct_credits_microusd'),
  });
  const { violations } = checkLedgerPostings(root);
  assert.equal(violations.length, 1);
  assert.match(violations[0].why, /claims an idempotency key, but the statement takes none/);
});

test('a receipt writer that stops recording the receipt fails', () => {
  const root = fixture({
    '0001_no_receipt.sql':
      PERIOD_INDEX +
      writerSql('handle_refund_microusd', { description: "'a reason'" }).replace(
        "'refund'",
        "'adjustment'",
      ),
  });
  const { violations } = checkLedgerPostings(root);
  assert.equal(violations.length, 1);
  assert.match(violations[0].why, /read back as a 'refund' posting/);
});

test('a receipt writer that stops recording the description it is read back by fails', () => {
  const real = readFileSync(
    path.join(REPO_ROOT, MIGRATIONS_DIR, '0182_managed_usage_microusd_ledger.sql'),
    'utf8',
  );
  const root = fixture({
    '0182_managed_usage_microusd_ledger.sql': real.replace(
      `    'refund',
    p_reason
  );

  return true;
end;
$$;

revoke all on function public.handle_refund_microusd`,
      `    'refund',
    'refund processed'
  );

  return true;
end;
$$;

revoke all on function public.handle_refund_microusd`,
    ),
  });
  const { violations } = checkLedgerPostings(root);
  assert.ok(
    violations.some((violation) => /read back by p_reason/.test(violation.why)),
    'the real refund statement is caught when it stops recording the caller reason',
  );
});

test('a declared writer that no longer exists is reported as stale', () => {
  const root = fixture({
    '0001_only_one.sql': PERIOD_INDEX + writerSql('get_or_create_credit_account_microusd'),
  });
  const { stale } = checkLedgerPostings(root);
  assert.ok(stale.includes('settle_managed_usage_credits_microusd'));
  assert.ok(stale.includes('handle_refund_microusd'));
});

test('unique indexes are read off the migrations rather than assumed', () => {
  const indexes = uniqueIndexes();
  assert.equal(indexes.get('idx_token_credits_unique_period'), 'token_credits');
  assert.equal(
    indexes.get('idx_credit_transactions_top_up_session_receipt'),
    'credit_transactions',
  );
});
