import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { RETENTION_DOMAINS } from '@agiworkforce/types';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0224_research_retention_domain.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0224_research_retention_domain.down.sql'),
  'utf8',
);

function acceptedDomains(sql: string, table: string): string[] {
  const pattern = new RegExp(
    `add constraint ${table}_domain_check check \\(domain in \\(([^)]+)\\)\\)`,
  );
  const body = pattern.exec(sql)?.[1];
  expect(body, `${table} has no domain check in this file`).toBeDefined();
  return [...body!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);
}

describe('research retention domain migration', () => {
  for (const table of [
    'organization_domain_retention_policies',
    'organization_domain_retention_sweeps',
  ]) {
    it(`accepts exactly the domains the contract declares on ${table}`, () => {
      expect(new Set(acceptedDomains(migration, table))).toEqual(new Set(RETENTION_DOMAINS));
    });
  }

  it('is reversible: it clears the research rows before narrowing the constraint back', () => {
    for (const named of [
      "delete from public.organization_domain_retention_sweeps where domain = 'research'",
      "delete from public.organization_domain_retention_policies where domain = 'research'",
      'organization_domain_retention_policies_domain_check',
      'organization_domain_retention_sweeps_domain_check',
      'delete from public.schema_migrations',
    ]) {
      expect(reversal).toContain(named);
    }
  });

  it('leaves no route back to research through the narrowed constraint', () => {
    for (const table of [
      'organization_domain_retention_policies',
      'organization_domain_retention_sweeps',
    ]) {
      expect(acceptedDomains(reversal, table)).not.toContain('research');
    }
  });
});
