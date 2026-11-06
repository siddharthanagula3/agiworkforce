'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AuthProviderId } from '@agiworkforce/client-runtime';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { isStepUpCancelled, sendAuthorizedJson } from '@/features/auth/step-up-fetch';
import { useStepUp } from '@features/settings/hooks/useStepUp';
import {
  useConnectedAccounts,
  useCurrentUser,
  usePasskeys,
  type IdentityPasskey,
} from '@/lib/identity/client';
import { toUserMessage } from '@/lib/user-error-message';
import { useSignInIdentities } from './use-sign-in-identities';

const IDENTITIES_PATH = '/api/settings/identities';
const CREATION_SOURCE_LABEL: Readonly<Record<string, string>> = {
  sso: 'Single sign-on',
  link: 'Linked account',
  sign_in: 'Sign-in account',
  backfill: 'Sign-in account',
};

const secondaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  flexShrink: 0,
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 14,
  fontWeight: 500,
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  whiteSpace: 'nowrap',
} as const;

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  padding: 'var(--space-3) 0',
  borderTop: '1px solid var(--settings-border)',
  flexWrap: 'wrap',
} as const;

function formatDate(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function describePasskeys(passkeys: readonly IdentityPasskey[]): string {
  if (passkeys.length === 0) return 'None yet. Add one under Passkeys.';
  const count = `${passkeys.length} saved. Manage them under Passkeys.`;
  const newest = newestPasskeyDate(passkeys);
  return newest ? `${count} Last added on ${newest}.` : count;
}

function newestPasskeyDate(passkeys: readonly IdentityPasskey[]): string | null {
  let newest: Date | null = null;
  for (const passkey of passkeys) {
    const created = passkey.createdAt;
    if (Number.isNaN(created.getTime())) continue;
    if (!newest || created > newest) newest = created;
  }
  return formatDate(newest);
}

function MethodText({ label, detail }: { label: string; detail: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-1)' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)' }}>{detail}</p>
    </div>
  );
}

function MethodRow({
  label,
  detail,
  value,
  onOpen,
  children,
}: {
  label: string;
  detail: string;
  value?: string;
  onOpen?: () => void;
  children?: ReactNode;
}) {
  if (onOpen && value) {
    return (
      <li style={{ borderTop: '1px solid var(--settings-border)' }}>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${value} ${label.toLowerCase()}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) 0',
            width: '100%',
            background: 'transparent',
            border: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          <MethodText label={label} detail={detail} />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              flexShrink: 0,
              fontSize: 14,
              color: 'var(--text-1)',
            }}
          >
            {value}
            <ChevronRight size={16} aria-hidden="true" color="var(--text-3)" />
          </span>
        </button>
      </li>
    );
  }
  return (
    <li style={rowStyle}>
      <MethodText label={label} detail={detail} />
      {children}
    </li>
  );
}

