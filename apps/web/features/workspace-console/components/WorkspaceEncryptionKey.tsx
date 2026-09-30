'use client';

import { useState } from 'react';
import { toUserMessage } from '@/lib/user-error-message';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import {
  useChangeEncryptionKey,
  useWorkspaceEncryptionKey,
  type EncryptionKeyChange,
  type KeyAvailability,
  type KeyDescriptor,
  type KeyProviderId,
  type KeyRewrapRun,
  type WorkspaceEncryptionKey as WorkspaceKey,
} from '../hooks/use-encryption-key';

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

const primaryButton =
  'inline-flex min-h-8 items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const secondaryButton =
  'min-h-8 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

const PROVIDERS: ReadonlyArray<{ id: KeyProviderId; label: string; example: string }> = [
  {
    id: 'aws_kms',
    label: 'AWS KMS',
    example: 'arn:aws:kms:us-east-1:111122223333:key/…',
  },
  {
    id: 'gcp_kms',
    label: 'Google Cloud KMS',
    example: 'projects/…/locations/…/keyRings/…/cryptoKeys/…',
  },
  {
    id: 'azure_key_vault',
    label: 'Azure Key Vault',
    example: 'https://….vault.azure.net/keys/…',
  },
];

function providerLabel(provider: KeyDescriptor['provider']): string {
  return PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider;
}

function formatDate(value: string | null): string {
  if (!value) return 'never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function describeAvailability(availability: KeyAvailability, revokedAt: string | null): string {
  switch (availability.state) {
    case 'platform_derived':
      return 'Workspace data is sealed with a key the platform manages.';
    case 'platform_unconfigured':
      return 'Encryption at rest is not configured on this deployment.';
    case 'customer_managed':
      return `Workspace data is sealed with your ${providerLabel(availability.descriptor.provider)} key ${availability.descriptor.keyUri} in ${availability.descriptor.region}, version ${availability.keyVersion}.`;
    case 'revoked':
      return `Your key was revoked on ${formatDate(revokedAt)}. Data sealed under it can no longer be read.`;
    case 'unavailable':
      return `Your ${providerLabel(availability.descriptor.provider)} key cannot be used right now: ${availability.reason}. Requests that need sealed data are refused until it can.`;
  }
}

