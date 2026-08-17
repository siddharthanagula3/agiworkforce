export const STATUTORY_RECORD_RETENTION_DAYS = 2922;

export const METERING_EVIDENCE_RETENTION_DAYS = 730;

export const SETTLEMENT_QUEUE_RETENTION_DAYS = 90;

export const WEBHOOK_DEDUPE_RETENTION_DAYS = 180;

export const MAX_ROWS_PER_TABLE_PER_RUN = 5000;

export type MinimisedValue = 'null' | "'{}'::jsonb";

export interface MinimisedColumn {
  readonly column: string;
  readonly to: MinimisedValue;
}

interface BaseRule {
  readonly table: string;
  readonly keyColumn: string;
  readonly ageColumn: string;
  readonly afterDays: number;
  readonly restrictedTo?: string;
  readonly basis: string;
}

export interface PurgeRule extends BaseRule {
  readonly action: 'purge';
}

export interface MinimiseRule extends BaseRule {
  readonly action: 'minimise';
  readonly minimise: readonly MinimisedColumn[];
}

export type FinancialRetentionRule = PurgeRule | MinimiseRule;

export const FINANCIAL_RETENTION_RULES: readonly FinancialRetentionRule[] = [
  {
    action: 'purge',
    table: 'credit_idempotency_keys',
    keyColumn: 'id',
    ageColumn: 'expires_at',
    afterDays: 0,
    basis:
      'Double-charge protection key. The 24-hour expiry stamped on the row is its whole purpose; past it the row proves nothing and only holds a user id.',
  },
  {
    action: 'purge',
    table: 'credit_settlement_jobs',
    keyColumn: 'id',
    ageColumn: 'completed_at',
    afterDays: SETTLEMENT_QUEUE_RETENTION_DAYS,
    restrictedTo: "status = any (array['succeeded', 'terminal'])",
    basis:
      'Settlement queue row. Once the job has completed, the credit ledger entry it produced is the record of the money; the queue row is transport.',
  },
  {
    action: 'minimise',
    table: 'processed_stripe_events',
    keyColumn: 'event_id',
    ageColumn: 'processed_at',
    afterDays: 30,
    minimise: [{ column: 'error_message', to: 'null' }],
    basis:
      'A failed webhook message can quote payload detail. The dedupe guarantee needs the event id, never the error text, once the incident is closed.',
  },
  {
    action: 'purge',
    table: 'processed_stripe_events',
    keyColumn: 'event_id',
    ageColumn: 'processed_at',
    afterDays: WEBHOOK_DEDUPE_RETENTION_DAYS,
    basis:
      'Webhook replay protection. Stripe does not redeliver an event this old, so the row no longer prevents anything.',
  },
  {
    action: 'minimise',
    table: 'usage_events',
    keyColumn: 'id',
    ageColumn: 'created_at',
    afterDays: 180,
    minimise: [{ column: 'metadata', to: 'null' }],
    basis:
      'Metering evidence keeps its type and quantity; the request-shaped metadata is not needed to prove what was metered.',
  },
  {
    action: 'purge',
    table: 'usage_events',
    keyColumn: 'id',
    ageColumn: 'created_at',
    afterDays: METERING_EVIDENCE_RETENTION_DAYS,
    basis:
      'Metering evidence, not a book of account. The invoice sits with the payment processor and the charge sits in the credit ledger.',
  },
  {
    action: 'minimise',
    table: 'credit_transactions',
    keyColumn: 'id',
    ageColumn: 'created_at',
    afterDays: METERING_EVIDENCE_RETENTION_DAYS,
    basis:
      'The statutory record is the amount, the type and the date. The metadata that routed the charge is not part of it.',
    minimise: [{ column: 'metadata', to: 'null' }],
  },
  {
    action: 'purge',
    table: 'credit_transactions',
    keyColumn: 'id',
    ageColumn: 'created_at',
    afterDays: STATUTORY_RECORD_RETENTION_DAYS,
    basis: 'Book of account. Held for the full statutory record-keeping period, then removed.',
  },
  {
    action: 'minimise',
    table: 'organization_usage_ledger',
    keyColumn: 'id',
    ageColumn: 'created_at',
    afterDays: METERING_EVIDENCE_RETENTION_DAYS,
    basis:
      'The organisation ledger keeps cost and margin. The per-request metadata beside them is not part of the financial record.',
    minimise: [{ column: 'metadata', to: "'{}'::jsonb" }],
  },
  {
    action: 'purge',
    table: 'organization_usage_ledger',
    keyColumn: 'id',
    ageColumn: 'created_at',
    afterDays: STATUTORY_RECORD_RETENTION_DAYS,
    basis:
      'Book of account for the organisation. Held for the full statutory record-keeping period, then removed.',
  },
];

export const FINANCIAL_TABLES_WITHOUT_MAXIMUM_AGE: readonly {
  readonly table: string;
  readonly reason: string;
}[] = [
  {
    table: 'subscriptions',
    reason:
      'Current plan state, one row per account. Ageing it out would cancel a live subscription; it is erased with the account instead.',
  },
  {
    table: 'token_credits',
    reason:
      'Current credit balance and period window. Ageing it out would delete credits the user has paid for; it is erased with the account instead.',
  },
];

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(value: string, label: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Unsafe ${label} in financial retention schedule: ${value}`);
  }
  return value;
}

function stillCarriesData(entry: MinimisedColumn): string {
  return entry.to === 'null'
    ? `${entry.column} is not null`
    : `${entry.column} is distinct from ${entry.to}`;
}

export interface RetentionStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

export function financialRetentionStatement(rule: FinancialRetentionRule): RetentionStatement {
  const table = assertIdentifier(rule.table, 'table');
  const key = assertIdentifier(rule.keyColumn, 'key column');
  const age = assertIdentifier(rule.ageColumn, 'age column');

  const conditions = [
    `${age} is not null`,
    `${age} < now() - $1::interval`,
    ...(rule.restrictedTo ? [rule.restrictedTo] : []),
    ...(rule.action === 'minimise'
      ? [`(${rule.minimise.map(stillCarriesData).join(' or ')})`]
      : []),
  ];

  const due = `select ${key} as retention_key
       from public.${table}
      where ${conditions.join('\n        and ')}
      order by ${age} asc
      limit $2`;

  if (rule.action === 'purge') {
    return {
      sql: `with due as (\n     ${due}\n   )\n   delete from public.${table} as target\n    using due\n    where target.${key} = due.retention_key\n   returning target.${key} as retention_key`,
      params: [`${rule.afterDays} days`, MAX_ROWS_PER_TABLE_PER_RUN],
    };
  }

  const assignments = rule.minimise
    .map((entry) => `${assertIdentifier(entry.column, 'minimised column')} = ${entry.to}`)
    .join(', ');

  return {
    sql: `with due as (\n     ${due}\n   )\n   update public.${table} as target\n      set ${assignments}\n     from due\n    where target.${key} = due.retention_key\n   returning target.${key} as retention_key`,
    params: [`${rule.afterDays} days`, MAX_ROWS_PER_TABLE_PER_RUN],
  };
}
