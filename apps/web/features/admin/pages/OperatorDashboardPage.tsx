'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  FeedbackRow,
  OperatorOverview,
  UserRow,
} from '@/features/admin/services/operator-metrics';
import { useConfirm } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import ContentTakedownPanel from '../components/ContentTakedownPanel';
import OperatorCostsPanel from '../components/OperatorCostsPanel';
import PrivacyRequestsPanel from '../components/PrivacyRequestsPanel';
import RoutingHealthPanel from '../components/RoutingHealthPanel';
import { formatCents, formatDateTime, NOT_RECORDED } from '../lib/operator-format';

const TABS = ['overview', 'feedback', 'users', 'costs', 'routing', 'content', 'privacy'] as const;

type Tab = (typeof TABS)[number];

const DATABASE_VIEWS: readonly Tab[] = ['overview', 'feedback', 'users'];

/**
 * A 30-day signup sparkline drawn from the series the API returns. Inline SVG
 * rather than a chart dependency: one polyline is the whole requirement, and a
 * charting library would be a bundle cost on a page one person opens.
 */
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
        <h2 className="text-sm font-medium">Signups, last 30 days</h2>
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
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<OperatorOverview | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  // The shared AlertDialog rather than window.confirm: these are the most
  // destructive controls in the product and they should not be gated by a
  // browser chrome dialog that carries no severity styling and is suppressible.
  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirm();

  const load = useCallback(async (view: Tab) => {
    // Cleared for every view, not only the ones that fetch here: a failure from
    // the last tab must not sit above a panel that owns its own error surface.
    setError(null);
    if (!DATABASE_VIEWS.includes(view)) return;
    try {
      const response = await fetch(`/api/operator?view=${view}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const body = await response.json();
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
    const response = await fetch('/api/operator', {
      method: 'POST',
      headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    const parsed = await response.json();
    if (!response.ok) throw new Error(parsed?.error?.message ?? `Failed (${response.status})`);
    return parsed;
  }

  /**
   * Fleet-wide reset is previewed first and then confirmed by typing the
   * phrase, because it rewrites billing state for every active account and
   * re-running it does not undo it. The preview is what makes the typed
   * confirmation meaningful, the operator sees the real number before
   * committing to it.
   */
  async function resetEveryone() {
    setBulkBusy(true);
    setNotice(null);
    setError(null);
    try {
      const preview = await operatorAction({ action: 'preview-reset-all' });
      const affected = Number(preview['affectedUsers'] ?? 0);
      const cleared = Number(preview['clearedCents'] ?? 0);
      if (affected === 0) {
        setNotice('No account has usage to clear right now.');
        return;
      }
      // Two gates on purpose: the styled dialog states the blast radius with
      // proper severity, and only then does the typed phrase confirm intent.
      const acknowledged = await confirmDestructive({
        title: 'Clear usage for every account?',
        description: `This clears ${formatCents(cleared)} of usage across ${affected} account(s) and cannot be undone. You will be asked to type a confirmation next.`,
        confirmText: 'Continue',
        variant: 'destructive',
      });
      if (!acknowledged) return;
      const typed = window.prompt('Type RESET ALL USAGE to confirm.');
      if (typed === null) return;
      const result = await operatorAction({ action: 'reset-all-usage', confirm: typed });
      setNotice(
        `Cleared ${formatCents(Number(result['clearedCents'] ?? 0))} across ` +
          `${Number(result['affectedUsers'] ?? 0)} account(s).`,
      );
      await load(tab);
    } catch (e) {
      setError(toUserMessage(e, 'Could not reset usage.'));
    } finally {
      setBulkBusy(false);
    }
  }

  async function grantCredits(user: UserRow) {
    const label = user.email ?? user.id;
    const raw = window.prompt(`Grant goodwill credit to ${label}. Amount in dollars:`, '10');
    if (raw === null) return;
    const dollars = Number(raw);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError('Enter a positive dollar amount.');
      return;
    }
    const reason = window.prompt('Reason (recorded on the grant):', '');
    if (reason === null) return;
    if (!reason.trim()) {
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
        amountCents: Math.round(dollars * 100),
        reason: reason.trim(),
      });
      setNotice(
        result['granted']
          ? `Granted ${formatCents(Math.round(dollars * 100))} to ${label}.`
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
    const confirmed = await confirmDestructive({
      title: `Reset usage for ${label}?`,
      description:
        'This clears consumed credits for the current period. Allocation is untouched, and the amount cleared is recorded against the account.',
      confirmText: 'Reset usage',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setBusyUserId(user.id);
    setNotice(null);
    try {
      const response = await fetch('/api/operator', {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'reset-usage', userId: user.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `Failed (${response.status})`);
      setNotice(
        body.reset
          ? `Cleared ${formatCents(body.clearedCents)} of usage for ${label}.`
          : `${label} has no active credit period, so there was nothing to reset.`,
      );
      await load('users');
    } catch (e) {
      setError(toUserMessage(e, 'Reset failed.'));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Operator dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Feedback, accounts, and growth, read straight from the database.
        </p>
      </div>

      <div role="tablist" aria-label="Dashboard views" className="flex gap-2">
        {TABS.map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
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
                  <p className="mt-2 whitespace-pre-wrap text-sm">{row.message}</p>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )
      ) : null}

      {tab === 'costs' ? <OperatorCostsPanel /> : null}

      {tab === 'routing' ? <RoutingHealthPanel /> : null}

      {tab === 'content' ? <ContentTakedownPanel /> : null}

      {tab === 'privacy' ? <PrivacyRequestsPanel /> : null}

      {tab === 'users' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Clear usage for everyone</p>
            <p className="text-xs text-muted-foreground">
              Goodwill reset after an incident. Shows the exact blast radius first, then asks you to
              type the confirmation. Allocation is untouched; only consumption is cleared.
            </p>
          </div>
          <button
            onClick={() => void resetEveryone()}
            disabled={bulkBusy}
            className="rounded-full border border-destructive/50 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {bulkBusy ? 'Working…' : 'Reset all usage'}
          </button>
        </div>
      ) : null}

      {tab === 'users' ? (
        users ? (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-card text-left">
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
                      {formatCents(user.creditsUsedCents)} /{' '}
                      {formatCents(user.creditsAllocatedCents)}
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
                        onClick={() => void grantCredits(user)}
                        disabled={busyUserId === user.id}
                        className="ml-2 rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50"
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
