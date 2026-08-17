import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = resolve(__dirname, '../db/neon');

const DML = ['select', 'insert', 'update', 'delete'] as const;
type Privilege = (typeof DML)[number];

function executableSql(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/--.*$/u, ''))
    .join('\n');
}

function privilegesIn(clause: string): Privilege[] {
  if (/\ball\s+privileges\b/iu.test(clause)) return [...DML];
  return DML.filter((privilege) => new RegExp(`\\b${privilege}\\b`, 'iu').test(clause));
}

function appRlsPrivileges(table: string): Set<Privilege> {
  const held = new Set<Privilege>();
  const statementPattern = new RegExp(
    String.raw`\b(grant|revoke)\b([\s\S]*?)\bon\s+(all\s+tables\s+in\s+schema\s+public|(?:public\.)?${table})\b([\s\S]*?);`,
    'giu',
  );

  const filenames = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();

  for (const filename of filenames) {
    const sql = executableSql(readFileSync(join(migrationsDir, filename), 'utf8'));
    for (const match of sql.matchAll(statementPattern)) {
      const verb = (match[1] ?? '').toLowerCase();
      const privilegeClause = match[2] ?? '';
      const tail = match[4] ?? '';
      if (!/\bapp_rls\b/iu.test(tail)) continue;
      for (const privilege of privilegesIn(privilegeClause)) {
        if (verb === 'grant') held.add(privilege);
        else held.delete(privilege);
      }
    }
  }

  return held;
}

const securityAuditLog = appRlsPrivileges('security_audit_logs');
const enterpriseAuditEvents = appRlsPrivileges('enterprise_audit_events');

const privacySource = readFileSync(resolve(__dirname, '../app/privacy/page.tsx'), 'utf8');

function tableRowAbout(subject: string): string {
  const anchor = privacySource.indexOf(subject);
  expect(anchor, `the privacy policy no longer has a row about "${subject}"`).toBeGreaterThan(-1);
  const end = privacySource.indexOf('</tr>', anchor);
  return privacySource.slice(anchor, end).replace(/\s+/gu, ' ');
}

const survivesErasureRow = tableRowAbout('Security and organisation audit log entries naming you');

describe('what the migrations actually grant app_rls on the audit trails', () => {
  it('lets the application role append security events but never change them', () => {
    expect(securityAuditLog).toEqual(new Set(['select', 'insert']));
  });

  it('keeps the application role off the organisation trail entirely except to read', () => {
    expect(enterpriseAuditEvents).toEqual(new Set(['select']));
  });
});

describe('the privacy policy states those grants rather than a stronger one', () => {
  it('does not tell the reader the application role cannot write the security audit log', () => {
    expect(securityAuditLog.has('insert')).toBe(true);
    expect(
      survivesErasureRow,
      'app_rls holds INSERT on security_audit_logs, so claiming it is blocked from writing overstates the control',
    ).not.toMatch(/blocked from writing/iu);
  });

  it('names the two privileges that are actually revoked on the security trail', () => {
    expect(securityAuditLog.has('update')).toBe(false);
    expect(securityAuditLog.has('delete')).toBe(false);
    expect(survivesErasureRow).toMatch(/cannot update or delete/iu);
  });

  it('says the application role can add a security entry, which is why the trail fills up', () => {
    expect(survivesErasureRow).toMatch(/can\s+add\s+an\s+entry/iu);
  });

  it('distinguishes the organisation trail, where inserting is revoked too', () => {
    expect(enterpriseAuditEvents.has('insert')).toBe(false);
    expect(survivesErasureRow).toMatch(/cannot\s+insert\s+either/iu);
  });

  it('still calls both trails append-only, because both are', () => {
    expect(survivesErasureRow).toMatch(/append-only/iu);
  });
});

describe('the other pages that publish the same claim', () => {
  const securityPage = readFileSync(resolve(__dirname, '../app/security/page.tsx'), 'utf8').replace(
    /\s+/gu,
    ' ',
  );

  it('keeps /security scoped to update and delete', () => {
    expect(securityPage).toMatch(
      /append-only[^.]*update and delete are revoked from the application role/iu,
    );
  });
});
