import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(process.cwd(), 'db/neon');
const NUMBERED_MIGRATION = /^(\d{4})_.*\.sql$/;

function numberedMigrationsInApplyOrder(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => NUMBERED_MIGRATION.test(name))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8') }));
}

function latestDefinitionOf(functionName: string): { migration: string; body: string } {
  const opener = `create or replace function public.${functionName}(`;
  const defining = numberedMigrationsInApplyOrder().filter((migration) =>
    migration.sql.toLowerCase().includes(opener),
  );
  const latest = defining.at(-1);
  if (!latest) throw new Error(`No migration defines public.${functionName}`);

  const start = latest.sql.toLowerCase().lastIndexOf(opener);
  const quote = /\bas\s+(\$[a-z_]*\$)/i.exec(latest.sql.slice(start))?.[1];
  if (!quote) throw new Error(`Could not find the dollar-quote for public.${functionName}`);
  const bodyEnd = latest.sql.indexOf(`${quote};`, start);
  if (bodyEnd === -1) throw new Error(`Unterminated body for public.${functionName}`);

  return { migration: latest.name, body: latest.sql.slice(start, bodyEnd + quote.length + 1) };
}

function withoutComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

const reserve = latestDefinitionOf('reserve_managed_usage_request_with_limits');
const extend = latestDefinitionOf('extend_managed_usage_request_provider_step');

const CAP_PARAMETERS = [
  'p_session_cap_cents',
  'p_weekly_cap_cents',
  'p_flagship_weekly_cap_cents',
] as const;

describe('managed usage cap semantics', () => {
  it('resolves the live definition of both cap-enforcing functions', () => {
    expect(reserve.body).toMatch(
      /create or replace function public\.reserve_managed_usage_request_with_limits\(/i,
    );
    expect(extend.body).toMatch(
      /create or replace function public\.extend_managed_usage_request_provider_step\(/i,
    );
  });

  it.each(CAP_PARAMETERS)('never treats a zero %s as unlimited', (parameter) => {
    for (const definition of [reserve, extend]) {
      expect(
        withoutComments(definition.body),
        `${definition.migration} gates on ${parameter} > 0, which reads a zero cap as no cap`,
      ).not.toMatch(new RegExp(`${parameter}\\s*>\\s*0`, 'i'));
    }
  });

  it.each(CAP_PARAMETERS)(
    'applies the %s ceiling whenever one is configured at all',
    (parameter) => {
      for (const definition of [reserve, extend]) {
        expect(withoutComments(definition.body)).toMatch(
          new RegExp(`${parameter} is not null`, 'i'),
        );
      }
    },
  );

  it.each(CAP_PARAMETERS)('accepts a NULL %s as the declared-uncapped signal', (parameter) => {
    for (const definition of [reserve, extend]) {
      const body = withoutComments(definition.body);
      expect(
        body,
        `${definition.migration} rejects a NULL ${parameter}, which 503s every uncapped-plan turn`,
      ).not.toMatch(new RegExp(`${parameter} is null`, 'i'));
      expect(body).toMatch(new RegExp(`\\(${parameter} is not null and ${parameter} < 0\\)`, 'i'));
    }
  });

  it('keeps the 0066 serialization, idempotency, and settlement behaviour', () => {
    expect(reserve.body).toMatch(/pg_advisory_xact_lock/i);
    expect(reserve.body).toMatch(/public\.reserve_managed_usage_request\(/i);
    expect(extend.body).toMatch(/managed_usage_request_extensions/i);
    expect(reserve.body).toMatch(/transaction_type\s*=\s*'deduction'/i);
    expect(reserve.body).toMatch(/interval\s+'5 hours'/i);
    expect(reserve.body).toMatch(/interval\s+'7 days'/i);
  });

  it('re-applies the least-privilege grants for both functions', () => {
    const grants = readFileSync(
      resolve(MIGRATIONS_DIR, '0070_managed_usage_cap_semantics.sql'),
      'utf8',
    );
    expect(grants).toMatch(
      /revoke all on function public\.reserve_managed_usage_request_with_limits\([\s\S]{0,120}\) from public/i,
    );
    expect(grants).toMatch(
      /grant execute on function public\.extend_managed_usage_request_provider_step\([\s\S]{0,120}\) to app_rls/i,
    );
  });
});
