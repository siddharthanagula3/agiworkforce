import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { CLOUD_CODE_ENVIRONMENT_LIMITS } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import { createDatabaseAdapterFake } from '@/test/database-adapter-fake';
import {
  CLOUD_CODE_ENVIRONMENT_LIMIT_REACHED,
  CLOUD_CODE_ENVIRONMENT_NAME_TAKEN,
  CLOUD_CODE_ENVIRONMENT_REQUEST_REUSED,
  CloudCodeEnvironmentConflictError,
  CloudCodeEnvironmentNotFoundError,
  CloudCodeEnvironmentValidationError,
  createCloudCodeEnvironment,
  deleteCloudCodeEnvironment,
  listCloudCodeEnvironments,
  updateCloudCodeEnvironment,
} from '@/lib/services/cloud-code-environment-service';

const OWNER = { userId: 'user-1', organizationId: null };
const WORKSPACE_OWNER = { userId: 'user-1', organizationId: 'org-1' };
const ENVIRONMENT_ID = '0190a000-0000-7000-8000-000000000001';

const ROW = {
  id: ENVIRONMENT_ID,
  name: 'Web app',
  network_access: 'trusted',
  extra_hosts: ['registry.example.com'],
  allow_package_managers: true,
  setup_script: 'npm install',
  env_var_names: ['API_TOKEN'],
  is_default: false,
  created_at: new Date('2026-11-16T10:00:00.000Z'),
  updated_at: '2026-11-16T11:00:00.000Z',
};

interface Answer {
  match: RegExp;
  rows: unknown[];
}

function recordingDb(answers: Answer[] = []) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const db: DatabaseAdapter = createDatabaseAdapterFake({
    query: (async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      return answers.find((answer) => answer.match.test(sql))?.rows ?? [];
    }) as DatabaseAdapter['query'],
  });
  return { db, statements };
}

function statementIndex(statements: Array<{ sql: string }>, pattern: RegExp): number {
  return statements.findIndex((statement) => pattern.test(statement.sql));
}

const CREATE = {
  requestId: 'request-0001',
  name: 'Web app',
  networkAccess: 'trusted' as const,
};

describe('listCloudCodeEnvironments', () => {
  it('reads only the caller in their current scope and never selects the sealed values', async () => {
    const { db, statements } = recordingDb([
      { match: /from cloud_code_environments/, rows: [ROW] },
    ]);

    const environments = await listCloudCodeEnvironments(db, WORKSPACE_OWNER);

    expect(environments).toEqual([
      {
        id: ENVIRONMENT_ID,
        name: 'Web app',
        networkAccess: 'trusted',
        extraHosts: ['registry.example.com'],
        allowPackageManagers: true,
        setupScript: 'npm install',
        variableNames: ['API_TOKEN'],
        isDefault: false,
        createdAt: '2026-11-16T10:00:00.000Z',
        updatedAt: '2026-11-16T11:00:00.000Z',
      },
    ]);
    const [statement] = statements;
    expect(statement?.sql).toContain('user_id = $1 and organization_id is not distinct from $2');
    expect(statement?.params).toEqual(['user-1', 'org-1']);
    expect(statement?.sql).not.toContain('env_vars_encrypted');
  });
});

