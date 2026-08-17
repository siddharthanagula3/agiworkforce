import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BLANKET_GRANT_BASELINE,
  blanketGrantErrors,
} from '../../../../scripts/check-neon-migrations.mjs';

const migrationsDir = join(process.cwd(), 'db/neon');
const TRIGGER_MIGRATION = '0123_audit_log_immutability_trigger.sql';

function executableSql(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/u, ''))
    .join('\n');
}

const migrationFilenames = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  .map((entry) => entry.name)
  .sort();

const trigger = executableSql(TRIGGER_MIGRATION);

describe('security_audit_logs append-only · the trigger a re-grant cannot undo', () => {
  it('guards mutation before it happens, on both UPDATE and DELETE', () => {
    expect(trigger).toMatch(
      /create trigger security_audit_logs_append_only\s+before update or delete on public\.security_audit_logs/iu,
    );
    expect(trigger).toMatch(/for each row/iu);
    expect(trigger).toMatch(/execute function public\.security_audit_logs_forbid_mutation\(\)/iu);
  });

  it('refuses every role that is not the table owner, rather than naming app_rls', () => {
    expect(trigger).toMatch(
      /select pg_get_userbyid\(relowner\)[\s\S]*'public\.security_audit_logs'::regclass/iu,
    );
    expect(trigger).toMatch(/if current_user is distinct from table_owner then/iu);
    expect(trigger).not.toMatch(/current_user\s*=\s*'app_rls'/iu);
  });

  it('raises a permission error rather than silently dropping the write', () => {
    expect(trigger).toMatch(/raise exception/iu);
    expect(trigger).toMatch(/errcode = 'insufficient_privilege'/iu);
  });

  it('returns the row the trigger was fired for, so the owner path still completes', () => {
    expect(trigger).toMatch(/return case when tg_op = 'DELETE' then old else new end/iu);
  });

  it('re-asserts the 0043 REVOKE, so a grant applied since is removed too', () => {
    expect(trigger).toMatch(/revoke update, delete on public\.security_audit_logs from app_rls/iu);
  });

  it('ships alongside 0043, which the trigger backstops rather than replaces', () => {
    expect(executableSql('0043_audit_log_immutability.sql')).toMatch(
      /revoke update, delete on public\.security_audit_logs from app_rls/iu,
    );
  });
});

describe('security_audit_logs append-only · no migration re-grants the mutation', () => {
  it('leaves the blanket schema-wide grant to the one migration that established the role', () => {
    const offenders = migrationFilenames.flatMap((filename) =>
      blanketGrantErrors(filename, readFileSync(join(migrationsDir, filename), 'utf8')),
    );

    expect(offenders).toEqual([]);
    expect(migrationFilenames).toContain(BLANKET_GRANT_BASELINE);
  });

  it('never re-grants UPDATE or DELETE on the audit table to the runtime role', () => {
    for (const filename of migrationFilenames) {
      expect(executableSql(filename)).not.toMatch(
        /grant[^;]*\b(?:update|delete)\b[^;]*on\s+(?:public\.)?security_audit_logs[^;]*to\s+app_rls/iu,
      );
    }
  });
});

describe('migration lint · GRANT ... ON ALL TABLES IN SCHEMA public', () => {
  it('rejects a new migration that re-issues the blanket grant', () => {
    const errors = blanketGrantErrors(
      '0900_widget_access.sql',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;',
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('security_audit_logs');
  });

  it('grandfathers only the migration that created the role', () => {
    const blanket = 'grant select on all tables in schema public to app_rls;';

    expect(blanketGrantErrors(BLANKET_GRANT_BASELINE, blanket)).toEqual([]);
    expect(blanketGrantErrors('0901_copy_of_0037.sql', blanket)).toHaveLength(1);
  });

  it('reads a grant that spans lines the way a real migration writes it', () => {
    expect(
      blanketGrantErrors(
        '0902_multiline.sql',
        'grant select, insert, update, delete\n  on all tables\n  in schema public\n  to app_rls;',
      ),
    ).toHaveLength(1);
  });

  it('leaves table-scoped grants alone', () => {
    expect(
      blanketGrantErrors(
        '0903_scoped.sql',
        'grant select, insert on public.security_audit_logs to app_rls;',
      ),
    ).toEqual([]);
  });

  it('does not fire on a migration that only warns about the footgun in prose', () => {
    expect(
      blanketGrantErrors(
        '0904_prose.sql',
        '-- never issue grant ... on all tables in schema public to app_rls\nrevoke update on public.security_audit_logs from app_rls;',
      ),
    ).toEqual([]);
  });
});
