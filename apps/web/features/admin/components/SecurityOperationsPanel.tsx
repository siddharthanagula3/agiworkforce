'use client';

import { useSession } from '@/lib/identity/client';
import { AlertTriangle, RefreshCw, ShieldAlert, UserRoundCog } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useConfirm } from '@agiworkforce/ui';
import {
  fetchAdminSecurityOperations,
  performAdminAccountAction,
  type AdminAccountAction,
  type AdminSecurityDashboard,
  type AdminSecurityEvent,
} from '../services/admin-security-client';
import { toUserMessage } from '@/lib/user-error-message';

const ACTION_LABELS: Record<AdminAccountAction, string> = {
  'suspend-user': 'Suspend account',
  'ban-user': 'Ban account',
  'reactivate-user': 'Reactivate account',
};

const ACTION_CONSEQUENCE: Partial<Record<AdminAccountAction, string>> = {
  'suspend-user':
    'They are signed out everywhere and locked out until an operator reactivates the account. Their data is kept.',
  'ban-user':
    'They are signed out everywhere and permanently locked out. Their data is kept, but this is not part of the normal support flow.',
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function severityClass(severity: AdminSecurityEvent['severity']): string {
  if (severity === 'critical')
    return 'border-red-600/40 bg-red-500/10 text-red-800 dark:border-red-400/30 dark:text-red-100';
  if (severity === 'high')
    return 'border-amber-600/40 bg-amber-500/10 text-amber-800 dark:border-amber-400/30 dark:text-amber-100';
  return 'border-border bg-muted text-foreground';
}

export default function SecurityOperationsPanel() {
  const { getToken } = useSession();
  const [dashboard, setDashboard] = useState<AdminSecurityDashboard | null>(null);
  const [events, setEvents] = useState<AdminSecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<AdminAccountAction>('suspend-user');
  const [targetUserId, setTargetUserId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirm();

  const loadOperations = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Admin session token is unavailable');
      const data = await fetchAdminSecurityOperations(token);
      setDashboard(data.dashboard);
      setEvents(data.events);
    } catch (error) {
      setLoadError(toUserMessage(error, 'Unable to load security operations'));
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);

  async function submitAccountAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUserId = targetUserId.trim();
    const normalizedReason = reason.trim();
    if (!normalizedUserId || !normalizedReason || submitting) return;

    const consequence = ACTION_CONSEQUENCE[action];
    if (consequence) {
      const confirmed = await confirmDestructive({
        title: `${ACTION_LABELS[action]} for ${normalizedUserId}?`,
        description: consequence,
        confirmText: ACTION_LABELS[action],
        variant: 'destructive',
      });
      if (!confirmed) return;
    }

    setSubmitting(true);
    setActionResult(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Admin session token is unavailable');
      const result = await performAdminAccountAction(
        token,
        action,
        normalizedUserId,
        normalizedReason,
      );
      setActionResult(result.message);
      setTargetUserId('');
      setReason('');
      await loadOperations();
    } catch (error) {
      setActionResult(toUserMessage(error, 'Account action failed'));
    } finally {
      setSubmitting(false);
    }
  }

  const triggeredAlerts = dashboard?.alerts.filter((alert) => alert.triggered) ?? [];

  return (
    <section className="space-y-4" aria-labelledby="security-operations-title">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase text-sky-700 dark:text-sky-300">
            Live administration
          </p>
          <h2 id="security-operations-title" className="mt-1 text-xl font-medium text-foreground">
            Security operations
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Authenticated metrics, alerts, event history, and audited account controls.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOperations()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-600/40 bg-red-500/10 p-3 text-sm text-red-800 dark:border-red-400/30 dark:text-red-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {loadError}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={loading}>
        {[
          ['Events · 24h', dashboard?.metrics.total_events_24h],
          ['Critical · 24h', dashboard?.metrics.critical_events_24h],
          ['Unique users · 24h', dashboard?.metrics.unique_users_24h],
          ['Unique IPs · 24h', dashboard?.metrics.unique_ips_24h],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-border bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-2xl text-foreground">
              {loading ? '…' : (value ?? 0)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-sky-700 dark:text-sky-300" aria-hidden="true" />
              <h3 className="text-sm font-medium text-foreground">Recent security events</h3>
            </div>
            <span className="text-xs text-muted-foreground">Latest 25</span>
          </div>
          <div className="max-h-[430px] overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Endpoint</th>
                </tr>
              </thead>
              <tbody>
                {events.map((securityEvent) => (
                  <tr key={securityEvent.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatTimestamp(securityEvent.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md border px-2 py-1 text-xs ${severityClass(securityEvent.severity)}`}
                      >
                        {securityEvent.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{securityEvent.event_type}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {securityEvent.user_id ?? 'anonymous'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {securityEvent.endpoint ?? ', '}
                    </td>
                  </tr>
                ))}
                {!loading && events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No security events found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-4">
            <h3 className="text-sm font-medium text-foreground">Active alerts</h3>
            <div className="mt-3 space-y-2">
              {triggeredAlerts.map((alert) => (
                <div
                  key={alert.alert_name}
                  className="rounded-md border border-red-600/40 bg-red-500/10 p-3 dark:border-red-400/20"
                >
                  <p className="text-sm text-red-800 dark:text-red-100">{alert.alert_name}</p>
                  <p className="mt-1 text-xs text-red-900/80 dark:text-red-200/70">
                    {alert.current_count} / {alert.threshold} in {alert.window_minutes} minutes
                  </p>
                </div>
              ))}
              {!loading && triggeredAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No alert threshold is currently triggered.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <h3 className="text-sm font-medium text-foreground">Top source IPs · 24h</h3>
            <ol className="mt-3 space-y-2">
              {(dashboard?.top_ips ?? []).map((item) => (
                <li key={item.ip_address} className="flex justify-between gap-3 text-sm">
                  <span className="font-mono text-foreground">{item.ip_address}</span>
                  <span className="text-muted-foreground">{item.event_count} events</span>
                </li>
              ))}
              {!loading && (dashboard?.top_ips.length ?? 0) === 0 ? (
                <li className="text-sm text-muted-foreground">No source IP data in this window.</li>
              ) : null}
            </ol>
          </div>
        </div>
      </div>

      <form
        onSubmit={(event) => void submitAccountAction(event)}
        className="rounded-md border border-border bg-card p-4"
      >
        <div className="flex items-center gap-2">
          <UserRoundCog className="h-4 w-4 text-sky-700 dark:text-sky-300" aria-hidden="true" />
          <h3 className="text-sm font-medium text-foreground">Account control</h3>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Every action is authenticated, CSRF-protected, and written to the security audit log. Your
          own account cannot be modified here.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[190px_minmax(220px,1fr)_minmax(280px,2fr)_auto]">
          <label className="space-y-1 text-xs text-muted-foreground">
            Action
            <select
              value={action}
              onChange={(event) => setAction(event.target.value as AdminAccountAction)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Target user ID
            <input
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              required
              maxLength={255}
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="user_…"
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Audit reason
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={1000}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="Required operational reason"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !targetUserId.trim() || !reason.trim()}
            className={
              action === 'ban-user'
                ? 'self-end rounded-md border border-red-600/40 bg-red-500/10 px-4 py-2 text-sm text-red-800 hover:bg-red-500/20 dark:border-red-400/30 dark:text-red-100 disabled:cursor-not-allowed disabled:opacity-50'
                : 'self-end rounded-md border border-sky-600/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-800 hover:bg-sky-500/20 dark:border-sky-400/30 dark:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50'
            }
          >
            {submitting ? 'Applying…' : ACTION_LABELS[action]}
          </button>
        </div>
        <p className="mt-3 text-sm text-foreground" aria-live="polite">
          {actionResult}
        </p>
      </form>
      {destructiveConfirmDialog}
    </section>
  );
}