describe('createCloudCodeEnvironment', () => {
  it('stores a new environment under the owner lock and reports it as new', async () => {
    const { db, statements } = recordingDb([
      { match: /count\(\*\)/, rows: [{ total: '2' }] },
      { match: /insert into cloud_code_environments/, rows: [ROW] },
    ]);

    const created = await createCloudCodeEnvironment(db, OWNER, {
      ...CREATE,
      extraHosts: [' Registry.Example.com '],
      setupScript: 'npm install',
    });

    expect(created.reused).toBe(false);
    expect(created.environment.id).toBe(ENVIRONMENT_ID);
    expect(statementIndex(statements, /pg_advisory_xact_lock/)).toBe(0);
    const insert = statements.find((statement) => /insert into/.test(statement.sql));
    expect(insert?.params).toEqual([
      'user-1',
      null,
      'request-0001',
      'Web app',
      'trusted',
      ['registry.example.com'],
      true,
      'npm install',
      false,
    ]);
    expect(insert?.sql).not.toContain('env_vars_encrypted');
  });

  it('returns the environment a retried request already made instead of a second one', async () => {
    const { db, statements } = recordingDb([{ match: /request_id = \$3/, rows: [ROW] }]);

    const created = await createCloudCodeEnvironment(db, OWNER, CREATE);

    expect(created).toMatchObject({ reused: true, environment: { id: ENVIRONMENT_ID } });
    expect(statementIndex(statements, /insert into/)).toBe(-1);
  });

  it('clears the previous default before it inserts a new default', async () => {
    const { db, statements } = recordingDb([
      { match: /insert into cloud_code_environments/, rows: [{ ...ROW, is_default: true }] },
    ]);

    await createCloudCodeEnvironment(db, OWNER, { ...CREATE, isDefault: true });

    const cleared = statementIndex(statements, /set is_default = false/);
    expect(cleared).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(statementIndex(statements, /insert into/));
  });

  it('refuses a name the account already uses, ignoring case', async () => {
    const { db, statements } = recordingDb([
      { match: /lower\(name\) = lower\(\$3\)/, rows: [{ id: 'other' }] },
    ]);

    await expect(createCloudCodeEnvironment(db, OWNER, CREATE)).rejects.toThrow(
      CLOUD_CODE_ENVIRONMENT_NAME_TAKEN,
    );
    expect(statementIndex(statements, /insert into/)).toBe(-1);
  });

  it('refuses the name of the built-in environment', async () => {
    const { db, statements } = recordingDb();

    await expect(
      createCloudCodeEnvironment(db, OWNER, { ...CREATE, name: ' default ' }),
    ).rejects.toBeInstanceOf(CloudCodeEnvironmentConflictError);
    expect(statements).toHaveLength(0);
  });

  it('stops at the account limit', async () => {
    const { db, statements } = recordingDb([
      {
        match: /count\(\*\)/,
        rows: [{ total: String(CLOUD_CODE_ENVIRONMENT_LIMITS.perAccount) }],
      },
    ]);

    await expect(createCloudCodeEnvironment(db, OWNER, CREATE)).rejects.toThrow(
      CLOUD_CODE_ENVIRONMENT_LIMIT_REACHED,
    );
    expect(statementIndex(statements, /insert into/)).toBe(-1);
  });

  it.each([
    ['full internet without the acknowledgement', { networkAccess: 'full' as const }],
    ['an address literal as an extra host', { extraHosts: ['10.0.0.1'] }],
    [
      'more extra hosts than allowed',
      { extraHosts: Array.from({ length: 11 }, (_, i) => `h${i}.example.com`) },
    ],
    [
      'a setup script over the size limit',
      { setupScript: 'x'.repeat(CLOUD_CODE_ENVIRONMENT_LIMITS.setupScriptBytes + 1) },
    ],
    ['a name over the length limit', { name: 'n'.repeat(CLOUD_CODE_ENVIRONMENT_LIMITS.name + 1) }],
  ])('refuses %s before touching the database', async (_label, change) => {
    const { db, statements } = recordingDb();

    await expect(
      createCloudCodeEnvironment(db, OWNER, { ...CREATE, ...change }),
    ).rejects.toBeInstanceOf(CloudCodeEnvironmentValidationError);
    expect(statements).toHaveLength(0);
  });

  it('accepts full internet once it is acknowledged', async () => {
    const { db } = recordingDb([
      { match: /insert into/, rows: [{ ...ROW, network_access: 'full' }] },
    ]);

    const created = await createCloudCodeEnvironment(db, OWNER, {
      ...CREATE,
      networkAccess: 'full',
      fullNetworkAcknowledged: true,
    });

    expect(created.environment.networkAccess).toBe('full');
  });

  it('turns a name collision raised by the unique index into the same conflict', async () => {
    const db = createDatabaseAdapterFake({
      transaction: async () => {
        throw Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'cloud_code_environments_owner_name_key',
        });
      },
    });

    await expect(createCloudCodeEnvironment(db, OWNER, CREATE)).rejects.toThrow(
      CLOUD_CODE_ENVIRONMENT_NAME_TAKEN,
    );
  });

  it('answers a request id already used in another workspace with a conflict, not a server error', async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const db = createDatabaseAdapterFake({
      query: (async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params });
        if (/insert into cloud_code_environments/.test(sql)) {
          throw Object.assign(new Error('duplicate key'), {
            code: '23505',
            constraint: 'cloud_code_environments_request_key',
          });
        }
        return /count\(\*\)/.test(sql) ? [{ total: '0' }] : [];
      }) as DatabaseAdapter['query'],
    });

    const attempt = createCloudCodeEnvironment(db, WORKSPACE_OWNER, CREATE);

    await expect(attempt).rejects.toBeInstanceOf(CloudCodeEnvironmentConflictError);
    await expect(attempt).rejects.toThrow(CLOUD_CODE_ENVIRONMENT_REQUEST_REUSED);
    const lookup = statements.find((statement) => /request_id = \$3/.test(statement.sql));
    expect(lookup?.params).toEqual(['user-1', 'org-1', 'request-0001']);
  });
});

