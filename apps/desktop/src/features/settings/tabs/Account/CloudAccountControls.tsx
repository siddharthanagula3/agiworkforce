/**
 * Cloud account controls Desktop was missing entirely (DES-C21): the account
 * identifier, API keys, and account deletion — plus an honest statement of the
 * one control that cannot be served to Desktop today.
 *
 * Every call here uses the device bearer against a route that authenticates via
 * `getClerkAuthUser` (`apps/web/lib/api-auth.ts` Path 2b) and whose CSRF gate is
 * bypassed for a verifying bearer (`apps/web/lib/csrf.ts` `isBearerTokenValid`).
 *
 * BLOCKED — active sessions / "log out of all devices":
 * `apps/web/app/api/settings/sessions/route.ts` authenticates with
 * `requireBrowserSession()`, which calls Clerk's `auth()` and requires BOTH a
 * `userId` and a `sessionId`. Desktop's first-party HS256 device token resolves
 * neither, so `GET`/`DELETE /api/settings/sessions` return 401 for this app. No
 * bearer-capable equivalent exists. Rather than fake a session table, this
 * section says so and offers the two revocations Desktop CAN perform: sign this
 * device out, and manage the rest on the web.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CLOUD_API_KEY_SCOPES,
  createCloudApiKey,
  listCloudApiKeys,
  requestCloudAccountDeletion,
  revokeCloudApiKey,
  type CloudApiKey,
  type CloudApiKeyScope,
} from '../../../../api/cloudAccountSettings';
import { useAccountStore, useAuthStore } from '../../../../stores/auth';
import { CloudBridgedSection } from '../../cloud/CloudBridgedSection';
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

function SessionsRow() {
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <div className="rounded-lg border border-border bg-card/40 p-5">
      <p className="text-sm font-medium text-foreground">Active sessions</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        The account-wide session list and “log out of all devices” are served only to a browser
        session on agiworkforce.com. This Desktop authenticates with a device token, which that
        endpoint does not accept, so no session list can be shown here without inventing one.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() => void signOut()}
          data-testid="cloud-sign-out-this-device"
        >
          Sign this device out
        </button>
      </div>
      <div className="mt-5 border-t border-border pt-5">
        <CloudBridgedSection
          sectionKey="sessions"
          title="Sessions on other devices"
          description="Review and end sessions on your other devices on agiworkforce.com."
          path="/settings/security"
          action="Open session controls"
        />
      </div>
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
      <SessionsRow />
      <ApiKeysSection />
      <DangerZone />
    </div>
  );
}
