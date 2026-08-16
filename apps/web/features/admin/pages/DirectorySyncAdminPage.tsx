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
      const [connectionsResponse, tokensResponse] = await Promise.all([
        fetch('/api/admin/directory-sync', { credentials: 'include' }),
        fetch('/api/admin/directory-sync/tokens', { credentials: 'include' }),
      ]);

      if (!connectionsResponse.ok) {
        setError(await readError(connectionsResponse));
        setConnections([]);
        setEvents([]);
        setTokens([]);
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <header>
          <h1 className="text-2xl font-medium text-white">Directory sync (SCIM 2.0)</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Provision and deprovision members from your identity provider. Requires an active
            Enterprise subscription; every request is re-checked against the plan of the admin who
            minted the token.
          </p>
          {scimBaseUrl ? (
            <p className="mt-4 text-sm text-zinc-300">
              SCIM base URL:{' '}
              <code className="rounded bg-white/[0.06] px-2 py-1 text-emerald-300">
                {scimBaseUrl}
              </code>
            </p>
          ) : null}
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"
          >
            {error}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-zinc-400">Loading directory sync…</p> : null}

        <section className="rounded-md border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-base font-medium text-white">Connections</h2>
          {connections.length === 0 && !loading ? (
            <p className="mt-2 text-sm text-zinc-400">No directory sync connection yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {connections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 p-3"
                >
                  <div>
                    <p className="text-sm text-white">
                      {connection.display_name ?? connection.directory_id}{' '}
                      <span className="text-zinc-500">({connection.provider})</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      Directory {connection.directory_id} · last sync{' '}
                      {formatTimestamp(connection.last_sync_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteConnection(connection.id)}
                    className="rounded border border-red-500/40 px-3 py-1 text-xs text-red-200 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={createConnection} className="mt-5 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Provider
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-white"
              >
                {PROVIDERS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Directory ID
              <input
                value={directoryId}
                onChange={(event) => setDirectoryId(event.target.value)}
                required
                maxLength={255}
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={255}
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-white"
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

        <section className="rounded-md border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-base font-medium text-white">SCIM tokens</h2>
          <p className="mt-2 text-sm text-zinc-400">
            A token is shown once, when it is minted. Only its hash is stored, so it cannot be
            recovered — mint a new one and revoke the old.
          </p>

          {freshToken ? (
            <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-300">
                Copy this now — it will not be shown again
              </p>
              <code className="mt-2 block break-all text-sm text-emerald-100">{freshToken}</code>
            </div>
          ) : null}

          {tokens.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-3">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 p-3"
                >
                  <div>
                    <p className="text-sm text-white">
                      {token.name}{' '}
                      <span className="text-zinc-500">scim_{token.token_prefix}_…</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      Last used {formatTimestamp(token.last_used_at)}
                      {token.revoked_at ? ' · revoked' : ''}
                    </p>
                  </div>
                  {token.revoked_at ? (
                    <span className="text-xs text-zinc-500">Revoked</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void revokeToken(token.id)}
                      className="rounded border border-red-500/40 px-3 py-1 text-xs text-red-200 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          <form onSubmit={mintToken} className="mt-5 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Connection
              <select
                value={tokenConnectionId}
                onChange={(event) => setTokenConnectionId(event.target.value)}
                required
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-white"
              >
                <option value="">Select a connection</option>
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.display_name ?? connection.directory_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Token name
              <input
                value={tokenName}
                onChange={(event) => setTokenName(event.target.value)}
                required
                maxLength={120}
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-white"
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

        <section className="rounded-md border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-base font-medium text-white">Recent IdP activity</h2>
          {events.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">
              Nothing yet. If your IdP is configured and this stays empty, it is not reaching this
              deployment.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {events.map((event) => (
                <li key={event.id} className="text-sm text-zinc-300">
                  <span className="text-zinc-500">{formatTimestamp(event.created_at)}</span>{' '}
                  {event.event_type}
                  {event.user_email ? ` · ${event.user_email}` : ''}
                  {event.error ? <span className="text-red-300"> · {event.error}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
