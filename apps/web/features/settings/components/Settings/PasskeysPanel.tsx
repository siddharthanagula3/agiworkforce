'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { isImeComposingKey } from '@agiworkforce/ui/ime-composition';
import {
  MAX_PASSKEY_NAME_CHARS,
  usePasskeys,
  type IdentityPasskey,
  type IdentityPasskeyOperation,
  type IdentityPasskeysState,
} from '@/lib/identity/client';
import { toUserMessage } from '@/lib/user-error-message';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { nativeSessionFor } from '@/lib/identity/native-session-authority';
import {
  createRequestAuthority,
  type SessionAuthority,
  type RequestAuthority,
} from '@/lib/identity/request-authority';

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function describePasskey(passkey: IdentityPasskey): string {
  const created = formatDate(passkey.createdAt);
  const used = formatDate(passkey.lastUsedAt);
  return [created ? `Added ${created}` : null, used ? `Last used ${used}` : 'Not used yet']
    .filter(Boolean)
    .join(' · ');
}

const secondaryButtonStyle = {
  flexShrink: 0,
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 12,
  fontWeight: 500,
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  whiteSpace: 'nowrap',
} as const;

const UNCERTAIN =
  'The passkey change outcome could not be confirmed. It may already have completed. Review your passkeys and sign-in methods before trying again.';
type Owner = { id: number; session: SessionAuthority; pending: boolean; isCurrent: () => boolean };
type Intent = {
  request: RequestAuthority;
  operation: IdentityPasskeyOperation | null;
  phase: 'editing' | 'confirming' | 'running';
  dispatched: boolean;
  generation: object;
};

export function PasskeysPanel() {
  const captureSession = useSessionSnapshot();
  const state = usePasskeys();
  const readable = useRef(false);
  readable.current = state.isCurrent();
  const current = useRef<Owner | null>(null);
  const nextId = useRef(0);
  const notice = useRef<SessionAuthority | null>(null);
  const [, redraw] = useState(0);
  if (current.current && !current.current.isCurrent()) {
    if (current.current.pending) notice.current = current.current.session;
    current.current = null;
  }
  if (!current.current) {
    const session = captureSession();
    if (session && state.isCurrent()) {
      const native = nativeSessionFor<{ readonly user: unknown }>(session);
      const user = native.user;
      const owner: Owner = {
        id: ++nextId.current,
        session,
        pending: false,
        isCurrent: () =>
          current.current === owner &&
          readable.current &&
          session.isCurrent() &&
          native.user === user &&
          state.isCurrent(),
      };
      current.current = owner;
    }
  }
  const owner = current.current;
  const replace = useMemo(
    () => () => {
      if (current.current === owner) {
        if (owner?.pending) notice.current = owner.session;
        current.current = null;
        redraw((n) => n + 1);
      }
    },
    [owner],
  );
  return owner ? (
    <OwnedPasskeysPanel
      key={owner.id}
      owner={owner}
      replace={replace}
      state={state}
      markUncertain={() => {
        if (current.current === owner) notice.current = owner.session;
      }}
      uncertain={notice.current?.isCurrent() === true}
      acknowledge={() => {
        if (current.current === owner) notice.current = null;
      }}
    />
  ) : (
    <p role="status">Your account must finish loading before you can manage passkeys.</p>
  );
}

