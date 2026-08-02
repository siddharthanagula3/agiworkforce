/**
 * Cloud account controls Desktop was missing entirely (DES-C21): the account
 * identifier, active sessions, API keys, and account deletion.
 *
 * Every call here uses the device bearer against a route that authenticates via
 * `getClerkAuthUser` (`apps/web/lib/api-auth.ts` Path 2b) and whose CSRF gate is
 * bypassed for a verifying bearer (`apps/web/lib/csrf.ts` `isBearerTokenValid`).
 *
 * Active sessions were previously unreachable: the route resolved its caller
 * through a route-local `requireBrowserSession()` that required a Clerk cookie
 * and a `sessionId`, which a device token has neither of. That route now
 * resolves callers through `getClerkAuthUser` too
 * (`apps/web/app/api/settings/sessions/session-principal.ts`), so the list and
 * the revocations below are real. The one thing still not expressible with a
 * device token is "which listed session is me": those rows are Clerk BROWSER
 * sessions and this app is not one of them. The server says so
 * (`currentSessionKnown: false`) and this section repeats it rather than
 * marking an arbitrary row as current.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CLOUD_API_KEY_SCOPES,
  createCloudApiKey,
  fetchCloudActiveSessions,
  listCloudApiKeys,
  requestCloudAccountDeletion,
  revokeAllCloudSessions,
  revokeCloudApiKey,
  revokeCloudSession,
  type CloudAccountSession,
  type CloudApiKey,
  type CloudApiKeyScope,
} from '../../../../api/cloudAccountSettings';
import { useAccountStore, useAuthStore } from '../../../../stores/auth';
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  SectionError,
  SectionLoading,
  formatSettingsDate,
} from '../../cloud/sectionChrome';

const DELETE_CONFIRMATION = 'DELETE';

function AccountIdentifierRow() {
  const accountId = useAccountStore((state) => state.account.id);
  const [copied, setCopied] = useState(false);

  if (!accountId) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card/40 p-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Account identifier</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{accountId}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Support asks for this when investigating an account issue.
        </p>
      </div>
      <button
        type="button"
        className={SMALL_BUTTON}
        onClick={() => {
          if (!navigator.clipboard?.writeText) return;
          void navigator.clipboard
            .writeText(accountId)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function formatSessionTimestamp(value: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function sessionDetail(session: CloudAccountSession): string {
  return [session.browser, session.location].filter(Boolean).join(' · ');
}

function ActiveSessionsSection() {
  const signOut = useAuthStore((state) => state.signOut);
  const [sessions, setSessions] = useState<CloudAccountSession[] | null>(null);
  const [currentSessionKnown, setCurrentSessionKnown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchCloudActiveSessions();
      if (generation.current === current) {
        setSessions(next.sessions);
        setCurrentSessionKnown(next.currentSessionKnown);
      }
    } catch (caught) {
      if (generation.current === current) {
        setError(caught instanceof Error ? caught.message : 'Could not load your active sessions.');
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const handleRevoke = async (session: CloudAccountSession) => {
    setRevokingId(session.id);
    setError(null);
    setNotice(null);
    try {
      await revokeCloudSession(session.id);
      setSessions((current) => (current ?? []).filter((row) => row.id !== session.id));
      setNotice(`Ended the ${session.device} session.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not end that session.');
    } finally {
      setRevokingId(null);
    }
  };

  // "Log out of all devices" means exactly that, so it is two revocations, not
  // one: the server ends every Clerk session on the account, and then this app
  // signs itself out — which revokes the device token and its refresh family
  // through POST /api/auth/logout. Skipping the second step would leave the
  // credential that is actually in front of the user still valid.
  const handleRevokeAll = async () => {
    setRevokingAll(true);
    setError(null);
    setNotice(null);
    try {
      await revokeAllCloudSessions();
      setSessions([]);
      await signOut();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not log out of your other devices.',
      );
      setRevokingAll(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="cloud-active-sessions">
      <div>
        <h3 className="text-sm font-medium text-foreground">Active sessions</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Browser and mobile sessions signed in to this AGI Cloud account.{' '}
          {currentSessionKnown ? (
            <>The session marked “This session” is the one you are using right now.</>
          ) : (
            <>
              This Desktop is not one of them: it authenticates with a device token rather than a
              browser session, so it never appears in this list. Use{' '}
              <span className="font-medium text-foreground">Sign this device out</span> to end it.
            </>
          )}
        </p>
      </div>

      {loading ? <SectionLoading label="Loading active sessions…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void load()} /> : null}
      {notice ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {!loading && sessions !== null && sessions.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-border bg-card/40">
          {sessions.map((session, index) => (
            <li
              key={session.id}
              className={`flex items-center justify-between gap-4 p-4 ${
                index > 0 ? 'border-t border-border/60' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {session.device}
                  {currentSessionKnown && session.isCurrent ? (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      This session
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {sessionDetail(session) || 'No device details reported'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Last active {formatSessionTimestamp(session.lastActiveAt)}
                </p>
              </div>
              <button
                type="button"
                className={`${SMALL_BUTTON} text-destructive`}
                disabled={revokingId === session.id || revokingAll}
                aria-busy={revokingId === session.id || undefined}
                onClick={() => void handleRevoke(session)}
              >
                {revokingId === session.id ? 'Ending…' : 'End session'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && sessions !== null && sessions.length === 0 && error === null ? (
        <p className="text-xs text-muted-foreground">
          No other sessions are signed in to this account.
        </p>
      ) : null}

      <div className="mt-1 flex flex-wrap gap-2">
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() => void signOut()}
          disabled={revokingAll}
          data-testid="cloud-sign-out-this-device"
        >
          Sign this device out
        </button>
        <button
          type="button"
          className={`${SECONDARY_BUTTON} border-destructive/60 text-destructive`}
          disabled={revokingAll || loading}
          aria-busy={revokingAll || undefined}
          onClick={() => void handleRevokeAll()}
          data-testid="cloud-log-out-everywhere"
        >
          {revokingAll ? 'Logging out…' : 'Log out of all devices'}
        </button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Logging out of all devices ends every browser and mobile session on the account and then
        signs this Desktop out too. Local Mode chats, files, and model keys stay on this device.
      </p>
    </div>
  );
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<CloudApiKey[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<CloudApiKeyScope[]>(['models:read', 'inference:write']);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const next = await listCloudApiKeys();
      if (generation.current === current) setKeys(next);
    } catch (caught) {
      if (generation.current === current) {
        setError(caught instanceof Error ? caught.message : 'Could not load your API keys.');
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const toggleScope = (scope: CloudApiKeyScope) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    );
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    setIssuedKey(null);
    try {
      const created = await createCloudApiKey(name.trim(), scopes);
      setKeys((current) => [created.apiKey, ...(current ?? [])]);
      setIssuedKey(created.fullKey);
      setName('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the API key.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key: CloudApiKey) => {
    setRevokingId(key.id);
    setError(null);
    try {
      await revokeCloudApiKey(key.id);
      setKeys((current) => (current ?? []).filter((entry) => entry.id !== key.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke the API key.');
    } finally {
      setRevokingId(null);
    }
  };

  const canCreate = name.trim().length > 0 && scopes.length > 0 && !creating;

  return (
    <div className="flex flex-col gap-3" data-testid="cloud-api-keys">
      <div>
        <h3 className="text-sm font-medium text-foreground">API keys</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Keys for the OpenAI-compatible API. They authorize your Cloud account only — never this
          device&apos;s Local workspace, files, or model keys.
        </p>
      </div>

      {loading ? <SectionLoading label="Loading API keys…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void load()} /> : null}

      {issuedKey ? (
        <div role="status" className="rounded-lg border border-border bg-card/40 p-4">
          <p className="text-xs font-medium text-foreground">
            Copy this key now — it is shown once and never stored on this device.
          </p>
          <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{issuedKey}</p>
        </div>
      ) : null}

      {!loading && keys !== null && keys.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-border bg-card/40">
          {keys.map((key, index) => (
            <li
              key={key.id}
              className={`flex items-center justify-between gap-4 p-4 ${
                index > 0 ? 'border-t border-border/60' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{key.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">{key.keyPrefix}…</span> · Created{' '}
                  {formatSettingsDate(key.createdAt)} ·{' '}
                  {key.scopes.length > 0 ? key.scopes.join(', ') : 'no scopes'}
                </p>
              </div>
              <button
                type="button"
                className={`${SMALL_BUTTON} text-destructive`}
                disabled={revokingId === key.id}
                aria-busy={revokingId === key.id || undefined}
                onClick={() => void handleRevoke(key)}
              >
                {revokingId === key.id ? 'Revoking…' : 'Revoke'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && keys !== null && keys.length === 0 ? (
        <p className="text-xs text-muted-foreground">You have no active API keys.</p>
      ) : null}

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <label className="block text-xs font-medium text-foreground" htmlFor="cloud-api-key-name">
          New key name
        </label>
        <input
          id="cloud-api-key-name"
          type="text"
          value={name}
          maxLength={100}
          placeholder="Laptop CLI"
          onChange={(event) => setName(event.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          {CLOUD_API_KEY_SCOPES.map((scope) => (
            <label
              key={scope.value}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <input
                type="checkbox"
                checked={scopes.includes(scope.value)}
                onChange={() => toggleScope(scope.value)}
              />
              {scope.label}
            </label>
          ))}
        </div>
        <button
          type="button"
          className={`mt-4 ${PRIMARY_BUTTON}`}
          disabled={!canCreate}
          aria-busy={creating || undefined}
          onClick={() => void handleCreate()}
        >
          {creating ? 'Creating…' : 'Create API key'}
        </button>
      </div>
    </div>
  );
}

function DangerZone() {
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const outcome = await requestCloudAccountDeletion();
      setResult(
        outcome.message ??
          'Your Cloud account deletion has been submitted. Local data on this device is untouched.',
      );
      setConfirmation('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete your Cloud account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="rounded-lg border border-destructive/40 bg-destructive/5 p-5"
      data-testid="cloud-delete-account"
    >
      <h3 className="text-sm font-medium text-foreground">Delete Cloud account</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Permanently removes your AGI Cloud account and its conversations, artifacts, memories, and
        settings. Local Mode chats, files, and model keys stay on this device and are not part of
        this request. This cannot be undone.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <p role="status" className="mt-3 text-xs text-foreground">
          {result}
        </p>
      ) : null}
      <label className="mt-4 block text-xs text-muted-foreground" htmlFor="cloud-delete-confirm">
        Type {DELETE_CONFIRMATION} to confirm
      </label>
      <input
        id="cloud-delete-confirm"
        type="text"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
      <button
        type="button"
        className={`mt-4 ${SECONDARY_BUTTON} border-destructive/60 text-destructive`}
        disabled={confirmation !== DELETE_CONFIRMATION || deleting}
        aria-busy={deleting || undefined}
        onClick={() => void handleDelete()}
      >
        {deleting ? 'Deleting…' : 'Delete my Cloud account'}
      </button>
    </div>
  );
}

export function CloudAccountControls() {
  return (
    <div className="flex flex-col gap-6" data-testid="cloud-account-controls">
      <AccountIdentifierRow />
      <ActiveSessionsSection />
      <ApiKeysSection />
      <DangerZone />
    </div>
  );
}
