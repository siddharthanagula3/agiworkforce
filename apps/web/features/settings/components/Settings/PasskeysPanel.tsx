'use client';

import { useState } from 'react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { usePasskeys, type IdentityPasskey } from '@/lib/identity/client';
import { toUserMessage } from '@/lib/user-error-message';
import { isPasskeyCancellation } from '@features/settings/lib/passkey-cancellation';

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

export function PasskeysPanel() {
  const { isLoaded, isSupported, passkeys, create, remove } = usePasskeys();
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    setAdding(true);
    try {
      await create();
    } catch (cause) {
      if (!isPasskeyCancellation(cause)) {
        setError(toUserMessage(cause, 'This passkey could not be added.'));
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(passkey: IdentityPasskey) {
    setError(null);
    setRemovingId(passkey.id);
    try {
      await remove(passkey.id);
    } catch (cause) {
      setError(toUserMessage(cause, 'This passkey could not be removed.'));
    } finally {
      setRemovingId(null);
    }
  }

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
            disabled={!isLoaded || adding}
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
                  <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{label}</div>
                  <div
                    style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}
                  >
                    {describePasskey(passkey)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  disabled={removingId !== null}
                  onClick={() =>
                    confirm({
                      title: `Remove ${label}?`,
                      description:
                        'You will no longer be able to sign in with this passkey on any device that synced it. You can add it again later.',
                      confirmLabel: 'Remove passkey',
                      destructive: true,
                      onConfirm: () => handleRemove(passkey),
                    })
                  }
                  style={{
                    ...secondaryButtonStyle,
                    color: 'var(--settings-destructive-text)',
                    cursor: removingId !== null ? 'default' : 'pointer',
                  }}
                >
                  {removingId === passkey.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            );
          })}
        </ul>
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
