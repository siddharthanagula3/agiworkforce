'use client';

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AuthProviderId } from '@agiworkforce/client-runtime';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { getCsrfToken } from '@/lib/client/csrf';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { nativeSessionFor } from '@/lib/identity/native-session-authority';
import { useStepUp } from '@features/settings/hooks/useStepUp';
import {
  useConnectedAccounts,
  useCurrentUser,
  usePasskeys,
  type IdentityPasskey,
  type IdentityPasskeyOperation,
  type IdentityConnectedAccountsState,
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

const UNCERTAIN =
  'The sign-in change outcome could not be confirmed. It may already have completed. Review your sign-in methods before trying again.';
type PanelOwner = {
  id: number;
  session: SessionAuthority;
  pending: boolean;
  isCurrent: () => boolean;
};
type SignInIntent = {
  request: RequestAuthority;
  operation: IdentityPasskeyOperation | null;
  generation: object;
  key: string;
  phase: 'confirming' | 'running';
  dispatched: boolean;
  identityId?: string;
  body?: string;
  readCurrent: () => boolean;
};

export function SignInMethodsPanel({
  onOpenPassword,
  active = true,
}: { onOpenPassword?: () => void; active?: boolean } = {}) {
  const capture = useSessionSnapshot();
  const connected = useConnectedAccounts();
  const admission = useRef(active);
  admission.current = active;
  const slot = useRef<PanelOwner | null>(null);
  const nextId = useRef(0);
  const notice = useRef<SessionAuthority | null>(null);
  const [, redraw] = useState(0);
  if (slot.current && !slot.current.isCurrent()) {
    if (slot.current.pending) notice.current = slot.current.session;
    slot.current = null;
  }
  if (active && !slot.current) {
    const session = capture();
    if (session) {
      const native = nativeSessionFor<{ readonly user: unknown }>(session);
      const user = native.user;
      const owner: PanelOwner = {
        id: ++nextId.current,
        session,
        pending: false,
        isCurrent: () =>
          slot.current === owner &&
          admission.current &&
          session.isCurrent() &&
          native.user === user,
      };
      slot.current = owner;
    }
  }
  const owner = slot.current;
  const replace = useMemo(
    () => () => {
      if (slot.current === owner) {
        if (owner?.pending) notice.current = owner.session;
        slot.current = null;
        redraw((n) => n + 1);
      }
    },
    [owner],
  );
  return owner ? (
    <OwnedSignInMethodsPanel
      key={owner.id}
      owner={owner}
      connected={connected}
      replace={replace}
      onOpenPassword={onOpenPassword}
      uncertain={notice.current?.isCurrent() === true}
      markUncertain={() => {
        if (slot.current === owner) notice.current = owner.session;
      }}
      acknowledge={() => {
        if (slot.current === owner) notice.current = null;
      }}
    />
  ) : null;
}

function OwnedSignInMethodsPanel({
  owner,
  connected,
  replace,
  onOpenPassword,
  uncertain,
  markUncertain,
  acknowledge,
}: {
  owner: PanelOwner;
  connected: IdentityConnectedAccountsState;
  replace: () => void;
  onOpenPassword?: () => void;
  uncertain: boolean;
  markUncertain: () => void;
  acknowledge: () => void;
}) {
  const { user, isLoaded: userLoaded, isSignedIn } = useCurrentUser();
  const { passkeys, isLoaded: passkeysLoaded } = usePasskeys();
  const { isLoaded, accounts, capture } = connected;
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const { withStepUp, dialog: stepUpDialog } = useStepUp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(uncertain ? UNCERTAIN : null);
  const [blocked, setBlocked] = useState(uncertain);
  const lane = useRef({
    active: false,
    generation: {} as object,
    intent: null as SignInIntent | null,
    blocked: uncertain,
  }).current;
  const rendered = {};
  const latestRender = useRef(rendered);
  latestRender.current = rendered;
  const current = () => lane.active && owner.isCurrent();
  const reconcile = () => {
    if (lane.active && !owner.isCurrent()) replace();
  };
  const acceptsEvent = () => {
    if (current() && latestRender.current === rendered) return true;
    reconcile();
    return false;
  };
  const owns = (intent: SignInIntent) =>
    current() && lane.intent === intent && lane.generation === intent.generation;
  useLayoutEffect(() => {
    lane.active = true;
    lane.generation = {};
    let stop: (() => void) | undefined;
    const retire = () => {
      lane.active = false;
      lane.intent?.request.retire();
      lane.intent = null;
      stop?.();
      stop = undefined;
    };
    stop = owner.session.subscribe?.(() => {
      if (lane.active && !owner.isCurrent()) {
        retire();
        replace();
      }
    });
    if (!lane.active) {
      stop?.();
      stop = undefined;
    }
    return retire;
  }, [lane, owner, replace]);
  useLayoutEffect(() => {
    lane.intent?.operation?.isCurrent();
  });

  const identities = useSignInIdentities(owner.isCurrent());
  const loaded = identities.data;
  const providers = loaded?.providers ?? [];
  const linked = loaded?.identities ?? [];
  const loadError = identities.error;
  const nativeReady = userLoaded && isSignedIn && !!user && user.id === identities.ownerId;
  const reloadIdentities = identities.reload;

  const release = (intent: SignInIntent) => {
    if (!owns(intent)) return;
    lane.intent = null;
    owner.pending = false;
    intent.request.retire();
    latestRender.current = {};
    setBusy(null);
  };
  function open(key: string, phase: SignInIntent['phase']) {
    if (!acceptsEvent() || lane.intent || lane.blocked || !identities.isCurrent()) return null;
    const intent: SignInIntent = {
      key,
      phase,
      generation: lane.generation,
      dispatched: false,
      operation: null,
      readCurrent: identities.isCurrent,
      request: createRequestAuthority(
        owner.session,
        () => owns(intent),
        () => {
          intent.dispatched = true;
          owner.pending = true;
        },
      ),
    };
    lane.intent = intent;
    latestRender.current = {};
    intent.request.signal.addEventListener(
      'abort',
      () => {
        if (lane.active && lane.intent === intent && lane.generation === intent.generation)
          replace();
      },
      { once: true },
    );
    setError(null);
    setBusy(key);
    return intent;
  }
  async function run(intent: SignInIntent) {
    if (!owns(intent)) {
      reconcile();
      return;
    }
    try {
      intent.request.assertCurrent();
      if (!intent.readCurrent()) throw new Error('Sign-in methods changed. Review them again.');
      if (intent.operation) await intent.operation.execute();
      else {
        const response = await withStepUp(
          async (headers) => {
            intent.request.assertCurrent();
            const csrf = await getCsrfToken();
            intent.request.assertCurrent();
            return intent.request.fetch(IDENTITIES_PATH, {
              method: 'DELETE',
              body: intent.body,
              headers: { ...headers, 'Content-Type': 'application/json', 'x-csrf-token': csrf },
            });
          },
          intent.identityId,
          {
            authority: intent.request,
            onStepUpRequired: () => {
              intent.dispatched = false;
              owner.pending = false;
            },
          },
        );
        intent.request.assertCurrent();
        const body: unknown = await response.json();
        intent.request.assertCurrent();
        if (!response.ok) {
          throw new Error('That sign-in method could not be removed.');
        }
        if (
          !body ||
          typeof body !== 'object' ||
          !('removed' in body) ||
          body.removed !== intent.identityId
        ) {
          throw new Error('The removed sign-in method could not be confirmed.');
        }
      }
      intent.request.assertCurrent();
      owner.pending = false;
      reloadIdentities();
    } catch (cause) {
      if (!owns(intent)) {
        reconcile();
        return;
      }
      if (intent.dispatched) {
        lane.blocked = true;
        markUncertain();
        setBlocked(true);
        setError(UNCERTAIN);
      } else if (!isStepUpCancelled(cause))
        setError(toUserMessage(cause, 'That sign-in method could not be changed.'));
    } finally {
      release(intent);
    }
  }

  function handleConnect(provider: AuthProviderId) {
    const intent = open(`connect:${provider}`, 'running');
    if (!intent) return;
    try {
      intent.operation = capture(
        { kind: 'connect', provider, returnUrl: window.location.href },
        {
          authority: intent.request,
          onDispatch: () => {
            intent.request.assertCurrent();
            intent.dispatched = true;
            owner.pending = true;
          },
        },
      );
      void run(intent);
    } catch (cause) {
      if (owns(intent)) {
        setError(toUserMessage(cause, 'That account could not be connected.'));
        release(intent);
      }
    }
  }

  function handleDisconnect(accountId: string, label: string) {
    const intent = open(`disconnect:${accountId}`, 'confirming');
    if (!intent) return;
    try {
      intent.operation = capture(
        { kind: 'disconnect', accountId },
        {
          authority: intent.request,
          onDispatch: () => {
            intent.request.assertCurrent();
            intent.dispatched = true;
            owner.pending = true;
          },
        },
      );
      ask(
        intent,
        `Disconnect ${label}?`,
        `You will no longer be able to sign in with ${label}. You can connect it again later.`,
        'Disconnect',
      );
    } catch (cause) {
      if (owns(intent)) {
        setError(toUserMessage(cause, 'That account could not be disconnected.'));
        release(intent);
      }
    }
  }

  function handleUnlink(identityId: string, label: string) {
    const intent = open(`unlink:${identityId}`, 'confirming');
    if (!intent) return;
    intent.identityId = identityId;
    intent.body = JSON.stringify({ identityId });
    ask(intent, `Remove this ${label.toLowerCase()}?`, loaded!.consequence, 'Remove');
  }
  function ask(intent: SignInIntent, title: string, description: string, confirmLabel: string) {
    confirm({
      title,
      description,
      confirmLabel,
      destructive: true,
      onCancel: () => {
        if (owns(intent) && intent.phase === 'confirming') release(intent);
        else reconcile();
      },
      onConfirm: () => {
        if (!owns(intent)) {
          reconcile();
          return;
        }
        if (intent.phase !== 'confirming') return;
        intent.phase = 'running';
        return run(intent);
      },
    });
  }

  if (!owner.isCurrent()) return null;

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
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
        Every way you can sign in to this account. Keep at least one you can still reach.
      </p>

      {!nativeReady || !passkeysLoaded || !isLoaded || identities.isLoading ? (
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
            onOpen={
              onOpenPassword
                ? () => {
                    if (acceptsEvent()) onOpenPassword();
                  }
                : undefined
            }
          />
          {passkeysLoaded ? (
            <MethodRow label="Passkeys" detail={describePasskeys(passkeys)} />
          ) : null}
          {isLoaded
            ? providers.map((provider) => {
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
                      disabled={busy !== null || blocked}
                      onClick={() =>
                        account
                          ? handleDisconnect(account.id, provider.label)
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
              })
            : null}
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
                        disabled={busy !== null || blocked}
                        onClick={() => handleUnlink(identity.id, label)}
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

      {blocked ? (
        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => {
            if (acceptsEvent() && !lane.intent) reloadIdentities();
          }}
        >
          Refresh sign-in methods
        </button>
      ) : null}
      {blocked ? (
        <button
          type="button"
          style={secondaryButtonStyle}
          disabled={busy !== null || !identities.isCurrent() || !connected.isCurrent()}
          onClick={() => {
            if (
              !acceptsEvent() ||
              lane.intent ||
              !lane.blocked ||
              !identities.isCurrent() ||
              !connected.isCurrent()
            )
              return;
            latestRender.current = {};
            lane.blocked = false;
            acknowledge();
            setBlocked(false);
            setError(null);
          }}
        >
          I have reviewed my sign-in methods
        </button>
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
