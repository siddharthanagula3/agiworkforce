import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  topLevelStatements,
  transactionControlErrors,
} from '../../../../scripts/check-neon-migrations.mjs';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0393_connector_session_grant_revocation.sql');
const down = read('down/0393_connector_session_grant_revocation.down.sql');

describe('account-wide connector grant revocation migration contract', () => {
  it('requires a bypass-capable owner and errors rather than silently applying RLS', () => {
    expect(up).toContain('from pg_catalog.pg_roles');
    expect(up).toContain('rolname = current_user and (rolsuper or rolbypassrls)');
    expect(up).toContain(
      "raise exception 'Connector grant revocation requires a privileged owner with BYPASSRLS'",
    );
    expect(up).toContain('security definer');
    expect(up).toContain('set row_security = off');
    expect(up).toContain('set search_path = pg_catalog, pg_temp');
    expect(up.indexOf('rolbypassrls')).toBeLessThan(up.indexOf('create function'));
  });

  it('binds the subject exclusively from authentication and validates arguments', () => {
    expect(up).toMatch(
      /revoke_connector_tool_session_grants\(\s*p_connector_id text,\s*p_tool_name text\s*\)/u,
    );
    expect(up).toContain('v_subject text := public.current_app_user_id()');
    expect(up).toContain(
      "v_subject is null or btrim(v_subject) = '' or char_length(v_subject) > 255",
    );
    expect(up).toContain(
      'p_connector_id is null or char_length(p_connector_id) not between 1 and 200',
    );
    expect(up).toContain(
      'p_tool_name is not null and char_length(p_tool_name) not between 1 and 200',
    );
    expect(up).toContain('where user_id = v_subject');
    expect(up).toContain('and connector_id = p_connector_id');
    expect(up).toContain('and (p_tool_name is null or tool_name = p_tool_name)');
    expect(up).not.toMatch(/\bp_user_id\b|\borganization_id\b|\bweb_conversations\b/u);
  });

  it('exposes only a count and grants only the restricted application entry point', () => {
    expect(up).toContain('returns integer');
    expect(up).toContain('get diagnostics v_removed = row_count');
    expect(up).toContain('return v_removed');
    expect(up).not.toMatch(/returning|return query|alter table|create policy|alter role/iu);
    expect(up).toContain(
      'revoke all on function public.revoke_connector_tool_session_grants(text, text) from public',
    );
    expect(up).toContain(
      'grant execute on function public.revoke_connector_tool_session_grants(text, text) to app_rls',
    );
    const statements = topLevelStatements(up);
    expect(statements[0]).toBe('begin');
    expect(statements.at(-1)).toBe('commit');
    expect(transactionControlErrors('0393_connector_session_grant_revocation.sql', up)).toEqual([]);
  });

  it('rolls back only the function and its migration ledger entry', () => {
    expect(down).toContain('drop function public.revoke_connector_tool_session_grants(text, text)');
    expect(down).toContain("where filename = '0393_connector_session_grant_revocation.sql'");
    expect(down).not.toMatch(/drop table|alter table|create policy|alter role/iu);
    expect(down.trim()).toMatch(/^begin;[\s\S]*commit;$/u);
  });
});