function DescriptorForm({
  submitLabel,
  pending,
  onSubmit,
}: {
  submitLabel: string;
  pending: boolean;
  onSubmit: (descriptor: KeyDescriptor) => void;
}) {
  const [provider, setProvider] = useState<KeyProviderId>('aws_kms');
  const [keyUri, setKeyUri] = useState('');
  const [region, setRegion] = useState('');
  const example = PROVIDERS.find((entry) => entry.id === provider)?.example ?? '';

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!keyUri.trim() || !region.trim()) return;
        onSubmit({ provider, keyUri: keyUri.trim(), region: region.trim() });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
          Provider
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as KeyProviderId)}
            style={controlStyle}
          >
            {PROVIDERS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="flex flex-col gap-1 text-xs sm:col-span-2"
          style={{ color: 'var(--text-2)' }}
        >
          Key identifier
          <input
            value={keyUri}
            placeholder={example}
            spellCheck={false}
            onChange={(event) => setKeyUri(event.target.value)}
            style={controlStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
          Region
          <input
            value={region}
            placeholder="us-east-1"
            spellCheck={false}
            onChange={(event) => setRegion(event.target.value)}
            style={controlStyle}
          />
        </label>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        The key is checked before anything is sealed with it: the workspace must be allowed to
        encrypt and decrypt with it, and every failed check is listed if it is not.
      </p>
      <div>
        <button
          type="submit"
          className={primaryButton}
          disabled={pending || !keyUri.trim() || !region.trim()}
        >
          {pending ? <Spinner size="sm" aria-hidden="true" /> : null}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function RewrapRow({
  version,
  run,
  pending,
  onChange,
}: {
  version: string;
  run: KeyRewrapRun | undefined;
  pending: boolean;
  onChange: (change: EncryptionKeyChange) => void;
}) {
  const [reason, setReason] = useState('');
  const complete = run?.state === 'complete' && run.remaining === 0;

  return (
    <li
      className="flex flex-col gap-2 border-t pt-3"
      style={{ borderColor: 'var(--settings-border)' }}
    >
      <p className="text-xs" style={{ color: 'var(--text-1)' }}>
        Version {version}:{' '}
        {run
          ? `${run.state}, ${run.resealed} of ${run.scanned} records re-sealed, ${run.remaining} left${run.failureCount > 0 ? `, ${run.failureCount} failed` : ''}`
          : 'still holds data sealed before the last change'}
      </p>
      {run?.lastError ? (
        <p className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
          {run.lastError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {complete ? null : (
          <button
            type="button"
            className={secondaryButton}
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            disabled={pending}
            onClick={() => onChange({ kind: 'rewrap', fromVersion: version })}
          >
            Re-seal data under the current version
          </button>
        )}
        {complete ? (
          <>
            <input
              aria-label={`Why version ${version} is being retired`}
              value={reason}
              placeholder="Reason, recorded in the audit trail"
              onChange={(event) => setReason(event.target.value)}
              style={{ ...controlStyle, minWidth: 0, flex: 1 }}
            />
            <button
              type="button"
              className={secondaryButton}
              style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
              disabled={pending || !reason.trim()}
              onClick={() =>
                onChange({ kind: 'retire', fromVersion: version, reason: reason.trim() })
              }
            >
              Retire version
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function ManagedKey({
  keyState,
  pending,
  onChange,
}: {
  keyState: WorkspaceKey;
  pending: boolean;
  onChange: (change: EncryptionKeyChange) => void;
}) {
  const { confirm, dialog } = useConfirmAction();
  const [replacing, setReplacing] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const activeVersion = keyState.activeVersion;

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {activeVersion ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButton}
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            disabled={pending}
            onClick={() =>
              confirm({
                title: 'Rotate the workspace key?',
                description:
                  'New data is sealed under a new version of the same key. Data sealed under the current version stays readable until you re-seal it.',
                confirmLabel: 'Rotate key',
                onConfirm: () => onChange({ kind: 'rotate', activeVersion }),
              })
            }
          >
            Rotate
          </button>
          <button
            type="button"
            className={secondaryButton}
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            disabled={pending}
            aria-expanded={replacing}
            onClick={() => setReplacing((open) => !open)}
          >
            Replace with a different key
          </button>
        </div>
      ) : null}

      {replacing && activeVersion ? (
        <DescriptorForm
          submitLabel="Replace key"
          pending={pending}
          onSubmit={(descriptor) => onChange({ kind: 'replace', activeVersion, descriptor })}
        />
      ) : null}

      {keyState.retiredVersions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
            Earlier versions
          </h3>
          <ul className="flex flex-col gap-3">
            {keyState.retiredVersions.map((version) => (
              <RewrapRow
                key={version}
                version={version}
                run={keyState.rewrapRuns.find((run) => run.fromVersion === version)}
                pending={pending}
                onChange={onChange}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {keyState.canRevoke && activeVersion ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
            Revoke
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Revoking makes everything sealed under this key unreadable, for this workspace and for
            AGI Workforce. Only the owner can do it, and a legal hold blocks it.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Why the key is being revoked"
              value={revokeReason}
              placeholder="Reason, recorded in the audit trail"
              onChange={(event) => setRevokeReason(event.target.value)}
              style={{ ...controlStyle, minWidth: 0, flex: 1 }}
            />
            <button
              type="button"
              className={secondaryButton}
              style={{
                borderColor: 'var(--settings-border)',
                color: 'var(--settings-destructive-text)',
              }}
              disabled={pending || !revokeReason.trim()}
              onClick={() =>
                confirm({
                  title: 'Revoke the workspace key?',
                  description:
                    'Everything sealed under this key becomes permanently unreadable. Chats, files and memories that depend on it stop working for every member. This cannot be undone.',
                  confirmLabel: 'Revoke key',
                  destructive: true,
                  onConfirm: () =>
                    onChange({
                      kind: 'revoke',
                      organizationId: keyState.organizationId,
                      reason: revokeReason.trim(),
                    }),
                })
              }
            >
              Revoke key
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceEncryptionKey() {
  const lookup = useWorkspaceEncryptionKey();
  const change = useChangeEncryptionKey();

  const run = (next: EncryptionKeyChange) => change.mutate(next);
  const error = change.error && !isStepUpCancelled(change.error) ? change.error : null;

  return (
    <section className="flex flex-col gap-4 p-5" style={cardStyle} aria-labelledby="workspace-key">
      {change.stepUpDialog}
      <div>
        <h2 id="workspace-key" className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          Encryption key
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Seal this workspace&rsquo;s data with a key you hold in your own cloud account, and
          rotate, replace or revoke it here.
        </p>
      </div>

      {lookup.isLoading ? <Spinner size="sm" aria-label="Loading the encryption key" /> : null}

      {lookup.error ? (
        <p role="alert" className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
          {toUserMessage(lookup.error, 'The encryption key could not be loaded.')}
        </p>
      ) : null}

      {lookup.data?.kind === 'refused' ? (
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>
          {lookup.data.message}
        </p>
      ) : null}

      {lookup.data?.kind === 'ready' ? (
        <>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-1)' }}>
            {describeAvailability(
              lookup.data.key.status.availability,
              lookup.data.key.status.revokedAt,
            )}{' '}
            Last rotated: {formatDate(lookup.data.key.status.lastRotatedAt)}.
          </p>
          {lookup.data.key.activeVersion === null &&
          lookup.data.key.status.availability.state !== 'revoked' ? (
            <DescriptorForm
              submitLabel="Connect key"
              pending={change.isPending}
              onSubmit={(descriptor) => run({ kind: 'connect', descriptor })}
            />
          ) : (
            <ManagedKey keyState={lookup.data.key} pending={change.isPending} onChange={run} />
          )}
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
          {toUserMessage(error, 'The encryption key could not be changed.')}
        </p>
      ) : null}
    </section>
  );
}
