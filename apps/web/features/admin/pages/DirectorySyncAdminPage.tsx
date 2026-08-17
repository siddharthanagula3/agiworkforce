'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCsrfToken } from '@/lib/client/csrf';

interface Connection {
  id: string;
  organization_id: string;
  provider: string;
  directory_id: string;
  display_name: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
}

interface SyncEvent {
  id: string;
  connection_id: string;
  event_type: string;
  user_email: string | null;
  error: string | null;
  created_at: string;
}

type MappedRole = 'admin' | 'member' | 'viewer';

interface GroupSummary {
  id: string;
  connection_id: string;
  display_name: string;
  mapped_role: MappedRole | null;
  member_count: number;
}

interface TokenSummary {
  id: string;
  connection_id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const FALLBACK_MAPPABLE_ROLES: MappedRole[] = ['admin', 'member', 'viewer'];

const PROVIDERS = [
  { value: 'okta', label: 'Okta' },
  { value: 'azure_ad', label: 'Microsoft Entra ID' },
  { value: 'google', label: 'Google Workspace' },
  { value: 'onelogin', label: 'OneLogin' },
  { value: 'generic_scim', label: 'Generic SCIM 2.0' },
] as const;

function formatTimestamp(value: string | null): string {
  if (!value) return 'Never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString();
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // fall through
  }
  return `Request failed (${response.status})`;
}

