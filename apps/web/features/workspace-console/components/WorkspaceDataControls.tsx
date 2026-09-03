'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Gavel, ShieldAlert } from 'lucide-react';

import {
  useCreateLegalHold,
  useLegalHolds,
  useReleaseLegalHold,
  type LegalHold,
  type LegalHoldScope,
  type RetentionSweepRecord,
} from '../hooks/use-legal-holds';
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

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Outcome carries the meaning an auditor scans for, so it is encoded in form as
 * well as in text. `aborted` in particular must not read like a routine empty
 * run: it means the sweep refused to delete because it could not establish what
 * was under hold.
 */
function OutcomeChip({ sweep }: { sweep: RetentionSweepRecord }) {
  const label = sweep.dryRun ? `${sweep.outcome} (dry run)` : sweep.outcome.replace(/_/g, ' ');
  const alarming = sweep.outcome === 'aborted' || sweep.outcome === 'failed';

  return (
    <span
      style={{
        fontSize: 12,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        color: alarming ? 'var(--settings-destructive-text)' : 'var(--text-2)',
        border: `1px solid ${alarming ? 'currentColor' : 'var(--settings-border)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: '2px 6px',
      }}
    >
      {label}
    </span>
  );
}

function HoldRow({
  hold,
  onRelease,
  releasing,
  armed,
  onArm,
  onDisarm,
}: {
  hold: LegalHold;
  onRelease: (id: string) => void;
  releasing: boolean;
  armed: boolean;
  onArm: (id: string) => void;
  onDisarm: () => void;
}) {
  const released = hold.releasedAt !== null;

  return (
    <li
      className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
      style={{ borderColor: 'var(--settings-border)' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          {hold.name}
        </p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {hold.scope === 'organization'
            ? 'Whole workspace'
            : `Member ${hold.subjectUserId ?? 'unknown'}`}
          {' · '}
          Placed {when(hold.createdAt)}
          {released ? ` · Released ${when(hold.releasedAt as string)}` : ''}
        </p>
        {hold.reason ? (
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {hold.reason}
          </p>
        ) : null}
        {armed ? (
          <p
            id={`release-warning-${hold.id}`}
            role="alert"
            className="mt-2 text-xs leading-relaxed"
            style={{ color: 'var(--settings-destructive-text)' }}
          >
            Releasing this hold lets the retention sweep delete the records it was preserving. This
            cannot be undone.
          </p>
        ) : null}
      </div>
      {released ? (
        <span className="shrink-0 text-xs" style={{ color: 'var(--text-3)' }}>
          Released
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          {armed ? (
            <button
              type="button"
              onClick={onDisarm}
              disabled={releasing}
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              style={{ borderColor: 'var(--settings-border)', color: 'var(--text-2)' }}
            >
              Keep hold
            </button>
          ) : null}
          <button
            type="button"
            disabled={releasing}
            onClick={() => (armed ? onRelease(hold.id) : onArm(hold.id))}
            aria-describedby={armed ? `release-warning-${hold.id}` : undefined}
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            style={{ borderColor: 'currentColor', color: 'var(--settings-destructive-text)' }}
          >
            {releasing ? 'Releasing…' : armed ? 'Confirm release' : 'Release hold'}
          </button>
        </div>
      )}
    </li>
  );
}

export function WorkspaceDataControls() {
  const { data, isPending, isError, error, refetch } = useLegalHolds();
  const create = useCreateLegalHold();
  const release = useReleaseLegalHold();

  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<LegalHoldScope>('organization');
  const [subjectUserId, setSubjectUserId] = useState('');
  const [confirmingRelease, setConfirmingRelease] = useState<string | null>(null);

  if (isPending) {
    return (
      <div
        role="status"
        style={{ ...cardStyle, padding: 20, color: 'var(--text-3)', fontSize: 13 }}
      >
        Loading legal holds…
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load your legal holds
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load the data controls.')}
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

  if (data === null) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          You do not administer this workspace
        </p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Placing and releasing legal holds is limited to owners and admins.
        </p>
      </div>
    );
  }

  const active = data.holds.filter((hold) => hold.releasedAt === null);
  const past = data.holds.filter((hold) => hold.releasedAt !== null);
  const canSubmit =
    name.trim().length > 0 &&
    (scope === 'organization' || subjectUserId.trim().length > 0) &&
    !create.isPending;

  return (
    <div className="flex flex-col gap-6">
      <section style={cardStyle} aria-labelledby="holds-heading">
        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
          <h2
            id="holds-heading"
            className="text-sm font-semibold"
            style={{ color: 'var(--text-1)' }}
          >
            Legal holds
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            A hold suspends retention for its subject. Held conversations survive the sweep however
            old they are, and the sweep refuses to delete anything at all if it cannot read the hold
            set.
          </p>
        </div>

        {active.length === 0 && past.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <Gavel aria-hidden className="h-5 w-5" style={{ color: 'var(--text-3)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
              No legal holds
            </p>
            <p className="max-w-sm text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
              Place a hold when records must be preserved beyond your retention window, for
              litigation, an investigation, or a regulatory request.
            </p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
            {[...active, ...past].map((hold) => (
              <HoldRow
                key={hold.id}
                hold={hold}
                releasing={release.isPending && confirmingRelease === hold.id}
                armed={confirmingRelease === hold.id}
                onArm={(id) => setConfirmingRelease(id)}
                onDisarm={() => setConfirmingRelease(null)}
                onRelease={(id) => {
                  release.mutate(id, { onSettled: () => setConfirmingRelease(null) });
                }}
              />
            ))}
          </ul>
        )}

        <div
          className="flex flex-col gap-3 border-t px-5 py-4"
          style={{ borderColor: 'var(--settings-border)' }}
        >
          <p
            className="text-xs font-medium uppercase tracking-[0.08em]"
            style={{ color: 'var(--text-3)' }}
          >
            Place a hold
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Matter name"
              aria-label="Legal hold name"
              maxLength={200}
              style={{ ...controlStyle, flex: '1 1 200px' }}
            />
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as LegalHoldScope)}
              aria-label="Legal hold scope"
              style={controlStyle}
            >
              <option value="organization">Whole workspace</option>
              <option value="member">One member</option>
            </select>
            {scope === 'member' ? (
              <input
                value={subjectUserId}
                onChange={(event) => setSubjectUserId(event.target.value)}
                placeholder="Member user id"
                aria-label="Held member user id"
                style={{ ...controlStyle, flex: '1 1 200px' }}
              />
            ) : null}
          </div>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (recorded with the hold)"
            aria-label="Legal hold reason"
            maxLength={2000}
            style={controlStyle}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() =>
                create.mutate(
                  {
                    name: name.trim(),
                    reason: reason.trim() || null,
                    scope,
                    subjectUserId: scope === 'member' ? subjectUserId.trim() : null,
                  },
                  {
                    onSuccess: () => {
                      setName('');
                      setReason('');
                      setSubjectUserId('');
                    },
                  },
                )
              }
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {create.isPending ? 'Placing…' : 'Place hold'}
            </button>
            {create.isError ? (
              <span className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
                {create.error.message}
              </span>
            ) : null}
            {release.isError ? (
              <span className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
                {release.error.message}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section style={cardStyle} aria-labelledby="sweeps-heading">
        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
          <h2
            id="sweeps-heading"
            className="text-sm font-semibold"
            style={{ color: 'var(--text-1)' }}
          >
            Retention sweeps
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            What each run deleted, what it withheld, and when it declined to run. This is the record
            you show an auditor instead of asserting that deletion happens.
          </p>
        </div>

        {data.sweeps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <ShieldAlert aria-hidden className="h-5 w-5" style={{ color: 'var(--text-3)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
              No sweep has run
            </p>
            <p className="max-w-sm text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
              Retention is not enforced for this workspace, so nothing is being deleted. Turn it on
              in{' '}
              <Link href="/workspace/policy" style={{ textDecoration: 'underline' }}>
                policy
              </Link>{' '}
              once you are ready for permanent deletion.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-3)' }}>
                  <th className="px-5 py-2 font-medium">When</th>
                  <th className="px-5 py-2 font-medium">Outcome</th>
                  <th className="px-5 py-2 text-right font-medium">Deleted</th>
                  <th className="px-5 py-2 text-right font-medium">Held</th>
                  <th className="px-5 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {data.sweeps.map((sweep) => (
                  <tr key={sweep.id} style={{ borderTop: '1px solid var(--settings-border)' }}>
                    <td
                      className="whitespace-nowrap px-5 py-2.5"
                      style={{ color: 'var(--text-2)' }}
                    >
                      {when(sweep.createdAt)}
                    </td>
                    <td className="px-5 py-2.5">
                      <OutcomeChip sweep={sweep} />
                    </td>
                    <td
                      className="px-5 py-2.5 text-right tabular-nums"
                      style={{ color: 'var(--text-1)' }}
                    >
                      {sweep.conversationsDeleted}
                    </td>
                    <td
                      className="px-5 py-2.5 text-right tabular-nums"
                      style={{ color: 'var(--text-1)' }}
                    >
                      {sweep.conversationsHeld}
                    </td>
                    <td className="px-5 py-2.5" style={{ color: 'var(--text-3)' }}>
                      {sweep.error ?? `${sweep.retentionDays}-day window`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
