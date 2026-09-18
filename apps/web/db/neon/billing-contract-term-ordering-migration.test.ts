import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);
const sql = readFileSync(resolve(neonDir, '0243_billing_contract_term_ordering.sql'), 'utf8');
const down = readFileSync(
  resolve(neonDir, 'down/0243_billing_contract_term_ordering.down.sql'),
  'utf8',
);
const source = readFileSync(resolve(neonDir, '0163_enterprise_billing_contracts.sql'), 'utf8');

describe('0243 a contract term runs forwards', () => {
  it('rejects an inverted or zero-length term', () => {
    expect(sql).toMatch(/organization_billing_contracts_term_runs_forwards/);
    expect(sql).toMatch(/contract_term_start < contract_term_end/);
  });

  it('leaves a contract that is not countersigned yet alone', () => {
    expect(sql).toMatch(/contract_term_start is null/i);
    expect(sql).toMatch(/contract_term_end is null/i);
  });

  it('adds the constraint NOT VALID and validates it separately, so an apply is not blocked', () => {
    expect(sql).toMatch(/not valid/i);
    expect(sql).toMatch(/validate constraint organization_billing_contracts_term_runs_forwards/i);
  });

  it('does not edit 0163, which is already written', () => {
    expect(source).not.toMatch(/term_runs_forwards/);
    expect(sql).toMatch(/alter table public\.organization_billing_contracts/i);
    expect(sql).not.toMatch(/create table[^;]*organization_billing_contracts/i);
  });

  it('says why one workspace cannot have overlapping terms to constrain', () => {
    // 0163 makes organization_id the primary key, so there is only ever one
    // contract row; an exclusion constraint would guard an unreachable state.
    expect(source).toMatch(/organization_id uuid primary key references public\.organizations/i);
    expect(sql).toMatch(/no non-overlap constraint/i);
  });
});

describe('0243 reverses', () => {
  it('drops only the constraint it added', () => {
    expect(down).toMatch(
      /drop constraint if exists organization_billing_contracts_term_runs_forwards/i,
    );
    expect(down).not.toMatch(/drop table/i);
    expect(down).not.toMatch(/drop column/i);
    expect(down).toContain("where filename = '0243_billing_contract_term_ordering.sql'");
  });
});
