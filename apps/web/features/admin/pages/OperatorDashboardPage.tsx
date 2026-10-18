'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  FeedbackRow,
  OperatorOverview,
  UserRow,
} from '@/features/admin/services/operator-metrics';
import { centsFromCredits, formatCredits } from '@agiworkforce/types';
import { useConfirmAction, translateUiPlural } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { requestJson } from '@/shared/utils/request-json';
import BackgroundJobsPanel from '../components/BackgroundJobsPanel';
import ContentTakedownPanel from '../components/ContentTakedownPanel';
import CopyrightNoticeQueuePanel from '../components/CopyrightNoticeQueuePanel';
import EconomicsSummaryPanel from '../components/EconomicsSummaryPanel';
import OperatorCostsPanel from '../components/OperatorCostsPanel';
import PrivacyRequestsPanel from '../components/PrivacyRequestsPanel';
import ProductMetricsPanel from '../components/ProductMetricsPanel';
import RouteEconomicsPanel from '../components/RouteEconomicsPanel';
import ServiceDashboardsPanel from '../components/ServiceDashboardsPanel';
import FeatureFlagsPanel from '../components/FeatureFlagsPanel';
import FreeQuotaAttestationPanel from '../components/FreeQuotaAttestationPanel';
import ModelRolloutPanel from '../components/ModelRolloutPanel';
import RoutingHealthPanel from '../components/RoutingHealthPanel';
import ServiceHealthPanel from '../components/ServiceHealthPanel';
import SupportTicketQueuePanel from '../components/SupportTicketQueuePanel';
import UpgradeAccessPanel from '../components/UpgradeAccessPanel';
import WaitlistPanel from '../components/WaitlistPanel';
import { SupportHandoffQueuePanel } from '@/features/support/components/SupportHandoffQueuePanel';
import { formatCreditAmount, formatDateTime, NOT_RECORDED } from '../lib/operator-format';
import { BULK_RESET_CONFIRMATION } from '../lib/operator-actions';
import { helpHref } from '@/lib/support/help-entry-points';

const TABS = [
  'overview',
  'feedback',
  'users',
  'waitlist',
  'product',
  'costs',
  'routing',
  'rollout',
  'quota',
  'flags',
  'services',
  'dashboards',
  'routes',
  'economics',
  'content',
  'privacy',
  'support',
  'jobs',
] as const;

type Tab = (typeof TABS)[number];

const DATABASE_VIEWS: readonly Tab[] = ['overview', 'feedback', 'users'];

const DEFAULT_TAB: Tab = 'overview';

function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value);
}

