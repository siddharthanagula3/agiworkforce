'use client';

import Link from 'next/link';

import { useOrganizationOverview } from '@/features/settings/hooks/use-settings-queries';
import { EnterpriseCollectionBanner } from '@/features/settings/components/EnterpriseCollectionBanner';
import { toUserMessage } from '@/lib/user-error-message';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm" style={{ color: 'var(--text-2)' }}>
          {label}
        </span>
        <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--text-1)' }}>
          {value}
        </span>
      </div>
      {note ? (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function WorkspaceBillingSummary() {
  const { data, isPending, isError, error, refetch } = useOrganizationOverview();

  if (isPending) {
    return (
      <div
        role="status"
        style={{ ...cardStyle, padding: 20, color: 'var(--text-3)', fontSize: 13 }}
      >
        Loading plan and seats…
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load your plan
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load the billing summary.')}
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

  const organization = data?.organization ?? null;
  const access = data?.access ?? null;

  if (!organization || !access) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          No workspace selected
        </p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Seats and workspace billing belong to a shared workspace. Personal billing lives in
          account settings.
        </p>
      </div>
    );
  }

  const seatsNote =
    access.seatSource === 'billing'
      ? 'Seat count is written by the billing webhook and cannot be lowered below occupied seats.'
      : access.seatSource === 'unprovisioned'
        ? 'No licensed seat quantity has been recorded for this workspace yet, so the ceiling is unknown.'
        : 'Seat provenance is unknown for this workspace.';

  return (
    <div className="flex flex-col gap-6">
      <EnterpriseCollectionBanner />

      <section style={cardStyle} aria-labelledby="plan-heading">
        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
          <h2
            id="plan-heading"
            className="text-sm font-semibold"
            style={{ color: 'var(--text-1)' }}
          >
            Plan and seats
          </h2>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
          <Row label="Plan" value={access.plan} />
          <Row
            label="Seats used"
            value={
              access.maxMembers === null
                ? `${organization.memberCount}`
                : `${access.seatsConsumed ?? organization.memberCount} of ${access.maxMembers}`
            }
            note={seatsNote}
          />
          <Row label="Members" value={String(organization.memberCount)} />
        </div>
      </section>

      <section style={cardStyle} aria-labelledby="manage-heading">
        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
          <h2
            id="manage-heading"
            className="text-sm font-semibold"
            style={{ color: 'var(--text-1)' }}
          >
            Manage billing
          </h2>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Payment method, invoices, and plan changes are handled in billing settings. This page
            shows only what the workspace consumes, so the two cannot drift apart.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/settings/billing"
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            >
              Billing settings
            </Link>
            <Link
              href="/settings/usage"
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            >
              Usage
            </Link>
          </div>
        </div>
      </section>

      <p className="px-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
        Per-member and per-model cost attribution is recorded in the workspace usage ledger but has
        no admin read path yet, so it is not shown here rather than being estimated.
      </p>
    </div>
  );
}
