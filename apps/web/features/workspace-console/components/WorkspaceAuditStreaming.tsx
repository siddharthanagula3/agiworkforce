'use client';

import { useState } from 'react';
import { RadioTower } from 'lucide-react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import {
  useAuditDestination,
  useDeleteAuditDestination,
  useSaveAuditDestination,
  useToggleAuditDestination,
  type AuditDestination,
} from '../hooks/use-audit-destination';
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
  padding: '5px 8px',
} as const;

const secondaryButtonClass =
  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

const primaryButtonClass =
  'rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

function when(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function deliveryState(destination: AuditDestination): { label: string; alarming: boolean } {
  if (!destination.enabled) return { label: 'Paused', alarming: false };
  if (destination.consecutiveFailures > 0) {
    return { label: `Failing, ${destination.consecutiveFailures} in a row`, alarming: true };
  }
  return {
    label: destination.lastDeliveredAt ? 'Delivering' : 'Waiting for events',
    alarming: false,
  };
}

function SigningSecretNotice({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className="flex flex-col gap-2 border-t px-5 py-4"
      style={{ borderColor: 'var(--settings-border)' }}
      role="region"
      aria-label="Signing secret"
    >
      <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
        Copy the signing secret now
      </p>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
        It is shown once and cannot be recovered. Each delivery carries an X-AGI-Audit-Signature
        header: an HMAC-SHA256 of the X-AGI-Audit-Timestamp value, a full stop, and the raw body,
        keyed with the SHA-256 hex digest of this secret.
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
          {copied ? 'Copied' : 'Copy secret'}
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

export function WorkspaceAuditStreaming() {
  const { data, isPending, isError, error, refetch } = useAuditDestination();
  const save = useSaveAuditDestination();
  const toggle = useToggleAuditDestination();
  const remove = useDeleteAuditDestination();
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const [endpointUrl, setEndpointUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [signingSecret, setSigningSecret] = useState<string | null>(null);

  if (isPending) {
    return (
      <div
        className="flex items-center gap-2"
        style={{ ...cardStyle, padding: 20, color: 'var(--text-3)', fontSize: 13 }}
      >
        <Spinner size="sm" />
        Loading audit streaming…
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load audit streaming
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load the audit destination.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className={`mt-3 ${secondaryButtonClass}`}
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null) return null;

  const destination = data.destination;
  const trimmedUrl = endpointUrl.trim();
  const canSave = trimmedUrl.startsWith('https://') && !save.isPending;

  const submit = () => {
    save.mutate(
      { endpointUrl: trimmedUrl, enabled: destination?.enabled ?? true },
      {
        onSuccess: (result) => {
          setSigningSecret(result.signingSecret);
          setEndpointUrl('');
          setEditing(false);
        },
      },
    );
  };

  const askToReplace = () => {
    if (!destination) {
      submit();
      return;
    }
    confirm({
      title: 'Replace the endpoint and its signing secret?',
      description:
        'Saving mints a new signing secret. Your receiver rejects every delivery until it is updated with the new secret, and the old secret stops working immediately.',
      confirmLabel: 'Save and rotate',
      cancelLabel: 'Keep current',
      destructive: true,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          save.mutate(
            { endpointUrl: trimmedUrl, enabled: destination.enabled },
            {
              onSuccess: (result) => {
                setSigningSecret(result.signingSecret);
                setEndpointUrl('');
                setEditing(false);
              },
              onSettled: () => resolve(),
            },
          );
        }),
    });
  };

  const askToRotate = (current: AuditDestination) => {
    confirm({
      title: 'Rotate the signing secret?',
      description: `Deliveries to ${current.endpointUrl} are signed with the new secret from the next run. Your receiver rejects them until it is updated, and the current secret cannot be restored.`,
      confirmLabel: 'Rotate secret',
      cancelLabel: 'Keep secret',
      destructive: true,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          save.mutate(
            { endpointUrl: current.endpointUrl, enabled: current.enabled },
            {
              onSuccess: (result) => setSigningSecret(result.signingSecret),
              onSettled: () => resolve(),
            },
          );
        }),
    });
  };

  const askToRemove = (current: AuditDestination) => {
    confirm({
      title: 'Stop streaming the audit trail?',
      description: `Events stop arriving at ${current.endpointUrl}, and the delivery position is discarded. Adding a destination again starts from the beginning of the trail with a new secret. The trail itself is kept.`,
      confirmLabel: 'Remove destination',
      cancelLabel: 'Keep streaming',
      destructive: true,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          remove.mutate(undefined, { onSettled: () => resolve() });
        }),
    });
  };

  const mutationError = save.error ?? toggle.error ?? remove.error;
  const state = destination ? deliveryState(destination) : null;

  return (
    <section style={cardStyle} aria-labelledby="audit-streaming-heading">
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2
          id="audit-streaming-heading"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          SIEM streaming
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Deliver this workspace&apos;s audit events to your SIEM as signed batches. Delivery runs
          on a schedule, and a failed delivery is retried rather than dropped.
        </p>
      </div>

      {destination && state ? (
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="break-all text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                {destination.endpointUrl}
              </p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                Last delivered {when(destination.lastDeliveredAt)}
                {destination.lastStatus ? ` · ${destination.lastStatus}` : ''}
                {' · '}Secret {destination.secretPrefix}…
              </p>
            </div>
            <span
              className="shrink-0 text-xs font-medium"
              style={{
                color: state.alarming ? 'var(--settings-destructive-text)' : 'var(--text-2)',
              }}
            >
              {state.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate(!destination.enabled)}
              className={secondaryButtonClass}
              style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            >
              {destination.enabled ? 'Pause delivery' : 'Resume delivery'}
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => setEditing((open) => !open)}
              className={secondaryButtonClass}
              style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
              aria-expanded={editing}
            >
              Change endpoint
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => askToRotate(destination)}
              className={secondaryButtonClass}
              style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            >
              Rotate secret
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => askToRemove(destination)}
              className={secondaryButtonClass}
              style={{ borderColor: 'currentColor', color: 'var(--settings-destructive-text)' }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
          <RadioTower aria-hidden className="h-5 w-5" style={{ color: 'var(--text-3)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
            No destination
          </p>
          <p className="max-w-sm text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Point the trail at an HTTPS endpoint your SIEM ingests from. Until then, pull the JSONL
            export on a schedule.
          </p>
        </div>
      )}

      {!destination || editing ? (
        <div
          className="flex flex-col gap-3 border-t px-5 py-4"
          style={{ borderColor: 'var(--settings-border)' }}
        >
          <div className="flex flex-wrap gap-2">
            <input
              type="url"
              inputMode="url"
              value={endpointUrl}
              onChange={(event) => setEndpointUrl(event.target.value)}
              placeholder="https://"
              aria-label="Audit destination endpoint"
              maxLength={2048}
              style={{ ...controlStyle, flex: '1 1 240px' }}
            />
            <button
              type="button"
              disabled={!canSave}
              onClick={askToReplace}
              className={primaryButtonClass}
            >
              {save.isPending ? 'Saving…' : destination ? 'Save endpoint' : 'Start streaming'}
            </button>
          </div>
        </div>
      ) : null}

      {mutationError ? (
        <p
          className="border-t px-5 py-3 text-xs"
          style={{
            borderColor: 'var(--settings-border)',
            color: 'var(--settings-destructive-text)',
          }}
        >
          {mutationError.message}
        </p>
      ) : null}

      {signingSecret ? (
        <SigningSecretNotice secret={signingSecret} onDismiss={() => setSigningSecret(null)} />
      ) : null}
      {confirmDialog}
    </section>
  );
}
