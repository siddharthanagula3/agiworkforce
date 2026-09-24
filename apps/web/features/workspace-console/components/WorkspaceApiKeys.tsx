'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { OrganizationPermission } from '@agiworkforce/types';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import {
  useCreateWorkspaceApiKey,
  useRevokeWorkspaceApiKey,
  useWorkspaceApiKeys,
  type WorkspaceApiKey,
} from '../hooks/use-admin-api-keys';
import { PERMISSION_COPY } from './WorkspaceRoles';
import { toUserMessage } from '@/lib/user-error-message';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

const controlStyle = {
  minHeight: 32,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: 'var(--space-1) var(--space-2)',
} as const;

const secondaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

const EXPIRY_OPTIONS: ReadonlyArray<{ label: string; days: number | null }> = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: 'No expiry', days: null },
];

function when(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function NewKeyNotice({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="flex flex-col gap-2 border-t px-5 py-4"
      style={{ borderColor: 'var(--settings-border)' }}
      role="region"
      aria-label="New workspace API key"
    >
      <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
        Copy the key now
      </p>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
        It is shown once and cannot be recovered. Send it as a Bearer token.
      </p>
      <code
        className="block overflow-x-auto rounded-md border px-3 py-2 text-xs"
        style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
      >
        {secret}
      </code>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(secret)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? 'Copied' : 'Copy key'}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          onClick={onDismiss}
        >
          I have stored it
        </button>
      </div>
    </div>
  );
}

function KeyRow({
  apiKey,
  canManage,
  revoking,
  onRevoke,
}: {
  apiKey: WorkspaceApiKey;
  canManage: boolean;
  revoking: boolean;
  onRevoke: (apiKey: WorkspaceApiKey) => void;
}) {
  const revoked = apiKey.revokedAt !== null;
  return (
    <li className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          {apiKey.name}{' '}
          <span className="text-xs font-normal" style={{ color: 'var(--text-3)' }}>
            {apiKey.keyPrefix}
          </span>
        </p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {apiKey.scopes.join(', ')} · Last used {when(apiKey.lastUsedAt)} · Expires{' '}
          {when(apiKey.expiresAt)}
          {revoked ? ` · Revoked ${when(apiKey.revokedAt)}` : ''}
        </p>
      </div>
      {canManage && !revoked ? (
        <button
          type="button"
          disabled={revoking}
          onClick={() => onRevoke(apiKey)}
          className={secondaryButtonClass}
          style={{ borderColor: 'currentColor', color: 'var(--settings-destructive-text)' }}
        >
          {revoking ? 'Revoking…' : 'Revoke'}
        </button>
      ) : null}
    </li>
  );
}

export function WorkspaceApiKeys() {
  const { data, isPending, isError, error, refetch } = useWorkspaceApiKeys();
  const create = useCreateWorkspaceApiKey();
  const revoke = useRevokeWorkspaceApiKey();
  const { confirm, dialog } = useConfirmAction();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<OrganizationPermission[]>([]);
  const [expiry, setExpiry] = useState<number | null>(90);
  const [secret, setSecret] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  if (isPending) {
    return (
      <div role="status" style={{ ...cardStyle, padding: 'var(--space-5)' }}>
        <Spinner size="sm" />
      </div>
    );
  }
  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 'var(--space-5)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load workspace API keys
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load workspace API keys.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className={`${secondaryButtonClass} mt-3`}
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }
  if (data === null) return null;

  const askToRevoke = (apiKey: WorkspaceApiKey) =>
    confirm({
      title: `Revoke "${apiKey.name}"?`,
      description:
        'Every integration using this key loses access to the audit trail and exports at once. A revoked key cannot be restored; you would issue a new one and update the integration.',
      confirmLabel: 'Revoke key',
      destructive: true,
      onConfirm: () => {
        setRevokingId(apiKey.id);
        return new Promise<void>((resolve) => {
          revoke.mutate(apiKey.id, {
            onSettled: () => {
              setRevokingId(null);
              resolve();
            },
          });
        });
      },
    });

  const canSubmit = name.trim().length > 0 && scopes.length > 0 && !create.isPending;

  return (
    <section style={cardStyle} aria-labelledby="workspace-api-keys-heading">
      {dialog}
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2
          id="workspace-api-keys-heading"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          Workspace API keys
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Keys belong to the workspace, keep working after the person who made them leaves, and can
          do only what their permissions allow. They read the audit trail, its export and legal hold
          exports.
        </p>
      </div>

      {data.keys.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
          <KeyRound aria-hidden className="h-5 w-5" style={{ color: 'var(--text-3)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
            No workspace API keys
          </p>
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
          {data.keys.map((apiKey) => (
            <KeyRow
              key={apiKey.id}
              apiKey={apiKey}
              canManage={data.canManageKeys}
              revoking={revokingId === apiKey.id}
              onRevoke={askToRevoke}
            />
          ))}
        </ul>
      )}

      {secret ? <NewKeyNotice secret={secret} onDismiss={() => setSecret(null)} /> : null}

      {data.canManageKeys ? (
        <div
          className="flex flex-col gap-3 border-t px-5 py-4"
          style={{ borderColor: 'var(--settings-border)' }}
        >
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Key name"
              aria-label="Workspace API key name"
              maxLength={120}
              style={{ ...controlStyle, flex: '1 1 200px' }}
            />
            <select
              value={expiry === null ? 'never' : String(expiry)}
              onChange={(event) =>
                setExpiry(event.target.value === 'never' ? null : Number(event.target.value))
              }
              aria-label="Workspace API key expiry"
              style={controlStyle}
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.label} value={option.days === null ? 'never' : option.days}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs" style={{ color: 'var(--text-3)' }}>
              Permissions
            </legend>
            {data.grantableScopes.map((scope) => (
              <label
                key={scope}
                className="flex items-center gap-2 text-xs"
                style={{ color: 'var(--text-2)' }}
              >
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(event) =>
                    setScopes((current) =>
                      event.target.checked
                        ? [...current, scope]
                        : current.filter((value) => value !== scope),
                    )
                  }
                />
                {PERMISSION_COPY[scope]}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() =>
                create.mutate(
                  { name: name.trim(), scopes, expiresInDays: expiry },
                  {
                    onSuccess: (result) => {
                      setSecret(result.key);
                      setName('');
                      setScopes([]);
                    },
                  },
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {create.isPending ? <Spinner size="sm" /> : null}
              Create key
            </button>
            {create.isError ? (
              <span
                role="alert"
                className="text-xs"
                style={{ color: 'var(--settings-destructive-text)' }}
              >
                {toUserMessage(create.error, 'Could not create this API key. Try again.')}
              </span>
            ) : null}
            {revoke.isError ? (
              <span
                role="alert"
                className="text-xs"
                style={{ color: 'var(--settings-destructive-text)' }}
              >
                {toUserMessage(revoke.error, 'Could not revoke this API key. Try again.')}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
