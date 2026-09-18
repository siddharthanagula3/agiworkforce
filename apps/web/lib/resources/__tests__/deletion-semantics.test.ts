import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RESOURCE_DELETION_POLICIES,
  RESOURCE_RECOVERY_WINDOW_DAYS,
  cascadeConsequence,
  resourceDeletionPolicy,
  resourcePurgeStatement,
} from '../deletion-policies';
import { lifecycleScopeSql, restorableScopeSql } from '../lifecycle-sql';
import { isAiRetrievableLifecycleState, lifecycleSemantics } from '@agiworkforce/types';

const migrationsDir = join(process.cwd(), 'db/neon');

function executableSql(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/u, ''))
    .join('\n');
}

const migrations = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'));
const allSql = migrations.map(executableSql).join('\n');

/**
 * Every table whose schema declares a `deleted_at` column, read from the
 * migrations rather than listed here: a table that gains soft delete without
 * gaining a deletion policy must fail this file.
 */
function tablesWithSoftDelete(): Set<string> {
  const tables = new Set<string>();
  for (const filename of migrations) {
    let current: string | null = null;
    for (const rawLine of executableSql(filename).split('\n')) {
      const line = rawLine.trim().toLowerCase();
      const table = /^(?:create|alter) table(?: if (?:not )?exists)?\s+(?:public\.)?"?(\w+)/u.exec(
        line,
      );
      if (table) current = table[1] ?? null;
      const declares =
        /^(?:add column (?:if not exists )?)?deleted_at\s+timestamptz/u.test(line) ||
        /add column if not exists deleted_at/u.test(line);
      if (declares && current !== null) tables.add(current);
    }
  }
  return tables;
}

