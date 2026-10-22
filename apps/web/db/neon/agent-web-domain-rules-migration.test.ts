import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_WEB_DOMAINS_MAX } from '@agiworkforce/cloud-contracts';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0387_agent_web_domain_rules.sql');
const down = read('down/0387_agent_web_domain_rules.down.sql');

describe('0387 agent web domain rules', () => {
  it('adds two empty-by-default domain lists bounded by the contract', () => {
    expect(up).toContain(
      'add column if not exists allowed_web_domains text[] not null default array[]::text[]',
    );
    expect(up).toContain(
      'add column if not exists blocked_web_domains text[] not null default array[]::text[]',
    );
    expect(up).toContain(`cardinality(allowed_web_domains) <= ${AGENT_WEB_DOMAINS_MAX}`);
    expect(up).toContain(`cardinality(blocked_web_domains) <= ${AGENT_WEB_DOMAINS_MAX}`);
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('drop constraint if exists user_agents_web_domain_lists_bounded;');
    expect(down).toContain('drop column if exists blocked_web_domains');
    expect(down).toContain('drop column if exists allowed_web_domains;');
    expect(down).toContain("where filename = '0387_agent_web_domain_rules.sql';");
  });
});
