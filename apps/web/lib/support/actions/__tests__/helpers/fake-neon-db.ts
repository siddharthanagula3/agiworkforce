import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export interface FakeProposalRow {
  id: string;
  user_id: string;
  action_id: string;
  params: Record<string, unknown>;
  params_hash: string;
  token_hash: string;
  surface: string;
  conversation_ref: string | null;
  expires_at: Date;
  consumed_at: Date | null;
  outcome: string;
  created_at: Date;
}

export interface FakeConnectorRow {
  id: string;
  connector_id: string;
  connected_at: string;
}

export interface FakeApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  scopes: string[];
  revoked_at: string | null;
  expires_at?: string | null;
  project_id?: string | null;
}

export interface FakeDbCall {
  sql: string;
  params: unknown[];
}

export interface FakeProjectRow {
  id: string;
  user_id: string;
  archived_at: string | null;
}

export function createFakeNeonDb(seed?: {
  proposals?: FakeProposalRow[];
  connectors?: FakeConnectorRow[];
  apiKeys?: FakeApiKeyRow[];
  projects?: FakeProjectRow[];
}) {
  const proposals: FakeProposalRow[] = [...(seed?.proposals ?? [])];
  const connectors: FakeConnectorRow[] = [...(seed?.connectors ?? [])];
  const apiKeys: FakeApiKeyRow[] = [...(seed?.apiKeys ?? [])];
  const projects: FakeProjectRow[] = [...(seed?.projects ?? [])];
  const calls: FakeDbCall[] = [];
  let idCounter = 0;

  function nextId(): string {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
  }

  function run(sql: string, params: unknown[], keys = apiKeys): unknown[] {
    calls.push({ sql, params });
    const normalized = sql.replace(/\s+/gu, ' ').trim();

    if (/^insert into public\.support_action_proposals/iu.test(normalized)) {
      const row: FakeProposalRow = {
        id: nextId(),
        user_id: String(params[0]),
        action_id: String(params[1]),
        params: JSON.parse(String(params[2])) as Record<string, unknown>,
        params_hash: String(params[3]),
        token_hash: String(params[4]),
        surface: String(params[5]),
        conversation_ref: params[6] === null ? null : String(params[6]),
        expires_at: new Date(String(params[7])),
        consumed_at: null,
        outcome: 'proposed',
        created_at: new Date(),
      };
      if (proposals.some((p) => p.token_hash === row.token_hash)) {
        throw new Error('duplicate key value violates unique constraint');
      }
      proposals.push(row);
      return [{ id: row.id }];
    }

    if (
      /^select action_id from public\.support_action_proposals where id = \$1/iu.test(normalized)
    ) {
      const [id, userId, tokenHash] = params as [string, string, string];
      const now = Date.now();
      const row = proposals.find(
        (p) =>
          p.id === id &&
          p.user_id === userId &&
          p.token_hash === tokenHash &&
          p.consumed_at === null &&
          p.expires_at.getTime() > now,
      );
      return row ? [{ action_id: row.action_id }] : [];
    }

    if (/update public\.support_action_proposals set consumed_at = now\(\)/iu.test(normalized)) {
      const [id, userId, tokenHash] = params as [string, string, string];
      const now = Date.now();
      const row = proposals.find(
        (p) =>
          p.id === id &&
          p.user_id === userId &&
          p.token_hash === tokenHash &&
          p.consumed_at === null &&
          p.expires_at.getTime() > now,
      );
      if (!row) return [];
      row.consumed_at = new Date();
      row.outcome = 'executing';
      return [
        {
          id: row.id,
          action_id: row.action_id,
          params: row.params,
          params_hash: row.params_hash,
          expires_at: row.expires_at.toISOString(),
        },
      ];
    }

    if (/update public\.support_action_proposals set outcome = \$3/iu.test(normalized)) {
      const [id, userId, outcome] = params as [string, string, string];
      const row = proposals.find((p) => p.id === id && p.user_id === userId);
      if (row) row.outcome = outcome;
      return [];
    }

    if (/select count\(\*\) as count from public\.support_action_proposals/iu.test(normalized)) {
      const [userId, actionId] = params as [string, string];
      const count = proposals.filter(
        (p) => p.user_id === userId && p.action_id === actionId,
      ).length;
      return [{ count: String(count) }];
    }

    if (/^select id, connector_id, connected_at from user_connectors/iu.test(normalized)) {
      return connectors.map((c) => ({ ...c }));
    }
    if (/^update user_connectors set is_active = false/iu.test(normalized)) {
      const connectorId = String(params[2]);
      const index = connectors.findIndex((c) => c.connector_id === connectorId);
      if (index >= 0) connectors.splice(index, 1);
      return [];
    }
    if (/^delete from github_installations/iu.test(normalized)) return [];
    if (/^delete from public\.connector_tool_permissions/iu.test(normalized)) return [];

    if (
      normalized ===
      'update public.developer_projects set updated_at = now() where id = $1 and user_id = $2 and archived_at is null returning id'
    ) {
      return projects
        .filter(
          (project) =>
            project.id === params[0] &&
            project.user_id === params[1] &&
            project.archived_at === null,
        )
        .map((project) => ({ id: project.id }));
    }
    if (
      /^select id(?:, name, scopes, expires_at, project_id)? from public\.api_keys/iu.test(
        normalized,
      )
    ) {
      const [keyId, userId] = params as [string, string];
      const row = keys.find((k) => k.id === keyId && k.user_id === userId && k.revoked_at === null);
      return row
        ? [
            {
              id: row.id,
              name: row.name,
              scopes: row.scopes,
              expires_at: row.expires_at,
              project_id: row.project_id,
            },
          ]
        : [];
    }
    if (/^select count\(\*\) as count from public\.api_keys/iu.test(normalized)) {
      const userId = String(params[0]);
      return [
        {
          count: String(keys.filter((k) => k.user_id === userId && k.revoked_at === null).length),
        },
      ];
    }
    if (/^update api_keys set revoked_at = now\(\)/iu.test(normalized)) {
      const [keyId, userId] = params as [string, string];
      const row = keys.find((k) => k.id === keyId && k.user_id === userId && k.revoked_at === null);
      if (row) row.revoked_at = new Date().toISOString();
      return row ? [row] : [];
    }
    if (/^insert into api_keys/iu.test(normalized)) {
      const row: FakeApiKeyRow = {
        id: nextId(),
        user_id: String(params[0]),
        name: String(params[1]),
        scopes: params[4] as string[],
        revoked_at: null,
        expires_at: params[5] === null ? null : String(params[5]),
        project_id: params[6] === null ? null : String(params[6]),
      };
      keys.push(row);
      return [
        {
          id: row.id,
          user_id: row.user_id,
          name: row.name,
          key_hash: String(params[2]),
          key_prefix: String(params[3]),
          scopes: row.scopes,
          created_at: new Date().toISOString(),
          last_used_at: null,
          expires_at: row.expires_at,
          project_id: row.project_id,
          revoked_at: null,
        },
      ];
    }

    throw new Error(`fake-neon-db: unmocked SQL -> ${normalized}`);
  }

  const forbidScopeChange = (): never => {
    throw new Error('Unexpected scope rebinding');
  };
  const adapter: DatabaseAdapter = {
    query: async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (
        /^\s*(?:insert into api_keys|update api_keys|update public\.developer_projects)/iu.test(sql)
      ) {
        throw new Error('Key lifecycle mutation escaped transaction');
      }
      return run(sql, params) as T[];
    },
    execute: async (sql: string, params: unknown[] = []): Promise<number> => {
      if (
        /^\s*(?:insert into api_keys|update api_keys|update public\.developer_projects)/iu.test(sql)
      ) {
        throw new Error('Key lifecycle mutation escaped transaction');
      }
      return run(sql, params).length;
    },
    withUser: forbidScopeChange,
    withOrg: forbidScopeChange,
    dispose: async () => {},
    transaction: async <T>(callback: (tx: DatabaseAdapter) => Promise<T>): Promise<T> => {
      const stagedKeys = structuredClone(apiKeys);
      let phase: 'discovery' | 'project' | 'locked' | 'revoke' | 'insert' | 'done' = 'discovery';
      let owner: unknown;
      let keyId: unknown;
      let projectId: unknown;
      const tx: DatabaseAdapter = {
        query: async <Row>(sql: string, params: unknown[] = []): Promise<Row[]> => {
          const normalized = sql.replace(/\s+/gu, ' ').trim();
          const keyRead =
            'select id, name, scopes, expires_at, project_id from public.api_keys where id = $1 and user_id = $2 and revoked_at is null limit 2';
          if (phase === 'discovery' && normalized === keyRead) {
            [keyId, owner] = params;
            const rows = run(sql, params, stagedKeys) as FakeApiKeyRow[];
            projectId = rows[0]?.project_id;
            phase = projectId === null ? 'locked' : 'project';
            return rows as unknown as Row[];
          }
          if (
            phase === 'project' &&
            normalized ===
              'update public.developer_projects set updated_at = now() where id = $1 and user_id = $2 and archived_at is null returning id' &&
            params[0] === projectId &&
            params[1] === owner
          ) {
            phase = 'locked';
            return run(sql, params, stagedKeys) as Row[];
          }
          if (
            phase === 'locked' &&
            normalized === `${keyRead} for update` &&
            params[0] === keyId &&
            params[1] === owner
          ) {
            phase = 'revoke';
            return run(sql, params, stagedKeys) as Row[];
          }
          if (
            phase === 'insert' &&
            /^insert into api_keys /iu.test(normalized) &&
            params[0] === owner &&
            params[6] === projectId
          ) {
            phase = 'done';
            return run(sql, params, stagedKeys) as Row[];
          }
          throw new Error(`Unexpected rotation query during ${phase}: ${normalized}`);
        },
        execute: async (sql: string, params: unknown[] = []): Promise<number> => {
          const normalized = sql.replace(/\s+/gu, ' ').trim();
          if (
            phase !== 'revoke' ||
            normalized !==
              'UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL' ||
            params[0] !== keyId ||
            params[1] !== owner
          ) {
            throw new Error(`Unexpected rotation mutation during ${phase}: ${normalized}`);
          }
          phase = 'insert';
          return run(sql, params, stagedKeys).length;
        },
        transaction: async () => {
          throw new Error('Unexpected nested transaction');
        },
        withUser: forbidScopeChange,
        withOrg: forbidScopeChange,
        dispose: async () => {},
      };
      const result = await callback(tx);
      apiKeys.splice(0, apiKeys.length, ...stagedKeys);
      return result;
    },
  };

  return {
    adapter,
    proposals,
    connectors,
    apiKeys,
    projects,
    calls,
    callsMatching(pattern: RegExp): FakeDbCall[] {
      return calls.filter((c) => pattern.test(c.sql.replace(/\s+/gu, ' ')));
    },
  };
}
