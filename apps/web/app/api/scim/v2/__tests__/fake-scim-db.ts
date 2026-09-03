export interface FakeRow {
  [column: string]: unknown;
}

function norm(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim().toLowerCase();
}

let idCounter = 0;
function uuid(): string {
  idCounter += 1;
  const hex = idCounter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

export class UniqueViolation extends Error {
  code = '23505';
  constructor(message: string) {
    super(message);
    this.name = 'UniqueViolation';
  }
}

export interface FakeScimDbState {
  scim_tokens: FakeRow[];
  scim_provisioned_users: FakeRow[];
  scim_groups: FakeRow[];
  scim_group_members: FakeRow[];
  directory_sync_events: FakeRow[];
  directory_sync_connections: FakeRow[];
  sso_connections: FakeRow[];
  organization_members: FakeRow[];
  profiles: FakeRow[];
  subscriptions: FakeRow[];
}

export function createFakeScimDb(seed: Partial<FakeScimDbState> = {}) {
  const state: FakeScimDbState = {
    scim_tokens: [],
    scim_provisioned_users: [],
    scim_groups: [],
    scim_group_members: [],
    directory_sync_events: [],
    directory_sync_connections: [],
    sso_connections: [],
    organization_members: [],
    profiles: [],
    subscriptions: [],
    ...seed,
  };

  const now = () => new Date().toISOString();

  function run(sql: string, params: unknown[] = []): FakeRow[] {
    const q = norm(sql);
    const p = params;

    // ---------------------------------------------------------------------
    // Batched membership statements. These sit ahead of their single-row
    // counterparts because several share a prefix; each is keyed on the array
    // parameter that distinguishes it.
    // ---------------------------------------------------------------------

    if (q.includes('from scim_provisioned_users') && q.includes('id = any(')) {
      const ids = (p[0] as string[]) ?? [];
      const matched = state.scim_provisioned_users.filter(
        (row) =>
          ids.includes(String(row['id'])) &&
          row['connection_id'] === p[1] &&
          row['organization_id'] === p[2],
      );
      return q.startsWith('select id from')
        ? matched.map((row) => ({ id: row['id'] }))
        : matched.map((row) => ({ ...row }));
    }

    if (q.startsWith('insert into scim_group_members') && q.includes('unnest(')) {
      for (const scimUserId of (p[1] as string[]) ?? []) {
        const exists = state.scim_group_members.some(
          (row) => row['group_id'] === p[0] && row['scim_user_id'] === scimUserId,
        );
        if (exists) continue;
        state.scim_group_members.push({
          group_id: p[0],
          scim_user_id: scimUserId,
          organization_id: p[2],
          created_at: now(),
        });
      }
      return [];
    }

    if (q.startsWith('delete from scim_group_members') && q.includes('scim_user_id = any(')) {
      const ids = (p[2] as string[]) ?? [];
      state.scim_group_members = state.scim_group_members.filter(
        (row) =>
          !(
            row['group_id'] === p[0] &&
            row['organization_id'] === p[1] &&
            ids.includes(String(row['scim_user_id']))
          ),
      );
      return [];
    }

    if (q.includes('from profiles') && q.includes('lower(email) = any(')) {
      const wanted = new Set(((p[0] as string[]) ?? []).map((email) => email.toLowerCase()));
      return state.profiles
        .filter((row) => wanted.has(String(row['email'] ?? '').toLowerCase()))
        .map((row) => ({ id: row['id'], email: String(row['email'] ?? '').toLowerCase() }));
    }

    if (q.startsWith('update scim_provisioned_users as target') && q.includes('linked_user_id')) {
      const ids = (p[0] as string[]) ?? [];
      const linked = (p[1] as string[]) ?? [];
      ids.forEach((id, index) => {
        const row = state.scim_provisioned_users.find(
          (entry) => entry['id'] === id && entry['organization_id'] === p[2],
        );
        if (!row) return;
        row['linked_user_id'] = linked[index] ?? null;
        row['linked_at'] = now();
      });
      return [];
    }

    if (
      q.includes('from scim_group_members m') &&
      q.includes('scim_groups g') &&
      q.includes('any(')
    ) {
      const ids = (p[0] as string[]) ?? [];
      const edges = state.scim_group_members.filter(
        (row) => ids.includes(String(row['scim_user_id'])) && row['organization_id'] === p[1],
      );
      return edges.flatMap((edge) => {
        const group = state.scim_groups.find((entry) => entry['id'] === edge['group_id']);
        if (!group || group['connection_id'] !== p[2]) return [];
        return [{ scim_user_id: edge['scim_user_id'], mapped_role: group['mapped_role'] }];
      });
    }

    if (q.startsWith('delete from organization_members') && q.includes('user_id = any(')) {
      const ids = (p[1] as string[]) ?? [];
      const before = state.organization_members.length;
      state.organization_members = state.organization_members.filter(
        (row) =>
          !(
            row['organization_id'] === p[0] &&
            ids.includes(String(row['user_id'])) &&
            row['role'] !== 'owner'
          ),
      );
      return new Array(before - state.organization_members.length).fill({}) as FakeRow[];
    }

    if (q.startsWith('insert into organization_members') && q.includes('unnest(')) {
      const organizationId = p[0] as string;
      const userIds = (p[1] as string[]) ?? [];
      // The role-bearing form binds roles in $3; the other inserts a literal
      // 'member' and must leave a manually-set role alone, exactly as a null
      // role parameter does in the single-row statement.
      const roles = q.includes('entry.role') ? ((p[2] as Array<string | null>) ?? []) : null;

      userIds.forEach((userId, index) => {
        const mappedRole = roles ? (roles[index] ?? null) : null;
        const existing = state.organization_members.find(
          (row) => row['organization_id'] === organizationId && row['user_id'] === userId,
        );
        if (existing) {
          if (existing['role'] === 'owner') {
            // untouchable
          } else if (existing['provisioning_source'] === 'scim') {
            existing['role'] = mappedRole ?? 'member';
          } else if (mappedRole !== null) {
            existing['role'] = mappedRole;
          }
          existing['provisioning_source'] = 'scim';
          existing['provisioned_at'] = now();
          return;
        }
        state.organization_members.push({
          organization_id: organizationId,
          user_id: userId,
          role: mappedRole ?? 'member',
          provisioning_source: 'scim',
          provisioned_at: now(),
          joined_at: now(),
        });
      });
      return [];
    }

    if (q.includes('from scim_tokens') && q.includes('token_prefix = $1')) {
      const nowMs = Date.now();
      return state.scim_tokens.filter(
        (row) =>
          row['token_prefix'] === p[0] &&
          row['revoked_at'] == null &&
          (row['expires_at'] == null || new Date(String(row['expires_at'])).getTime() > nowMs),
      );
    }
    if (q.startsWith('update scim_tokens set last_used_at')) {
      const row = state.scim_tokens.find((entry) => entry['id'] === p[0]);
      if (row) row['last_used_at'] = now();
      return row ? [row] : [];
    }
    if (q.startsWith('insert into scim_tokens')) {
      const row: FakeRow = {
        id: uuid(),
        connection_id: p[0],
        organization_id: p[1],
        name: p[2],
        token_prefix: p[3],
        token_hash: p[4],
        created_by_user_id: p[5],
        expires_at: p[6] ?? null,
        last_used_at: null,
        revoked_at: null,
        created_at: now(),
        updated_at: now(),
      };
      state.scim_tokens.push(row);
      const { token_hash: _hash, ...withoutHash } = row;
      void _hash;
      return [withoutHash];
    }
    if (q.startsWith('update scim_tokens set revoked_at')) {
      const row = state.scim_tokens.find(
        (entry) =>
          entry['id'] === p[0] && entry['organization_id'] === p[1] && entry['revoked_at'] == null,
      );
      if (!row) return [];
      row['revoked_at'] = now();
      return [{ id: row['id'] }];
    }
    if (q.includes('from scim_tokens') && q.includes('where organization_id = $1')) {
      return state.scim_tokens
        .filter((row) => row['organization_id'] === p[0])
        .map(({ token_hash: _hash, ...rest }) => {
          void _hash;
          return rest;
        });
    }

    if (q.includes('from directory_sync_connections') && q.includes('id = $1')) {
      return state.directory_sync_connections.filter(
        (row) => row['id'] === p[0] && row['organization_id'] === p[1],
      );
    }
    if (q.includes('from directory_sync_connections') && q.includes('where organization_id = $1')) {
      return state.directory_sync_connections
        .filter((row) => row['organization_id'] === p[0])
        .map((row) => ({ ...row }));
    }
    if (q.startsWith('insert into directory_sync_connections')) {
      const duplicate = state.directory_sync_connections.some(
        (row) => row['provider'] === p[1] && row['directory_id'] === p[2],
      );
      if (duplicate) throw new UniqueViolation('duplicate (provider, directory_id)');
      const row: FakeRow = {
        id: uuid(),
        organization_id: p[0],
        provider: p[1],
        directory_id: p[2],
        display_name: p[3] ?? null,
        is_active: true,
        last_sync_at: null,
        created_at: now(),
        updated_at: now(),
      };
      state.directory_sync_connections.push(row);
      return [{ ...row }];
    }
    if (q.startsWith('delete from directory_sync_connections')) {
      const before = state.directory_sync_connections.length;
      state.directory_sync_connections = state.directory_sync_connections.filter(
        (row) => !(row['id'] === p[0] && row['organization_id'] === p[1]),
      );
      return new Array(before - state.directory_sync_connections.length).fill({}) as FakeRow[];
    }
    if (q.includes('from sso_connections') && q.includes('domain_verified_at is not null')) {
      return state.sso_connections
        .filter((row) => row['organization_id'] === p[0] && row['domain_verified_at'] != null)
        .map((row) => ({ domain: String(row['domain'] ?? '').toLowerCase() }));
    }

    if (q.startsWith('update directory_sync_connections set last_sync_at')) {
      const row = state.directory_sync_connections.find(
        (entry) => entry['id'] === p[0] && entry['organization_id'] === p[1],
      );
      if (row) row['last_sync_at'] = now();
      return row ? [row] : [];
    }

    if (q.startsWith('select organization_id, role from organization_members')) {
      return state.organization_members
        .filter(
          (row) => row['user_id'] === p[0] && (row['role'] === 'owner' || row['role'] === 'admin'),
        )
        .map((row) => ({ organization_id: row['organization_id'], role: row['role'] }));
    }
    if (q.startsWith('select role from organization_members')) {
      return state.organization_members.filter(
        (row) =>
          row['organization_id'] === p[0] &&
          row['user_id'] === p[1] &&
          (row['role'] === 'owner' || row['role'] === 'admin'),
      );
    }
    if (q.startsWith('insert into organization_members')) {
      const [organizationId, userId, mappedRole] = p as [string, string, string | null];
      const existing = state.organization_members.find(
        (row) => row['organization_id'] === organizationId && row['user_id'] === userId,
      );
      if (existing) {
        if (existing['role'] === 'owner') {
          // untouchable
        } else if (existing['provisioning_source'] === 'scim') {
          existing['role'] = mappedRole ?? 'member';
        } else if (mappedRole !== null && mappedRole !== undefined) {
          existing['role'] = mappedRole;
        }
        existing['provisioning_source'] = 'scim';
        existing['provisioned_at'] = now();
      } else {
        state.organization_members.push({
          organization_id: organizationId,
          user_id: userId,
          role: mappedRole ?? 'member',
          provisioning_source: 'scim',
          provisioned_at: now(),
          joined_at: now(),
        });
      }
      return [];
    }
    if (q.startsWith('delete from organization_members')) {
      const before = state.organization_members.length;
      state.organization_members = state.organization_members.filter(
        (row) =>
          !(row['organization_id'] === p[0] && row['user_id'] === p[1] && row['role'] !== 'owner'),
      );
      return new Array(before - state.organization_members.length).fill({}) as FakeRow[];
    }

    if (q.includes('from subscriptions') && q.includes('where user_id = $1')) {
      return state.subscriptions.filter((row) => row['user_id'] === p[0]);
    }

    if (q.includes('from profiles') && q.includes('lower(email) = lower($1)')) {
      const email = String(p[0] ?? '').toLowerCase();
      return state.profiles
        .filter((row) => String(row['email'] ?? '').toLowerCase() === email)
        .map((row) => ({ id: row['id'] }));
    }

    if (q.startsWith('insert into directory_sync_events')) {
      state.directory_sync_events.push({
        id: uuid(),
        connection_id: p[0],
        organization_id: p[1],
        event_type: p[2],
        user_email: p[3] ?? null,
        raw_payload: p[4] ? JSON.parse(String(p[4])) : null,
        processed_at: now(),
        error: p[5] ?? null,
        created_at: now(),
      });
      return [];
    }

    if (q.includes('from directory_sync_events') && q.includes('where organization_id = $1')) {
      return state.directory_sync_events
        .filter((row) => row['organization_id'] === p[0])
        .map((row) => ({ ...row }));
    }

    if (q.startsWith('insert into scim_provisioned_users')) {
      const [connectionId, organizationId, externalId, userName] = p as [
        string,
        string,
        string | null,
        string,
      ];
      const duplicate = state.scim_provisioned_users.some(
        (row) =>
          row['connection_id'] === connectionId &&
          String(row['user_name']).toLowerCase() === userName.toLowerCase(),
      );
      if (duplicate) throw new UniqueViolation('duplicate user_name');

      const row: FakeRow = {
        id: uuid(),
        connection_id: connectionId,
        organization_id: organizationId,
        external_id: externalId,
        user_name: userName,
        email: p[4] ?? null,
        given_name: p[5] ?? null,
        family_name: p[6] ?? null,
        display_name: p[7] ?? null,
        active: p[8],
        linked_user_id: null,
        linked_at: null,
        raw_attributes: p[9] ? JSON.parse(String(p[9])) : null,
        version: 1,
        created_at: now(),
        updated_at: now(),
      };
      state.scim_provisioned_users.push(row);
      return [{ ...row }];
    }
    if (q.startsWith('update scim_provisioned_users set linked_user_id')) {
      const row = state.scim_provisioned_users.find(
        (entry) => entry['id'] === p[1] && entry['organization_id'] === p[2],
      );
      if (row) {
        row['linked_user_id'] = p[0];
        row['linked_at'] = now();
      }
      return [];
    }
    if (q.startsWith('update scim_provisioned_users set user_name')) {
      const row = state.scim_provisioned_users.find(
        (entry) =>
          entry['id'] === p[0] &&
          entry['connection_id'] === p[1] &&
          entry['organization_id'] === p[2],
      );
      if (!row) return [];
      assignUser(row, {
        user_name: p[3],
        external_id: p[4],
        email: p[5],
        given_name: p[6],
        family_name: p[7],
        display_name: p[8],
        active: p[9],
      });
      return [{ ...row }];
    }
    if (q.startsWith('update scim_provisioned_users set external_id')) {
      const row = state.scim_provisioned_users.find(
        (entry) =>
          entry['id'] === p[0] &&
          entry['connection_id'] === p[1] &&
          entry['organization_id'] === p[2],
      );
      if (!row) return [];
      assignUser(row, {
        external_id: p[3],
        user_name: p[4],
        email: p[5],
        given_name: p[6],
        family_name: p[7],
        display_name: p[8],
        active: p[9],
      });
      return [{ ...row }];
    }
    if (q.startsWith('delete from scim_provisioned_users')) {
      const before = state.scim_provisioned_users.length;
      state.scim_provisioned_users = state.scim_provisioned_users.filter(
        (row) =>
          !(row['id'] === p[0] && row['connection_id'] === p[1] && row['organization_id'] === p[2]),
      );
      return new Array(before - state.scim_provisioned_users.length).fill({}) as FakeRow[];
    }
    if (q.includes('from scim_provisioned_users') && q.includes('where id = $1')) {
      return state.scim_provisioned_users
        .filter(
          (row) =>
            row['id'] === p[0] && row['connection_id'] === p[1] && row['organization_id'] === p[2],
        )
        .map((row) => ({ ...row }));
    }
    if (q.includes('from scim_provisioned_users') && q.includes('connection_id = $1')) {
      const matched = state.scim_provisioned_users.filter((row) => {
        if (row['connection_id'] !== p[0] || row['organization_id'] !== p[1]) return false;
        if (q.includes('lower(user_name) = lower($3)')) {
          return String(row['user_name']).toLowerCase() === String(p[2]).toLowerCase();
        }
        if (q.includes('external_id = $3')) return row['external_id'] === p[2];
        if (q.includes('lower(email) = lower($3)')) {
          return String(row['email'] ?? '').toLowerCase() === String(p[2]).toLowerCase();
        }
        return true;
      });

      if (q.includes('count(*)')) return [{ count: matched.length }];

      const limit = Number(p[p.length - 2]);
      const offset = Number(p[p.length - 1]);
      return matched.slice(offset, offset + limit).map((row) => ({ ...row }));
    }

    if (q.startsWith('insert into scim_groups')) {
      const [connectionId, organizationId, externalId, displayName] = p as [
        string,
        string,
        string | null,
        string,
      ];
      const duplicate = state.scim_groups.some(
        (row) =>
          row['connection_id'] === connectionId &&
          String(row['display_name']).toLowerCase() === displayName.toLowerCase(),
      );
      if (duplicate) throw new UniqueViolation('duplicate display_name');
      const row: FakeRow = {
        id: uuid(),
        connection_id: connectionId,
        organization_id: organizationId,
        external_id: externalId,
        display_name: displayName,
        mapped_role: null,
        version: 1,
        created_at: now(),
        updated_at: now(),
      };
      state.scim_groups.push(row);
      return [{ ...row }];
    }
    if (q.startsWith('update scim_groups set display_name')) {
      const row = state.scim_groups.find(
        (entry) =>
          entry['id'] === p[0] &&
          entry['connection_id'] === p[1] &&
          entry['organization_id'] === p[2],
      );
      if (!row) return [];
      row['display_name'] = p[3];
      row['external_id'] = p[4];
      row['version'] = Number(row['version']) + 1;
      row['updated_at'] = now();
      return [{ ...row }];
    }
    if (q.startsWith('delete from scim_groups')) {
      state.scim_groups = state.scim_groups.filter(
        (row) =>
          !(row['id'] === p[0] && row['connection_id'] === p[1] && row['organization_id'] === p[2]),
      );
      state.scim_group_members = state.scim_group_members.filter((row) => row['group_id'] !== p[0]);
      return [];
    }
    if (q.includes('from scim_groups') && q.includes('where id = $1')) {
      return state.scim_groups
        .filter(
          (row) =>
            row['id'] === p[0] && row['connection_id'] === p[1] && row['organization_id'] === p[2],
        )
        .map((row) => ({ ...row }));
    }
    if (q.includes('from scim_groups') && q.includes('connection_id = $1')) {
      const matched = state.scim_groups.filter((row) => {
        if (row['connection_id'] !== p[0] || row['organization_id'] !== p[1]) return false;
        if (q.includes('lower(display_name) = lower($3)')) {
          return String(row['display_name']).toLowerCase() === String(p[2]).toLowerCase();
        }
        if (q.includes('external_id = $3')) return row['external_id'] === p[2];
        return true;
      });
      if (q.includes('count(*)')) return [{ count: matched.length }];
      const limit = Number(p[p.length - 2]);
      const offset = Number(p[p.length - 1]);
      return matched.slice(offset, offset + limit).map((row) => ({ ...row }));
    }

    if (q.startsWith('insert into scim_group_members')) {
      const exists = state.scim_group_members.some(
        (row) => row['group_id'] === p[0] && row['scim_user_id'] === p[1],
      );
      if (!exists) {
        state.scim_group_members.push({
          group_id: p[0],
          scim_user_id: p[1],
          organization_id: p[2],
          created_at: now(),
        });
      }
      return [];
    }
    if (q.startsWith('delete from scim_group_members') && q.includes('scim_user_id = $2')) {
      state.scim_group_members = state.scim_group_members.filter(
        (row) =>
          !(
            row['group_id'] === p[0] &&
            row['scim_user_id'] === p[1] &&
            row['organization_id'] === p[2]
          ),
      );
      return [];
    }
    if (q.startsWith('delete from scim_group_members')) {
      state.scim_group_members = state.scim_group_members.filter(
        (row) => !(row['group_id'] === p[0] && row['organization_id'] === p[1]),
      );
      return [];
    }
    if (q.includes('from scim_group_members m') && q.includes('scim_groups g')) {
      const edges = state.scim_group_members.filter(
        (row) => row['scim_user_id'] === p[0] && row['organization_id'] === p[1],
      );
      const groups = edges
        .map((edge) => state.scim_groups.find((group) => group['id'] === edge['group_id']))
        .filter((group): group is FakeRow => Boolean(group) && group!['connection_id'] === p[2]);
      if (q.includes('g.mapped_role')) {
        return groups.map((group) => ({ mapped_role: group['mapped_role'] }));
      }
      return groups.map((group) => ({ id: group['id'], display_name: group['display_name'] }));
    }
    if (q.includes('from scim_group_members m') && q.includes('scim_provisioned_users u')) {
      const edges = state.scim_group_members.filter(
        (row) => row['group_id'] === p[0] && row['organization_id'] === p[1],
      );
      return edges
        .map((edge) =>
          state.scim_provisioned_users.find((user) => user['id'] === edge['scim_user_id']),
        )
        .filter((user): user is FakeRow => Boolean(user) && user!['connection_id'] === p[2])
        .map((user) => ({ id: user['id'], user_name: user['user_name'] }));
    }

    throw new Error(`fake-scim-db: unhandled statement\n${sql}`);
  }

  function assignUser(row: FakeRow, values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) row[key] = value;
    }
    row['version'] = Number(row['version']) + 1;
    row['updated_at'] = now();
  }

  function snapshot(): FakeScimDbState {
    const copy = {} as FakeScimDbState;
    for (const table of Object.keys(state) as Array<keyof FakeScimDbState>) {
      copy[table] = state[table].map((row) => ({ ...row }));
    }
    return copy;
  }

  function restore(saved: FakeScimDbState): void {
    for (const table of Object.keys(state) as Array<keyof FakeScimDbState>) {
      state[table].length = 0;
      state[table].push(...saved[table]);
    }
  }

  const adapter = {
    query: async <T>(sql: string, params?: unknown[]): Promise<T[]> =>
      run(sql, params) as unknown as T[],
    execute: async (sql: string, params?: unknown[]): Promise<number> => run(sql, params).length,
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const saved = snapshot();
      try {
        return await fn(adapter);
      } catch (error) {
        restore(saved);
        throw error;
      }
    },
    withUser: () => adapter,
  };

  return { adapter, state };
}