describe('updateCloudCodeEnvironment', () => {
  it('makes one environment the default and clears every other one first', async () => {
    const { db, statements } = recordingDb([
      { match: /for update/, rows: [{ id: ENVIRONMENT_ID }] },
      { match: /update cloud_code_environments\s+set name/, rows: [{ ...ROW, is_default: true }] },
    ]);

    const environment = await updateCloudCodeEnvironment(db, OWNER, ENVIRONMENT_ID, {
      isDefault: true,
    });

    expect(environment.isDefault).toBe(true);
    const cleared = statements[statementIndex(statements, /set is_default = false/)];
    expect(cleared?.params).toEqual(['user-1', null, ENVIRONMENT_ID]);
    expect(statementIndex(statements, /set is_default = false/)).toBeLessThan(
      statementIndex(statements, /set name = coalesce/),
    );
    const update = statements[statementIndex(statements, /set name = coalesce/)];
    expect(update?.params).toEqual([
      ENVIRONMENT_ID,
      'user-1',
      null,
      null,
      null,
      null,
      null,
      null,
      true,
    ]);
  });

  it('asks for the acknowledgement when it moves an environment to full internet', async () => {
    const { db, statements } = recordingDb();

    await expect(
      updateCloudCodeEnvironment(db, OWNER, ENVIRONMENT_ID, { networkAccess: 'full' }),
    ).rejects.toBeInstanceOf(CloudCodeEnvironmentValidationError);
    expect(statements).toHaveLength(0);
  });

  it('reports an environment that is not the caller’s as not found', async () => {
    const { db, statements } = recordingDb();

    await expect(
      updateCloudCodeEnvironment(db, OWNER, ENVIRONMENT_ID, { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(CloudCodeEnvironmentNotFoundError);
    expect(statementIndex(statements, /set name = coalesce/)).toBe(-1);
  });

  it('reports an id that is not a uuid as not found without a query', async () => {
    const { db, statements } = recordingDb();

    await expect(
      updateCloudCodeEnvironment(db, OWNER, 'not-an-id', { isDefault: true }),
    ).rejects.toBeInstanceOf(CloudCodeEnvironmentNotFoundError);
    expect(statements).toHaveLength(0);
  });
});

describe('deleteCloudCodeEnvironment', () => {
  it('deletes only the caller’s own row', async () => {
    const { db, statements } = recordingDb([
      { match: /delete from cloud_code_environments/, rows: [{ id: ENVIRONMENT_ID }] },
    ]);

    await deleteCloudCodeEnvironment(db, WORKSPACE_OWNER, ENVIRONMENT_ID);

    expect(statements[0]?.sql).toContain(
      'user_id = $2 and organization_id is not distinct from $3',
    );
    expect(statements[0]?.params).toEqual([ENVIRONMENT_ID, 'user-1', 'org-1']);
  });

  it('reports a row it did not delete as not found', async () => {
    const { db } = recordingDb();

    await expect(deleteCloudCodeEnvironment(db, OWNER, ENVIRONMENT_ID)).rejects.toBeInstanceOf(
      CloudCodeEnvironmentNotFoundError,
    );
  });
});
