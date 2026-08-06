/**
 * A small in-memory stand-in for the Neon adapter, used by the support-action
 * tests.
 *
 * It is deliberately NOT a "whatever you asked for, yes" mock. The two
 * statements that carry the security properties — the proposal INSERT and the
 * claim UPDATE — are implemented by evaluating the SAME predicates the real SQL
 * declares, against the bound parameters. So a test that confirms someone
 * else's proposal fails here for the same reason it would fail in Postgres:
 * `user_id = $2` does not match.
 *
 * Because a fake can always drift from the SQL it imitates, the tests ALSO
 * assert on the captured SQL text (that the claim really binds id, user_id and
 * token_hash and really requires `consumed_at is null`). Deleting a predicate
 * from the production query breaks that assertion even though the fake would
 * still behave.
 *
 * Any statement this file does not know is a thrown error, never an empty
 * result: a silently-empty result set is how a mock turns a broken query into a
 * passing test.
 */

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
}

export interface FakeDbCall {
  sql: string;
  params: unknown[];
}

export function createFakeNeonDb(seed?: {
  proposals?: FakeProposalRow[];
  connectors?: FakeConnectorRow[];
  apiKeys?: FakeApiKeyRow[];
}) {
  const proposals: FakeProposalRow[] = [...(seed?.proposals ?? [])];
  const connectors: FakeConnectorRow[] = [...(seed?.connectors ?? [])];
  const apiKeys: FakeApiKeyRow[] = [...(seed?.apiKeys ?? [])];
  const calls: FakeDbCall[] = [];
  let idCounter = 0;

  function nextId(): string {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
  }

  function run(sql: string, params: unknown[]): unknown[] {
    calls.push({ sql, params });
    const normalized = sql.replace(/\s+/gu, ' ').trim();

    // ── support_action_proposals ────────────────────────────────────────────
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
      // `token_hash text not null unique`
      if (proposals.some((p) => p.token_hash === row.token_hash)) {
        throw new Error('duplicate key value violates unique constraint');
      }
      proposals.push(row);
      return [{ id: row.id }];
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

    // ── connectors ──────────────────────────────────────────────────────────
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

    // ── api keys ────────────────────────────────────────────────────────────
    if (/^select id, name, scopes from public\.api_keys/iu.test(normalized)) {
      const [keyId, userId] = params as [string, string];
      const row = apiKeys.find(
        (k) => k.id === keyId && k.user_id === userId && k.revoked_at === null,
      );
      return row ? [{ id: row.id, name: row.name, scopes: row.scopes }] : [];
    }
    if (/^select count\(\*\) as count from public\.api_keys/iu.test(normalized)) {
      const userId = String(params[0]);
      return [
        {
          count: String(
            apiKeys.filter((k) => k.user_id === userId && k.revoked_at === null).length,
          ),
        },
      ];
    }
    if (/^update api_keys set revoked_at = now\(\)/iu.test(normalized)) {
      const [keyId, userId] = params as [string, string];
      const row = apiKeys.find((k) => k.id === keyId && k.user_id === userId);
      if (row) row.revoked_at = new Date().toISOString();
      return [];
    }
    if (/^insert into api_keys/iu.test(normalized)) {
      const row: FakeApiKeyRow = {
        id: nextId(),
        user_id: String(params[0]),
        name: String(params[1]),
        scopes: params[4] as string[],
        revoked_at: null,
      };
      apiKeys.push(row);
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
          expires_at: null,
          revoked_at: null,
        },
      ];
    }

    throw new Error(`fake-neon-db: unmocked SQL -> ${normalized}`);
  }

  return {
    adapter: {
      query: async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
        run(sql, params) as T[],
      execute: async (sql: string, params: unknown[] = []): Promise<number> => {
        run(sql, params);
        return 1;
      },
    },
    proposals,
    connectors,
    apiKeys,
    calls,
    /** Captured statements whose text matches `pattern`. */
    callsMatching(pattern: RegExp): FakeDbCall[] {
      return calls.filter((c) => pattern.test(c.sql.replace(/\s+/gu, ' ')));
    },
  };
}