describe('resource deletion semantics', () => {
  it('finds the soft-deletable tables in the migrations rather than vacuously passing', () => {
    expect([...tablesWithSoftDelete()].sort()).toEqual([
      'media_assets',
      'project_knowledge_files',
      'user_projects',
      'web_artifacts',
      'web_conversations',
      'web_messages',
    ]);
  });

  it('registers a deletion policy for every soft-deletable table', () => {
    const registered = new Set(RESOURCE_DELETION_POLICIES.map((policy) => policy.table));
    const unregistered = [...tablesWithSoftDelete()].filter((table) => !registered.has(table));
    expect(unregistered, 'tables carry deleted_at with no deletion policy').toEqual([]);
  });

  it('registers no policy for a table that has no soft-delete column', () => {
    const soft = tablesWithSoftDelete();
    const phantom = RESOURCE_DELETION_POLICIES.filter((policy) => !soft.has(policy.table));
    expect(phantom.map((policy) => policy.table)).toEqual([]);
  });

  it('gives every policy a bounded recovery window', () => {
    for (const policy of RESOURCE_DELETION_POLICIES) {
      expect(policy.recoveryWindowDays, policy.table).toBeGreaterThan(0);
      expect(policy.recoveryWindowDays, policy.table).toBe(RESOURCE_RECOVERY_WINDOW_DAYS);
      expect(policy.basis.length, policy.table).toBeGreaterThan(20);
    }
  });

  it('gives the purge an index it can use on every soft-deletable table', () => {
    for (const policy of RESOURCE_DELETION_POLICIES) {
      expect(allSql, policy.table).toContain(`on public.${policy.table} (${policy.softDeleteColumn})
  where ${policy.softDeleteColumn} is not null`);
    }
  });

  it('backs every declared child relation with the foreign key that enforces it', () => {
    for (const policy of RESOURCE_DELETION_POLICIES) {
      for (const child of policy.children) {
        const action = child.disposition === 'cascade_delete' ? 'cascade' : 'set null';
        const pattern = new RegExp(
          `${child.column}[^,;]*references\\s+(?:public\\.)?${policy.table}\\s*\\(\\s*id\\s*\\)[^,;]*on delete ${action}`,
          'is',
        );
        expect(
          pattern.test(allSql),
          `${child.table}.${child.column} -> ${policy.table} on delete ${action}`,
        ).toBe(true);
      }
    }
  });

  it('deletes the derived index and its embeddings with the source row', () => {
    const retrieval = executableSql('0202_retrieval_index.sql');
    expect(retrieval).toContain('embedding');
    for (const policy of RESOURCE_DELETION_POLICIES) {
      for (const derived of policy.derivedIndexes) {
        expect(retrieval, `${derived.table}.${derived.column}`).toMatch(
          new RegExp(
            `${derived.column}\\s+uuid\\s+references\\s+public\\.${policy.table}\\(id\\)\\s+on delete cascade`,
            'i',
          ),
        );
      }
      // retrieval_chunks holds the embedding and cascades from its document,
      // so one FK removes the chunk vectors with the document above it.
      expect(retrieval).toMatch(
        /document_id uuid not null references public\.retrieval_documents\(id\) on delete cascade/i,
      );
    }
  });

  it('takes an archived resource out of the retrieval index, as the contract says', () => {
    const archive = executableSql('0244_archived_resources_leave_ai_retrieval.sql');

    expect(isAiRetrievableLifecycleState('archived')).toBe(false);
    expect(lifecycleSemantics('archived').restorable).toBe(true);

    expect(archive).toContain('new.deleted_at is not null or new.is_temporary or new.archived');
    expect(archive).toContain(
      'after insert or update of title, deleted_at, is_temporary, archived',
    );
    expect(archive).toMatch(/if v_archived then\s+perform public\.retrieval_forget_document/u);
    expect(archive).toContain('after update of is_archived, deleted_at');

    // The archive path removes the derived copy only. Nothing here touches a
    // source table, which is what keeps archive restorable.
    expect(archive).not.toMatch(/delete from public\.(web_conversations|user_projects)/u);
  });

  it('names the object-storage column on every table that holds one', () => {
    for (const policy of RESOURCE_DELETION_POLICIES) {
      if (policy.externalObjects === null) continue;
      const pattern = new RegExp(
        `^\\s*(add column (if not exists )?)?${policy.externalObjects.column}\\s+text`,
        'mu',
      );
      expect(pattern.test(allSql), `${policy.table}.${policy.externalObjects.column}`).toBe(true);
    }
    expect(
      RESOURCE_DELETION_POLICIES.filter((policy) => policy.externalObjects !== null).map(
        (policy) => policy.table,
      ),
    ).toEqual(['project_knowledge_files', 'media_assets']);
  });

  it('never cascades a record it declares retained after purge', () => {
    for (const policy of RESOURCE_DELETION_POLICIES) {
      for (const retained of policy.retainedAfterPurge) {
        const cascaded = policy.children.find(
          (child) => child.table === retained && child.disposition === 'cascade_delete',
        );
        expect(
          cascaded,
          `${policy.table} cascades ${retained} it claims to retain`,
        ).toBeUndefined();
      }
    }
    expect(migrations).toContain('0167_retain_audit_events_after_organization_deletion.sql');
  });

  it('purges oldest-first, bounded, and only past the window', () => {
    const policy = resourceDeletionPolicy('web_conversations');
    expect(policy).not.toBeNull();
    const statement = resourcePurgeStatement(policy!);
    expect(statement.sql).toContain('deleted_at is not null');
    expect(statement.sql).toContain('deleted_at < now() - $1::interval');
    expect(statement.sql).toContain('order by deleted_at asc');
    expect(statement.params[0]).toBe('30 days');
    expect(statement.params[1]).toBeGreaterThan(0);
  });

  it('never returns a soft-deleted row to a reader, whatever it asked for', () => {
    expect(lifecycleScopeSql('web_conversations')).toBe('deleted_at is null and archived = false');
    expect(lifecycleScopeSql('web_conversations', { includeArchived: true })).toBe(
      'deleted_at is null',
    );
    expect(lifecycleScopeSql('user_projects', { alias: 'p' })).toBe(
      'p.deleted_at is null and p.is_archived = false',
    );
  });

  it('bounds restore by the same window the purge enforces', () => {
    expect(restorableScopeSql('media_assets')).toBe(
      "deleted_at is not null and deleted_at > now() - interval '30 days'",
    );
  });

  it('names the cascade a confirm dialog has to warn about', () => {
    const project = resourceDeletionPolicy('user_projects');
    expect(cascadeConsequence(project!)).toContain('project knowledge files');
    expect(cascadeConsequence(project!)).toContain('30 days');

    const message = resourceDeletionPolicy('web_messages');
    expect(cascadeConsequence(message!)).toBeNull();
  });

  it('refuses a table name that is not an identifier', () => {
    const policy = resourceDeletionPolicy('web_conversations');
    expect(() =>
      resourcePurgeStatement({ ...policy!, table: 'web_conversations; drop table profiles' }),
    ).toThrow(/Unsafe table/u);
  });
});
