import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsonbObjectSql } from '@/lib/server/jsonb-object-merge';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0424_message_metadata_objects.sql');
const down = read('down/0424_message_metadata_objects.down.sql');

const statements = up
  .split('\n')
  .filter((line) => !line.startsWith('--'))
  .join('\n')
  .split(';')
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0);

describe('0424 message metadata objects', () => {
  it('rewrites every message whose metadata is not an object with the expression the writers use', () => {
    const update = statements.find((statement) =>
      statement.startsWith('update public.web_messages'),
    );
    expect(update).toBe(
      `update public.web_messages as message
   set metadata = ${jsonbObjectSql('message.metadata')}
 where jsonb_typeof(message.metadata) is distinct from 'object'`,
    );
  });

  it('rewrites a project whose metadata is set but not an object, and leaves SQL NULL alone', () => {
    const update = statements.find((statement) =>
      statement.startsWith('update public.user_projects'),
    );
    expect(update).toBe(
      `update public.user_projects as project
   set metadata = ${jsonbObjectSql('project.metadata')}
 where project.metadata is not null
   and jsonb_typeof(project.metadata) <> 'object'`,
    );
  });

  it('touches no other table and changes no schema', () => {
    const writes = statements.filter((statement) =>
      /^(update|insert|delete|alter|create|drop|grant|revoke|truncate)\b/i.test(statement),
    );
    expect(writes).toHaveLength(2);
  });

  it('refuses to run where row level security would hide the rows it repairs', () => {
    expect(up).toContain('(rolsuper or rolbypassrls)');
    expect(up).toContain('raise exception');
  });

  it('runs in one bounded transaction', () => {
    expect(statements[0]).toBe('begin');
    expect(statements.at(-1)).toBe('commit');
    expect(statements.filter((statement) => /^(begin|commit)$/i.test(statement))).toHaveLength(2);
    expect(up).toContain("set local lock_timeout = '5s';");
    expect(up).toContain("set local statement_timeout = '120s';");
  });

  it('retracts its ledger row and says what the reversal cannot restore', () => {
    expect(down).toMatch(/^begin;$/m);
    expect(down).toMatch(/^commit;$/m);
    expect(down).toContain("where filename = '0424_message_metadata_objects.sql';");
    expect(down).toContain('WHAT THIS COSTS');
  });
});