function OwnedPasskeysPanel({
  owner,
  replace,
  uncertain,
  acknowledge,
  markUncertain,
  state,
}: {
  owner: Owner;
  replace: () => void;
  uncertain: boolean;
  acknowledge: () => void;
  markUncertain: () => void;
  state: IdentityPasskeysState;
}) {
  const { isLoaded, isSupported, passkeys, capture } = state;
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string; intent: Intent } | null>(
    null,
  );
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState<string | null>(uncertain ? UNCERTAIN : null);
  const [blocked, setBlocked] = useState(uncertain);
  const lane = useRef({
    active: false,
    generation: {} as object,
    intent: null as Intent | null,
    blocked: uncertain,
  }).current;
  const rendered = {};
  const latestRender = useRef<object | null>(null);
  useLayoutEffect(() => {
    latestRender.current = rendered;
    return () => {
      if (latestRender.current === rendered) latestRender.current = null;
    };
  });
  const current = () => lane.active && owner.isCurrent();
  const reconcileOwner = () => {
    if (lane.active && !owner.isCurrent()) replace();
  };
  const acceptsEvent = () => {
    if (current() && latestRender.current === rendered) return true;
    reconcileOwner();
    return false;
  };
  const owns = (intent: Intent) =>
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
  const release = (intent: Intent) => {
    if (!owns(intent)) return;
    lane.intent = null;
    intent.request.retire();
    owner.pending = false;
    latestRender.current = {};
    setAdding(false);
    setRemovingId(null);
    setSavingName(false);
    setRenaming(null);
  };
  const open = (kind: 'create' | 'rename' | 'remove', id?: string) => {
    if (!acceptsEvent() || !isLoaded || lane.blocked || lane.intent) return null;
    const intent: Intent = {
      request: createRequestAuthority(owner.session, () => owns(intent)),
      operation: null,
      phase: kind === 'rename' ? 'editing' : kind === 'remove' ? 'confirming' : 'running',
      dispatched: false,
      generation: lane.generation,
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
    try {
      intent.operation = capture(
        kind,
        {
          authority: intent.request,
          onDispatch: () => {
            intent.request.assertCurrent();
            intent.dispatched = true;
            owner.pending = true;
          },
        },
        id,
      );
      return owns(intent) && intent.request.isCurrent() ? intent : null;
    } catch (cause) {
      if (owns(intent)) {
        setError(toUserMessage(cause, 'This passkey could not be selected.'));
        release(intent);
      }
      return null;
    }
  };
  const run = async (intent: Intent, name?: string) => {
    if (!owns(intent)) return;
    try {
      await intent.operation!.execute(name);
      if (owns(intent)) setError(null);
    } catch (cause) {
      if (!owns(intent)) return;
      if (intent.dispatched) {
        lane.blocked = true;
        markUncertain();
        setBlocked(true);
        setError(UNCERTAIN);
      } else setError(toUserMessage(cause, 'This passkey could not be changed.'));
    } finally {
      release(intent);
    }
  };
  const handleRename = () => {
    const intent = lane.intent;
    if (
      !acceptsEvent() ||
      !renaming ||
      !intent ||
      !owns(intent) ||
      renaming.intent !== intent ||
      intent.phase !== 'editing'
    )
      return;
    const name = renaming.name.trim();
    if (!name) return;
    intent.phase = 'running';
    latestRender.current = {};
    setSavingName(true);
    void run(intent, name);
  };
  const handleAdd = () => {
    if (!isSupported) return;
    const intent = open('create');
    if (intent) {
      setAdding(true);
      void run(intent);
    }
  };
  const beginRename = (passkey: IdentityPasskey) => {
    const intent = open('rename', passkey.id);
    if (intent) setRenaming({ id: passkey.id, name: passkey.name ?? '', intent });
  };
  const cancelRename = () => {
    const intent = lane.intent;
    if (acceptsEvent() && intent?.phase === 'editing' && renaming?.intent === intent)
      release(intent);
  };
  const beginRemove = (passkey: IdentityPasskey) => {
    const intent = open('remove', passkey.id);
    if (!intent) return;
    setRemovingId(passkey.id);
    confirm({
      title: `Remove ${passkey.name ?? 'Passkey'}?`,
      description:
        'You will no longer be able to sign in with this passkey on any device that synced it. You can add it again later.',
      confirmLabel: 'Remove passkey',
      destructive: true,
      onCancel: () => {
        if (owns(intent)) release(intent);
        else reconcileOwner();
      },
      onConfirm: () => {
        if (!owns(intent)) {
          reconcileOwner();
          return;
        }
        if (intent.phase !== 'confirming') return;
        intent.phase = 'running';
        return run(intent);
      },
    });
  };
  const busy = adding || removingId !== null || renaming !== null;

  if (!owner.isCurrent()) return null;

  return (
    <section
      aria-labelledby="settings-passkeys-heading"
      style={{
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        padding: 'var(--space-4) var(--space-5)',
      }}
    >
      {confirmDialog}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            id="settings-passkeys-heading"
            style={{
              margin: '0 0 var(--space-1)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-2)',
            }}
          >
            Passkeys
          </h2>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
            {isSupported
              ? 'Sign in with your fingerprint, face or device PIN instead of a password.'
              : 'This browser cannot create passkeys. Use a browser with passkey support to add one.'}
          </p>
        </div>
        {isSupported ? (
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!isLoaded || busy || blocked}
            aria-busy={adding || undefined}
            style={{
              ...secondaryButtonStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: 'var(--text-1)',
              cursor: !isLoaded || adding ? 'default' : 'pointer',
            }}
          >
            {adding ? <Spinner size="sm" /> : null}
            Add a passkey
          </button>
        ) : null}
      </div>

      {!isLoaded ? (
        <div style={{ paddingTop: 'var(--space-3)' }}>
          <Spinner size="sm" />
        </div>
      ) : passkeys.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0 }}>
          {passkeys.map((passkey, index) => {
            const label = passkey.name ?? 'Passkey';
            return (
              <li
                key={passkey.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-3) 0',
                  borderTop: index === 0 ? 'none' : '1px solid var(--settings-border)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  {renaming?.id === passkey.id ? (
                    <input
                      aria-label={`New name for ${label}`}
                      value={renaming.name}
                      maxLength={MAX_PASSKEY_NAME_CHARS}
                      disabled={savingName}
                      onChange={(event) => {
                        if (
                          acceptsEvent() &&
                          lane.intent === renaming.intent &&
                          lane.intent?.phase === 'editing'
                        )
                          setRenaming({ ...renaming, name: event.target.value });
                      }}
                      onKeyDown={(event) => {
                        if (isImeComposingKey(event.nativeEvent)) return;
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleRename();
                        }
                        if (event.key === 'Escape') cancelRename();
                      }}
                      style={{
                        fontSize: 14,
                        color: 'var(--text-1)',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--settings-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-1) var(--space-2)',
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{label}</div>
                  )}
                  <div
                    style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}
                  >
                    {describePasskey(passkey)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {renaming?.id === passkey.id ? (
                    <>
                      <button
                        type="button"
                        disabled={savingName || !renaming.name.trim()}
                        onClick={() => void handleRename()}
                        style={{ ...secondaryButtonStyle, color: 'var(--text-1)' }}
                      >
                        {savingName ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        disabled={savingName}
                        onClick={cancelRename}
                        style={{ ...secondaryButtonStyle, color: 'var(--text-2)' }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Rename ${label}`}
                      disabled={busy || blocked}
                      onClick={() => beginRename(passkey)}
                      style={{ ...secondaryButtonStyle, color: 'var(--text-1)' }}
                    >
                      Rename
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    disabled={busy || blocked}
                    onClick={() => beginRemove(passkey)}
                    style={{
                      ...secondaryButtonStyle,
                      color: 'var(--settings-destructive-text)',
                      cursor: removingId !== null ? 'default' : 'pointer',
                    }}
                  >
                    {removingId === passkey.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {blocked ? (
        <button
          type="button"
          onClick={() => {
            if (!acceptsEvent() || lane.intent) return;
            lane.blocked = false;
            acknowledge();
            setBlocked(false);
            setError(null);
          }}
        >
          I have reviewed my passkeys
        </button>
      ) : null}
      {error ? (
        <p
          role="alert"
          style={{
            margin: 'var(--space-2) 0 0',
            fontSize: 12,
            color: 'var(--settings-destructive-text)',
          }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