export default function DirectorySyncAdminPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [tokens, setTokens] = useState<TokenSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [mappableRoles, setMappableRoles] = useState<MappedRole[]>(FALLBACK_MAPPABLE_ROLES);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [scimBaseUrl, setScimBaseUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [provider, setProvider] = useState<string>('okta');
  const [directoryId, setDirectoryId] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [tokenConnectionId, setTokenConnectionId] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [connectionsResponse, tokensResponse, groupsResponse] = await Promise.all([
        fetch('/api/admin/directory-sync', { credentials: 'include' }),
        fetch('/api/admin/directory-sync/tokens', { credentials: 'include' }),
        fetch('/api/admin/directory-sync/groups', { credentials: 'include' }),
      ]);

      if (!connectionsResponse.ok) {
        setError(await readError(connectionsResponse));
        setConnections([]);
        setEvents([]);
        setTokens([]);
        setGroups([]);
        setCanManageRoles(false);
        return;
      }

      const body = (await connectionsResponse.json()) as {
        connections?: Connection[];
        events?: SyncEvent[];
        scim_base_url?: string;
      };
      setConnections(body.connections ?? []);
      setEvents(body.events ?? []);
      setScimBaseUrl(body.scim_base_url ?? '');

      if (tokensResponse.ok) {
        const tokenBody = (await tokensResponse.json()) as { tokens?: TokenSummary[] };
        setTokens(tokenBody.tokens ?? []);
      } else {
        setTokens([]);
      }

      if (groupsResponse.ok) {
        const groupBody = (await groupsResponse.json()) as {
          groups?: GroupSummary[];
          mappable_roles?: MappedRole[];
          can_manage_roles?: boolean;
        };
        setGroups(groupBody.groups ?? []);
        setMappableRoles(
          groupBody.mappable_roles?.length ? groupBody.mappable_roles : FALLBACK_MAPPABLE_ROLES,
        );
        setCanManageRoles(groupBody.can_manage_roles === true);
      } else {
        setGroups([]);
        setCanManageRoles(false);
      }
    } catch {
      setError('Could not reach the directory sync API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createConnection = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/admin/directory-sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({
          provider,
          directory_id: directoryId.trim(),
          display_name: displayName.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setDirectoryId('');
      setDisplayName('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const deleteConnection = async (connectionId: string) => {
    setBusy(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(
        `/api/admin/directory-sync?id=${encodeURIComponent(connectionId)}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'x-csrf-token': csrf },
        },
      );
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const mintToken = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFreshToken(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/admin/directory-sync/tokens', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ connectionId: tokenConnectionId, name: tokenName.trim() }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const body = (await response.json()) as { raw_token?: string };
      setFreshToken(body.raw_token ?? null);
      setTokenName('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const updateGroupRole = async (groupId: string, mappedRole: MappedRole | null) => {
    setBusy(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/admin/directory-sync/groups', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ groupId, mappedRole }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const body = (await response.json()) as { group?: GroupSummary | null };
      const updated = body.group;
      if (updated) {
        setGroups((current) =>
          current.map((group) => (group.id === updated.id ? { ...group, ...updated } : group)),
        );
      } else {
        await load();
      }
    } catch {
      setError('Could not reach the directory sync API.');
    } finally {
      setBusy(false);
    }
  };

  const revokeToken = async (tokenId: string) => {
    setBusy(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(
        `/api/admin/directory-sync/tokens/${encodeURIComponent(tokenId)}`,
        { method: 'DELETE', credentials: 'include', headers: { 'x-csrf-token': csrf } },
      );
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <header>
          <h1 className="text-2xl font-medium text-foreground">Directory sync (SCIM 2.0)</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Provision and deprovision members from your identity provider. Requires an active
            Enterprise subscription; every request is re-checked against the plan of the admin who
            minted the token.
          </p>
          {scimBaseUrl ? (
            <p className="mt-4 text-sm text-foreground">
              SCIM base URL:{' '}
              <code className="rounded bg-muted px-2 py-1 text-emerald-700 dark:text-emerald-300">
                {scimBaseUrl}
              </code>
            </p>
          ) : null}
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-600/60 dark:border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200"
          >
            {error}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-muted-foreground">Loading directory sync…</p> : null}

        <section className="rounded-md border border-border bg-card p-5">
          <h2 className="text-base font-medium text-foreground">Connections</h2>
          {connections.length === 0 && !loading ? (
            <p className="mt-2 text-sm text-muted-foreground">No directory sync connection yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {connections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3"
                >
                  <div>
                    <p className="text-sm text-foreground">
                      {connection.display_name ?? connection.directory_id}{' '}
                      <span className="text-muted-foreground">({connection.provider})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Directory {connection.directory_id} · last sync{' '}
                      {formatTimestamp(connection.last_sync_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteConnection(connection.id)}
                    className="rounded border border-red-600/60 dark:border-red-500/40 px-3 py-1 text-xs text-red-700 dark:text-red-200 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={createConnection} className="mt-5 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Provider
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="rounded border border-input bg-background px-2 py-1 text-sm text-foreground"
              >
                {PROVIDERS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Directory ID
              <input
                value={directoryId}
                onChange={(event) => setDirectoryId(event.target.value)}
                required
                maxLength={255}
                className="rounded border border-input bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={255}
                className="rounded border border-input bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-emerald-500/90 px-3 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
            >
              Add connection
            </button>
          </form>
        </section>

        <section className="rounded-md border border-border bg-card p-5">
          <h2 className="text-base font-medium text-foreground">SCIM tokens</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A token is shown once, when it is minted. Only its hash is stored, so it cannot be
            recovered — mint a new one and revoke the old.
          </p>

          {freshToken ? (
            <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Copy this now — it will not be shown again
              </p>
              <code className="mt-2 block break-all text-sm text-emerald-900 dark:text-emerald-100">
                {freshToken}
              </code>
            </div>
          ) : null}

          {tokens.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-3">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3"
                >
                  <div>
                    <p className="text-sm text-foreground">
                      {token.name}{' '}
                      <span className="text-muted-foreground">scim_{token.token_prefix}_…</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last used {formatTimestamp(token.last_used_at)}
                      {token.revoked_at ? ' · revoked' : ''}
                    </p>
                  </div>
                  {token.revoked_at ? (
                    <span className="text-xs text-muted-foreground">Revoked</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void revokeToken(token.id)}
                      className="rounded border border-red-600/60 dark:border-red-500/40 px-3 py-1 text-xs text-red-700 dark:text-red-200 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          <form onSubmit={mintToken} className="mt-5 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Connection
              <select
                value={tokenConnectionId}
                onChange={(event) => setTokenConnectionId(event.target.value)}
                required
                className="rounded border border-input bg-background px-2 py-1 text-sm text-foreground"
              >
                <option value="">Select a connection</option>
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.display_name ?? connection.directory_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Token name
              <input
                value={tokenName}
                onChange={(event) => setTokenName(event.target.value)}
                required
                maxLength={120}
                className="rounded border border-input bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={busy || connections.length === 0}
              className="rounded bg-emerald-500/90 px-3 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
            >
              Mint token
            </button>
          </form>
        </section>

        <section className="rounded-md border border-border bg-card p-5">
          <h2 className="text-base font-medium text-foreground">Group role mapping</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A provisioned user gets the strongest role among the groups they belong to. Leave a
            group unmapped and its members land as{' '}
            <strong className="text-foreground">member</strong>. A group can never grant ownership.
          </p>
          {!canManageRoles ? (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">
              Only an organization owner can change group role mapping.
            </p>
          ) : null}

          {groups.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No groups have been pushed by your identity provider yet.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {groups.map((group) => (
                <li
                  key={group.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3"
                >
                  <div>
                    <p className="text-sm text-foreground">{group.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.member_count} member{group.member_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Role for {group.display_name}
                    <select
                      value={group.mapped_role ?? ''}
                      disabled={busy || !canManageRoles}
                      onChange={(event) =>
                        void updateGroupRole(
                          group.id,
                          event.target.value === '' ? null : (event.target.value as MappedRole),
                        )
                      }
                      className="rounded border border-input bg-background px-2 py-1 text-sm text-foreground disabled:opacity-50"
                    >
                      <option value="">No mapping (member)</option>
                      {mappableRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-border bg-card p-5">
          <h2 className="text-base font-medium text-foreground">Recent IdP activity</h2>
          {events.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing yet. If your IdP is configured and this stays empty, it is not reaching this
              deployment.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {events.map((event) => (
                <li key={event.id} className="text-sm text-foreground">
                  <span className="text-muted-foreground">{formatTimestamp(event.created_at)}</span>{' '}
                  {event.event_type}
                  {event.user_email ? ` · ${event.user_email}` : ''}
                  {event.error ? (
                    <span className="text-red-700 dark:text-red-300"> · {event.error}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