export function SignInMethodsPanel({ onOpenPassword }: { onOpenPassword?: () => void } = {}) {
  const { user, isLoaded: userLoaded, isSignedIn } = useCurrentUser();
  const { passkeys, isLoaded: passkeysLoaded } = usePasskeys();
  const { isLoaded, accounts, connect, disconnect } = useConnectedAccounts();
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const { withStepUp, dialog: stepUpDialog } = useStepUp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const identities = useSignInIdentities();
  const loaded = identities.data;
  const providers = loaded?.providers ?? [];
  const linked = loaded?.identities ?? [];
  const loadError = identities.error;
  const nativeReady = userLoaded && isSignedIn && !!user && user.id === identities.ownerId;
  const reloadIdentities = identities.reload;

  async function run(key: string, action: () => Promise<void>, fallback: string) {
    setError(null);
    setBusy(key);
    try {
      await action();
    } catch (cause) {
      if (!isStepUpCancelled(cause)) setError(toUserMessage(cause, fallback));
    } finally {
      setBusy(null);
    }
  }

  function handleConnect(provider: AuthProviderId) {
    void run(
      `connect:${provider}`,
      () => connect(provider, window.location.href),
      'That account could not be connected.',
    );
  }

  function handleDisconnect(accountId: string) {
    void run(
      `disconnect:${accountId}`,
      () => disconnect(accountId),
      'That account could not be disconnected.',
    );
  }

  function handleUnlink(identityId: string) {
    void run(
      `unlink:${identityId}`,
      async () => {
        const response = await withStepUp(
          (headers) =>
            sendAuthorizedJson(
              IDENTITIES_PATH,
              { method: 'DELETE', body: { identityId } },
              headers,
            ),
          identityId,
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? 'That sign-in method could not be removed.');
        }
        reloadIdentities();
      },
      'That sign-in method could not be removed.',
    );
  }

  return (
    <section
      aria-labelledby="settings-sign-in-methods-heading"
      style={{
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        padding: 'var(--space-4) var(--space-5)',
      }}
    >
      {confirmDialog}
      {stepUpDialog}
      <h2
        id="settings-sign-in-methods-heading"
        style={{
          margin: '0 0 var(--space-1)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-2)',
        }}
      >
        Sign-in methods
      </h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--text-3)' }}>
        Every way you can sign in to this account. Keep at least one you can still reach.
      </p>

      {(!nativeReady || !passkeysLoaded || !isLoaded || identities.isLoading) ? (
        <div style={{ paddingTop: 'var(--space-3)' }}>
          <Spinner size="sm" aria-label="Loading sign-in methods" />
        </div>
      ) : null}
      {nativeReady ? (
        <ul style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0 }}>
          <MethodRow
            label="Email address"
            detail={user?.email ?? 'No email address on this account'}
          />
          <MethodRow
            label="Password"
            detail={user?.hasPassword ? 'Set' : 'Not set'}
            value={user?.hasPassword ? 'Change' : 'Add'}
            onOpen={onOpenPassword}
          />
          {passkeysLoaded ? <MethodRow label="Passkeys" detail={describePasskeys(passkeys)} /> : null}
          {isLoaded ? providers.map((provider) => {
            const account = accounts.find((candidate) => candidate.provider === provider.id);
            const key = account ? `disconnect:${account.id}` : `connect:${provider.id}`;
            return (
              <MethodRow
                key={provider.id}
                label={provider.label}
                detail={
                  account
                    ? `Connected${account.email ? ` as ${account.email}` : ''}`
                    : 'Not connected'
                }
              >
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    account
                      ? confirm({
                          title: `Disconnect ${provider.label}?`,
                          description: `You will no longer be able to sign in with ${provider.label}. You can connect it again later.`,
                          confirmLabel: 'Disconnect',
                          destructive: true,
                          onConfirm: () => handleDisconnect(account.id),
                        })
                      : handleConnect(provider.id)
                  }
                  style={{
                    ...secondaryButtonStyle,
                    color: account ? 'var(--settings-destructive-text)' : 'var(--text-1)',
                    cursor: busy !== null ? 'default' : 'pointer',
                  }}
                >
                  {busy === key ? <Spinner size="sm" aria-hidden="true" /> : null}
                  {account ? 'Disconnect' : 'Connect'}
                </button>
              </MethodRow>
            );
          }) : null}
          {linked.length > 1
            ? linked.map((identity) => {
                const label = CREATION_SOURCE_LABEL[identity.creationSource] ?? 'Sign-in account';
                const added = formatDate(identity.createdAt);
                const used = formatDate(identity.lastAuthenticatedAt);
                return (
                  <MethodRow
                    key={identity.id}
                    label={label}
                    detail={[
                      added ? `Added ${added}` : null,
                      used ? `Last used ${used}` : 'Not used yet',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    {identity.removable ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          confirm({
                            title: `Remove this ${label.toLowerCase()}?`,
                            description:
                              loaded?.consequence ??
                              'You will no longer be able to sign in with it.',
                            confirmLabel: 'Remove',
                            destructive: true,
                            onConfirm: () => handleUnlink(identity.id),
                          })
                        }
                        style={{
                          ...secondaryButtonStyle,
                          color: 'var(--settings-destructive-text)',
                          cursor: busy !== null ? 'default' : 'pointer',
                        }}
                      >
                        {busy === `unlink:${identity.id}` ? 'Removing…' : 'Remove'}
                      </button>
                    ) : null}
                  </MethodRow>
                );
              })
            : null}
        </ul>
      ) : null}

      {loadError || error ? (
        <p
          role="alert"
          style={{
            margin: 'var(--space-2) 0 0',
            fontSize: 14,
            color: 'var(--settings-destructive-text)',
          }}
        >
          {error ?? loadError}
        </p>
      ) : null}
    </section>
  );
}
