/**
 * AccountSettings tab content
 *
 * Cloud account identity, plan, linked device, credits, and sign-out.
 *
 * Rendered as hairline-divided rows inside bordered groups — the same pattern
 * DesktopCloudSettingsModal already uses for Capabilities — instead of one
 * short card floating in an otherwise empty 620px pane. Every row is backed by
 * data already in the auth store; nothing is invented and nothing is faked when
 * a field is absent (the row is simply not rendered).
 *
 * Identity itself is Clerk-owned, so name/email are read-only and "Manage
 * account" hands off. Subscription changes stay in the Cloud Billing section;
 * the Plan row only links to the same Stripe portal.
 */
import { useState } from 'react';
import { Button } from '@/ui/Button';
import { useAccountStore, useAuthStore } from '../../stores/auth';
import type { CreditBalance, SubscriptionStatus } from '../../stores/auth';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import { openBillingPortal } from '../../lib/stripeCheckout';
import { getDesktopSubscriptionOwnerPolicy } from '../../lib/subscriptionOwnership';
import { isElectronHost } from '../../lib/runtimeEnvironment';

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past due',
  canceled: 'Canceled',
  none: 'No subscription',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired',
  unpaid: 'Unpaid',
};

function initialsOf(name: string): string {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** One hairline-divided row: label + optional description on the left, an
 *  optional control on the right. */
function Row({
  label,
  description,
  control,
  first,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 p-5 ${
        first ? '' : 'border-t border-border/60'
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description ? (
          <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {control ? <div className="shrink-0">{control}</div> : null}
    </div>
  );
}

export function AccountSettings() {
  const accountData = useAccountStore((state) => state.account);
  const cancellationScheduled = accountData.subscriptionCancelAtPeriodEnd;
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const ownerPolicy = getDesktopSubscriptionOwnerPolicy(
    accountData.subscriptionSource,
    accountData.subscriptionStatus,
    accountData.subscriptionFetchStatus === 'succeeded',
  );

  const displayName =
    accountData.displayName || accountData.email?.split('@')[0] || 'AGI Workforce user';
  const subscriptionStatusLabel =
    SUBSCRIPTION_STATUS_LABELS[accountData.subscriptionStatus] ?? 'Unknown';
  const planStatus = cancellationScheduled
    ? `${subscriptionStatusLabel} · cancellation scheduled`
    : subscriptionStatusLabel;
  const periodEnd = accountData.currentPeriodEnd
    ? new Date(accountData.currentPeriodEnd).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;
  const periodLabel = cancellationScheduled
    ? 'Access ends'
    : accountData.subscriptionStatus === 'canceled'
      ? 'Ended'
      : 'Renews';

  const manageStripeSubscription = () => {
    if (!ownerPolicy.canOpenStripePortal) return;
    setPortalError(null);
    setPortalLoading(true);
    void openBillingPortal(async () => {
      await cloudAccountAuth.refreshUserData();
    })
      .then((error) => {
        if (error) setPortalError(error);
      })
      .catch((error: unknown) => {
        setPortalError(error instanceof Error ? error.message : 'Could not open billing.');
      })
      .finally(() => setPortalLoading(false));
  };

  const planControl = ownerPolicy.canOpenStripePortal ? (
    <Button variant="outline" size="sm" disabled={portalLoading} onClick={manageStripeSubscription}>
      {portalLoading ? 'Opening billing…' : 'Manage subscription'}
    </Button>
  ) : ownerPolicy.canStartStripePlanChange ? (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent('chat:action', { detail: { type: 'open-plans-modal' } }),
        );
      }}
    >
      View plans
    </Button>
  ) : undefined;

  const rows: Array<{
    label: React.ReactNode;
    description?: React.ReactNode;
    control?: React.ReactNode;
  }> = [
    {
      label: (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {accountData.avatar ? (
              <img
                src={accountData.avatar}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span>{initialsOf(displayName)}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{displayName}</div>
            <div className="truncate text-xs text-muted-foreground">{accountData.email}</div>
          </div>
        </div>
      ),
      control: (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void cloudAccountAuth.openAccountManagement()}
        >
          Manage account
        </Button>
      ),
    },
    {
      label: 'Plan',
      description: `${accountData.planDisplayName || 'Free'} · ${planStatus}. ${ownerPolicy.description}`,
      control: planControl,
    },
  ];

  if (periodEnd) {
    rows.push({ label: periodLabel, description: periodEnd });
  }
  if (accountData.deviceLinkId) {
    rows.push({
      label: 'Linked device',
      description: <span className="font-mono text-[11px]">{accountData.deviceLinkId}</span>,
    });
  }
  rows.push({
    label: 'Sign out',
    description: isElectronHost
      ? 'Signs this Mac out of AGI Cloud. Sign in again to access your account.'
      : 'Disconnects this Mac from AGI Cloud. Local data stays on this device.',
    control: (
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => void useAuthStore.getState().signOut()}
      >
        Sign out
      </Button>
    ),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Account</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your AGI Cloud identity, plan, and this device&apos;s link.
        </p>
      </div>

      {portalError ? <p className="text-xs text-destructive">{portalError}</p> : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card/40">
        {rows.map((row, index) => (
          <Row
            key={typeof row.label === 'string' ? row.label : 'profile'}
            label={row.label}
            description={row.description}
            control={row.control}
            first={index === 0}
          />
        ))}
      </div>

      {accountData.credits ? <CreditsSection credits={accountData.credits} /> : null}
    </div>
  );
}

/** Shares the meter shape used by the Usage section. Kept local on purpose:
 *  importing it from DesktopCloudSettingsModal would pull the whole settings
 *  modal back into this lazily-loaded chunk (that module lazy-loads this one). */
function CreditMeter({
  label,
  usedCents,
  limitCents,
  remainingCents,
  resetAt,
}: {
  label: string;
  usedCents: number;
  limitCents: number;
  remainingCents: number;
  resetAt?: string;
}) {
  const percent = Math.min(100, Math.max(0, (usedCents / (limitCents || 1)) * 100));
  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          ${(remainingCents / 100).toFixed(2)} remaining
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {resetAt ? `Resets ${new Date(resetAt).toLocaleString()}` : `${Math.round(percent)}% used`}
      </p>
    </div>
  );
}

function CreditsSection({ credits }: { credits: CreditBalance }) {
  const hasDaily = (credits.daily_limit_cents ?? 0) > 0;
  const hasMonthly = (credits.allocated_cents ?? 0) > 0;
  if (!hasDaily && !hasMonthly) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-foreground">Credits</h3>
      <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card/40">
        {hasDaily && (
          <CreditMeter
            label="Daily credits"
            usedCents={credits.daily_used_cents ?? 0}
            limitCents={credits.daily_limit_cents ?? 0}
            remainingCents={credits.daily_remaining_cents ?? 0}
            resetAt={credits.daily_reset_at}
          />
        )}
        {hasMonthly && (
          <CreditMeter
            label="Monthly credits"
            usedCents={credits.used_cents ?? 0}
            limitCents={credits.allocated_cents ?? 0}
            remainingCents={credits.remaining_cents ?? 0}
            resetAt={credits.period_end}
          />
        )}
      </div>
    </div>
  );
}