function tabFromHash(hash: string): Tab {
  const value = hash.replace(/^#/, '');
  return isTab(value) ? value : DEFAULT_TAB;
}

function GrowthChart({ points }: { points: OperatorOverview['growth'] }) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points.map((p) => p.signups));
  const width = 640;
  const height = 120;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${height - (p.signups / max) * height}`)
    .join(' ');
  const total = points.reduce((sum, p) => sum + p.signups, 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h5">Signups, last 30 days</h2>
        <span className="text-sm text-muted-foreground">
          {total} total · peak {max}/day
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 h-32 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Signups per day over the last 30 days, ${total} in total`}
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="mt-2 text-xs text-muted-foreground">
        {points[0]?.day} → {points[points.length - 1]?.day}
      </p>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function OperatorDashboardPage() {
  const [tab, setTab] = useState<Tab>(DEFAULT_TAB);

  useEffect(() => {
    const applyHash = () => setTab(tabFromHash(window.location.hash));
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const selectTab = useCallback((value: Tab) => {
    setTab(value);
    const url = new URL(window.location.href);
    url.hash = value;
    window.history.replaceState(null, '', url);
  }, []);
  const [overview, setOverview] = useState<OperatorOverview | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirmation, setBulkConfirmation] = useState('');
  const [grantTarget, setGrantTarget] = useState<UserRow | null>(null);
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirmAction();

  const load = useCallback(async (view: Tab) => {
    // Cleared for every view, not only the ones that fetch here: a failure from
    // the last tab must not sit above a panel that owns its own error surface.
    setError(null);
    if (!DATABASE_VIEWS.includes(view)) return;
    try {
      const body = await requestJson<{
        overview: OperatorOverview;
        feedback: FeedbackRow[];
        users: UserRow[];
      }>(`/api/operator?view=${view}`);
      if (view === 'overview') setOverview(body.overview);
      if (view === 'feedback') setFeedback(body.feedback);
      if (view === 'users') setUsers(body.users);
    } catch (e) {
      setError(toUserMessage(e, 'Could not load.'));
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  async function operatorAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return requestJson<Record<string, unknown>>('/api/operator', {
      method: 'POST',
      headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  }

  async function resetEveryone() {
    const typed = bulkConfirmation.trim();
    if (typed !== BULK_RESET_CONFIRMATION) return;
    setBulkBusy(true);
    setNotice(null);
    setError(null);
    try {
      const preview = await operatorAction({ action: 'preview-reset-all' });
      const affected = Number(preview['affectedUsers'] ?? 0);
      const cleared = Number(preview['clearedCredits'] ?? 0);
      if (affected === 0) {
        setNotice('No account has usage to clear right now.');
        return;
      }
      confirmDestructive({
        title: 'Clear usage for every account?',
        description: `This clears ${formatCreditAmount(cleared)} of usage across ${affected} account(s) and cannot be undone. Allocation is untouched.`,
        confirmLabel: 'Clear usage',
        destructive: true,
        onConfirm: async () => {
          setBulkBusy(true);
          try {
            const result = await operatorAction({ action: 'reset-all-usage', confirm: typed });
            setBulkConfirmation('');
            setNotice(
              translateUiPlural(
                'settings',
                'counts.clearedAcrossAccounts',
                Number(result['affectedUsers'] ?? 0),
                {
                  one: 'Cleared {{credits}} across {{count}} account.',
                  other: 'Cleared {{credits}} across {{count}} accounts.',
                },
                { credits: formatCreditAmount(Number(result['clearedCredits'] ?? 0)) },
              ),
            );
            await load(tab);
          } catch (e) {
            setError(toUserMessage(e, 'Could not reset usage.'));
          } finally {
            setBulkBusy(false);
          }
        },
      });
    } catch (e) {
      setError(toUserMessage(e, 'Could not reset usage.'));
    } finally {
      setBulkBusy(false);
    }
  }

  function openGrant(user: UserRow) {
    setGrantTarget(user);
    setGrantAmount('');
    setGrantReason('');
    setNotice(null);
    setError(null);
  }

  async function grantCredits(user: UserRow) {
    const label = user.email ?? user.id;
    const credits = Number(grantAmount);
    if (!grantAmount.trim() || !Number.isFinite(credits) || credits <= 0) {
      setError('Enter a positive number of credits.');
      return;
    }
    const amountCents = Math.ceil(centsFromCredits(credits));
    const reason = grantReason.trim();
    if (!reason) {
      setError('A reason is required so the grant is explainable later.');
      return;
    }
    setBusyUserId(user.id);
    setNotice(null);
    setError(null);
    try {
      const result = await operatorAction({
        action: 'grant-credits',
        userId: user.id,
        amountCents,
        reason,
      });
      setGrantTarget(null);
      const grantedCredits = typeof result['credits'] === 'number' ? result['credits'] : null;
      const expiresAt = typeof result['expiresAt'] === 'string' ? result['expiresAt'] : null;
      setNotice(
        result['granted'] && grantedCredits !== null && expiresAt
          ? `Granted ${formatCredits(grantedCredits, { maximumFractionDigits: 0 })} to ${label}. They expire ${formatDateTime(expiresAt)}.`
          : `${label} has no active credit period, so there was nothing to credit.`,
      );
      await load('users');
    } catch (e) {
      setError(toUserMessage(e, 'Could not grant credit.'));
    } finally {
      setBusyUserId(null);
    }
  }

  async function resetUsage(user: UserRow) {
    // A usage reset rewrites live billing state, so it asks first and names the
    // account it is about to touch rather than only the row that was clicked.
    const label = user.email ?? user.id;
    confirmDestructive({
      title: `Reset usage for ${label}?`,
      description:
        'This clears consumed credits for the current period. Allocation is untouched, and the amount cleared is recorded against the account.',
      confirmLabel: 'Reset usage',
      destructive: true,
      onConfirm: async () => {
        setBusyUserId(user.id);
        setNotice(null);
        try {
          const result = await operatorAction({ action: 'reset-usage', userId: user.id });
          setNotice(
            result['reset']
              ? `Cleared ${formatCreditAmount(typeof result['clearedCredits'] === 'number' ? result['clearedCredits'] : null)} of usage for ${label}.`
              : `${label} has no active credit period, so there was nothing to reset.`,
          );
          await load('users');
        } catch (e) {
          setError(toUserMessage(e, 'Reset failed.'));
        } finally {
          setBusyUserId(null);
        }
      },
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display">Operator dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Feedback, accounts, and growth, read straight from the database.
          </p>
        </div>
        <a
          href={helpHref('operator')}
          className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
        >
          Get help
        </a>
      </div>

      <div role="tablist" aria-label="Dashboard views" className="flex flex-wrap gap-2">
        {TABS.map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => selectTab(value)}
            className={`rounded-full border px-4 py-1.5 text-sm capitalize transition-colors ${
              tab === value
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-foreground/20'
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {destructiveConfirmDialog}

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {tab === 'overview' ? (
        overview ? (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Users"
                value={String(overview.users.total)}
                sub={`+${overview.users.last7} in 7d · +${overview.users.last30} in 30d`}
              />
              <StatCard
                label="Feedback"
                value={String(overview.feedback.total)}
                sub={`${overview.feedback.last7} in the last 7 days`}
              />
              <StatCard
                label="Beta applications"
                value={String(overview.beta.pending)}
                sub={`pending · ${overview.beta.approved} approved · ${overview.beta.rejected} rejected`}
              />
              <StatCard
                label="Subscriptions"
                value={String(overview.subscriptions.byTier.reduce((n, r) => n + r.count, 0))}
                sub={
                  overview.subscriptions.byTier
                    .slice(0, 3)
                    .map((r) => `${r.tier}/${r.status}: ${r.count}`)
                    .join(' · ') || 'none'
                }
              />
            </div>
            <GrowthChart points={overview.growth} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )
      ) : null}

      {tab === 'feedback' ? (
        feedback ? (
          feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {feedback.map((row) => (
                <li key={row.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{row.subject || 'No subject'}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.email ?? row.userId ?? 'signed out'}
                  </p>
                  {row.pagePath ? (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{row.pagePath}</p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm">{row.message}</p>
                  {row.screenshotKey ? (
                    <a
                      href={`/api/operator?view=feedback-screenshot&key=${encodeURIComponent(row.screenshotKey)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block max-w-md overflow-hidden rounded-lg border border-border"
                    >
                      <img
                        src={`/api/operator?view=feedback-screenshot&key=${encodeURIComponent(row.screenshotKey)}`}
                        alt="Screenshot attached to this feedback"
                        className="block w-full"
                      />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )
      ) : null}

      {tab === 'waitlist' ? <UpgradeAccessPanel /> : null}

      {tab === 'waitlist' ? <WaitlistPanel /> : null}

      {tab === 'product' ? <ProductMetricsPanel /> : null}

      {tab === 'costs' ? <OperatorCostsPanel /> : null}

      {tab === 'routing' ? <RoutingHealthPanel /> : null}

      {tab === 'rollout' ? <ModelRolloutPanel /> : null}

      {tab === 'quota' ? <FreeQuotaAttestationPanel /> : null}

      {tab === 'flags' ? <FeatureFlagsPanel /> : null}

      {tab === 'services' ? <ServiceHealthPanel /> : null}

      {tab === 'dashboards' ? <ServiceDashboardsPanel /> : null}

      {tab === 'routes' ? <RouteEconomicsPanel /> : null}

      {tab === 'economics' ? <EconomicsSummaryPanel /> : null}

      {tab === 'content' ? <CopyrightNoticeQueuePanel /> : null}

      {tab === 'content' ? <ContentTakedownPanel /> : null}

      {tab === 'privacy' ? <PrivacyRequestsPanel /> : null}

      {tab === 'support' ? <SupportHandoffQueuePanel /> : null}

      {tab === 'support' ? <SupportTicketQueuePanel /> : null}

      {tab === 'jobs' ? <BackgroundJobsPanel /> : null}

      {tab === 'users' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Clear usage for everyone</p>
            <p className="text-xs text-muted-foreground">
              Goodwill reset after an incident. Type the confirmation, then review the exact blast
              radius before anything changes. Allocation is untouched; only consumption is cleared.
            </p>
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void resetEveryone();
            }}
          >
            <label htmlFor="operator-bulk-reset-confirmation" className="sr-only">
              Type {BULK_RESET_CONFIRMATION} to continue
            </label>
            <input
              id="operator-bulk-reset-confirmation"
              value={bulkConfirmation}
              onChange={(event) => setBulkConfirmation(event.target.value)}
              placeholder={BULK_RESET_CONFIRMATION}
              autoComplete="off"
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
            />
            <button
              type="submit"
              disabled={bulkBusy || bulkConfirmation.trim() !== BULK_RESET_CONFIRMATION}
              className="rounded-full border border-destructive/50 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              {bulkBusy ? 'Working…' : 'Reset all usage'}
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'users' && grantTarget ? (
        <form
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void grantCredits(grantTarget);
          }}
        >
          <p className="text-sm font-medium">
            Grant goodwill credits to {grantTarget.email ?? grantTarget.id}
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Amount in credits
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={grantAmount}
                onChange={(event) => setGrantAmount(event.target.value)}
                className="w-40 rounded-compact border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Reason, recorded on the grant
              <input
                value={grantReason}
                onChange={(event) => setGrantReason(event.target.value)}
                maxLength={280}
                className="rounded-compact border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busyUserId === grantTarget.id || !grantAmount.trim() || !grantReason.trim()}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium transition-colors hover:border-foreground/30 disabled:opacity-50"
            >
              {busyUserId === grantTarget.id ? 'Granting…' : 'Grant credit'}
            </button>
            <button
              type="button"
              onClick={() => setGrantTarget(null)}
              disabled={busyUserId === grantTarget.id}
              className="rounded-full px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {tab === 'users' ? (
        users ? (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-card text-start">
                <tr>
                  <th className="p-3 font-medium">Account</th>
                  <th className="p-3 font-medium">Plan</th>
                  <th className="p-3 font-medium">Usage</th>
                  <th className="p-3 font-medium">Joined</th>
                  <th className="p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-border">
                    <td className="p-3">
                      <div>{user.email ?? NOT_RECORDED}</div>
                      <div className="text-xs text-muted-foreground">
                        {user.displayName ?? user.id}
                      </div>
                    </td>
                    <td className="p-3">
                      {user.planTier ?? 'free'}
                      {user.status ? (
                        <span className="text-xs text-muted-foreground"> · {user.status}</span>
                      ) : null}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatCreditAmount(user.creditsUsed)} /{' '}
                      {formatCreditAmount(user.creditsAllocated)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatDateTime(user.createdAt)}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => void resetUsage(user)}
                        disabled={busyUserId === user.id}
                        className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50"
                      >
                        {busyUserId === user.id ? 'Resetting…' : 'Reset usage'}
                      </button>
                      <button
                        onClick={() => openGrant(user)}
                        disabled={busyUserId === user.id}
                        className="ms-2 rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50"
                      >
                        Grant credit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )
      ) : null}
    </div>
  );
}
