'use client';

import { useEffect, useState } from 'react';
import {
  RETENTION_DAYS_MAX,
  RETENTION_DAYS_MIN,
  RETENTION_DOMAIN_LABELS,
  type DomainRetentionPolicy,
  type RetentionDomain,
} from '@agiworkforce/types';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { useDomainRetention, useSaveDomainRetention } from '../hooks/use-domain-retention';
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

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function DomainRow({
  policy,
  canManage,
  saving,
  onSave,
}: {
  policy: DomainRetentionPolicy;
  canManage: boolean;
  saving: boolean;
  onSave: (next: DomainRetentionPolicy) => void;
}) {
  const [days, setDays] = useState(String(policy.retentionDays));
  const [enforced, setEnforced] = useState(policy.enforced);

  useEffect(() => {
    setDays(String(policy.retentionDays));
    setEnforced(policy.enforced);
  }, [policy.enforced, policy.retentionDays]);

  const parsed = Number.parseInt(days, 10);
  const valid =
    Number.isInteger(parsed) && parsed >= RETENTION_DAYS_MIN && parsed <= RETENTION_DAYS_MAX;
  const dirty = parsed !== policy.retentionDays || enforced !== policy.enforced;
  const label = RETENTION_DOMAIN_LABELS[policy.domain];

  return (
    <li
      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: 'var(--settings-border)' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          {label}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
          {policy.enforced
            ? `Deleted after ${policy.retentionDays} days`
            : 'Kept until someone deletes it'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
          <input
            type="checkbox"
            checked={enforced}
            disabled={!canManage || saving}
            onChange={(event) => setEnforced(event.target.checked)}
            aria-label={`Enforce retention for ${label}`}
          />
          Enforce
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={RETENTION_DAYS_MIN}
          max={RETENTION_DAYS_MAX}
          value={days}
          disabled={!canManage || saving}
          onChange={(event) => setDays(event.target.value)}
          aria-label={`Retention days for ${label}`}
          style={{ ...controlStyle, width: 88 }}
        />
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          days
        </span>
        {canManage ? (
          <button
            type="button"
            disabled={!dirty || !valid || saving}
            onClick={() => onSave({ ...policy, retentionDays: parsed, enforced })}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          >
            {saving ? <Spinner size="sm" /> : null}
            Save
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function WorkspaceDomainRetention() {
  const { data, isPending, isError, error, refetch } = useDomainRetention();
  const save = useSaveDomainRetention();
  const [savingDomain, setSavingDomain] = useState<RetentionDomain | null>(null);
  const { confirm, dialog } = useConfirmAction();

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
          We could not load data retention
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load data retention.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null) return null;

  const persist = (next: DomainRetentionPolicy) => {
    setSavingDomain(next.domain);
    return new Promise<void>((resolve) => {
      save.mutate([next], {
        onSettled: () => {
          setSavingDomain(null);
          resolve();
        },
      });
    });
  };

  const handleSave = (next: DomainRetentionPolicy) => {
    const current = data.policies.find((policy) => policy.domain === next.domain);
    const shortens =
      next.enforced &&
      (!current?.enforced || next.retentionDays < (current?.retentionDays ?? Infinity));
    if (!shortens) {
      void persist(next);
      return;
    }
    const label = RETENTION_DOMAIN_LABELS[next.domain];
    confirm({
      title: `Delete ${label.toLowerCase()} older than ${next.retentionDays} days?`,
      description: `The nightly sweep permanently deletes ${label.toLowerCase()} past the window, including stored files, for every member not under a legal hold. Deleted records cannot be recovered.`,
      confirmLabel: 'Enforce retention',
      destructive: true,
      onConfirm: () => persist(next),
    });
  };

  return (
    <section style={cardStyle} aria-labelledby="domain-retention-heading">
      {dialog}
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2
          id="domain-retention-heading"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          Retention by data type
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Each type keeps its own window. Legal holds exempt their subject, and a sweep deletes
          nothing if it cannot read the holds.
        </p>
      </div>
      <ul className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
        {data.policies.map((policy) => (
          <DomainRow
            key={policy.domain}
            policy={policy}
            canManage={data.canManageRetention}
            saving={savingDomain === policy.domain}
            onSave={handleSave}
          />
        ))}
      </ul>
      {save.isError ? (
        <p
          role="alert"
          className="px-5 pb-4 text-xs"
          style={{ color: 'var(--settings-destructive-text)' }}
        >
          {toUserMessage(save.error, 'Could not update retention policy. Try again.')}
        </p>
      ) : null}
      {data.sweeps.length > 0 ? (
        <div className="overflow-x-auto border-t" style={{ borderColor: 'var(--settings-border)' }}>
          <table className="w-full text-left text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-3)' }}>
                <th className="px-5 py-2 font-medium">When</th>
                <th className="px-5 py-2 font-medium">Type</th>
                <th className="px-5 py-2 font-medium">Outcome</th>
                <th className="px-5 py-2 text-right font-medium">Deleted</th>
                <th className="px-5 py-2 text-right font-medium">Files deleted</th>
                <th className="px-5 py-2 text-right font-medium">Held</th>
              </tr>
            </thead>
            <tbody>
              {data.sweeps.map((sweep) => (
                <tr key={sweep.id} style={{ borderTop: '1px solid var(--settings-border)' }}>
                  <td className="whitespace-nowrap px-5 py-2.5" style={{ color: 'var(--text-2)' }}>
                    {when(sweep.createdAt)}
                  </td>
                  <td className="px-5 py-2.5" style={{ color: 'var(--text-2)' }}>
                    {RETENTION_DOMAIN_LABELS[sweep.domain]}
                  </td>
                  <td
                    className="px-5 py-2.5"
                    style={{
                      color:
                        sweep.outcome === 'aborted' || sweep.outcome === 'failed'
                          ? 'var(--settings-destructive-text)'
                          : 'var(--text-2)',
                    }}
                    title={sweep.error ?? undefined}
                  >
                    {sweep.outcome.replace(/_/g, ' ')}
                  </td>
                  <td
                    className="px-5 py-2.5 text-right tabular-nums"
                    style={{ color: 'var(--text-1)' }}
                  >
                    {sweep.recordsDeleted}
                  </td>
                  <td
                    className="px-5 py-2.5 text-right tabular-nums"
                    style={{ color: 'var(--text-1)' }}
                  >
                    {sweep.objectsDeleted}
                  </td>
                  <td
                    className="px-5 py-2.5 text-right tabular-nums"
                    style={{ color: 'var(--text-1)' }}
                  >
                    {sweep.recordsHeld}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
