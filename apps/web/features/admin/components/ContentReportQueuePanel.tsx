'use client';

import { useSession } from '@/lib/identity/client';
import { AlertTriangle, Flag, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  fetchContentReportQueue,
  reviewContentReport,
  type AdminContentReport,
  type AdminContentReportCounts,
  type ContentReportStatus,
} from '../services/content-report-queue-client';
import { toUserMessage } from '@/lib/user-error-message';

const OPEN_STATUSES: readonly ContentReportStatus[] = ['received', 'in_review'];
const RESOLVED_STATUSES: readonly ContentReportStatus[] = ['actioned', 'dismissed'];

const DISPOSITIONS: ReadonlyArray<{ status: ContentReportStatus; label: string }> = [
  { status: 'in_review', label: 'Claim' },
  { status: 'actioned', label: 'Actioned' },
  { status: 'dismissed', label: 'Dismissed' },
];

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function ContentReportQueuePanel() {
  const { getToken } = useSession();
  const [view, setView] = useState<'open' | 'resolved'>('open');
  const [reports, setReports] = useState<AdminContentReport[]>([]);
  const [counts, setCounts] = useState<AdminContentReportCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Admin session token is unavailable');
      const data = await fetchContentReportQueue(
        token,
        view === 'open' ? OPEN_STATUSES : RESOLVED_STATUSES,
      );
      setReports(data.reports);
      setCounts(data.counts);
    } catch (error) {
      setLoadError(toUserMessage(error, 'Unable to load content reports'));
    } finally {
      setLoading(false);
    }
  }, [getToken, view]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function applyDisposition(report: AdminContentReport, status: ContentReportStatus) {
    if (pendingId) return;
    const note = (notes[report.id] ?? '').trim();
    if (status !== 'in_review' && !note) {
      setActionResult('A reviewer note is required to action or dismiss a report.');
      return;
    }

    setPendingId(report.id);
    setActionResult(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Admin session token is unavailable');
      const updated = await reviewContentReport(token, report.id, status, note);
      setActionResult(`Report ${updated.clientReportId} marked ${updated.status}.`);
      setNotes((current) => ({ ...current, [report.id]: '' }));
      await loadQueue();
    } catch (error) {
      setActionResult(toUserMessage(error, 'Review failed'));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="content-report-queue-title">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase text-sky-700 dark:text-sky-300">
            Trust and safety
          </p>
          <h2 id="content-report-queue-title" className="mt-1 text-xl font-medium text-foreground">
            Content report queue
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reports flagged from web and mobile. Reviewed within {counts?.slaHours ?? 24} hours;
            resolving one writes an audited decision. To unpublish shared content, use the takedown
            control with the share link.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Queue view"
            value={view}
            onChange={(event) => setView(event.target.value as 'open' | 'resolved')}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {loadError}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={loading}>
        {[
          ['Awaiting review', counts?.received],
          ['In review', counts?.in_review],
          ['Past SLA', counts?.overdue],
          ['Actioned', counts?.actioned],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-border bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-2xl text-foreground">
              {loading ? '…' : (value ?? 0)}
            </p>
          </div>
        ))}
      </div>

      <ul className="space-y-3">
        {reports.map((report) => (
          <li
            key={report.id}
            data-testid="content-report-row"
            className="rounded-md border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Flag className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
              <span className="text-sm text-foreground">{report.category}</span>
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                {report.status}
              </span>
              {report.overdue ? (
                <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-700 dark:text-red-100">
                  Past SLA · due {formatTimestamp(report.dueAt)}
                </span>
              ) : null}
              <span className="ml-auto text-xs text-muted-foreground">
                {formatTimestamp(report.createdAt)}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground">
              {report.contentExcerpt || 'No excerpt was submitted with this report.'}
            </p>
            {report.userNote ? (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                Reporter note: {report.userNote}
              </p>
            ) : null}
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              conversation {report.conversationId} · message {report.messageId} · reporter{' '}
              {report.userId ?? 'anonymous'}
            </p>

            {report.reviewerNote ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Decision by {report.reviewerId ?? 'unknown'}: {report.reviewerNote}
              </p>
            ) : null}

            {report.status === 'actioned' || report.status === 'dismissed' ? null : (
              <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(240px,1fr)_auto]">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Reviewer decision note
                  <input
                    value={notes[report.id] ?? ''}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [report.id]: event.target.value }))
                    }
                    maxLength={2000}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                    placeholder="What you decided and why"
                  />
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  {DISPOSITIONS.filter(
                    (disposition) =>
                      disposition.status !== 'in_review' || report.status === 'received',
                  ).map((disposition) => (
                    <button
                      key={disposition.status}
                      type="button"
                      disabled={pendingId === report.id}
                      onClick={() => void applyDisposition(report, disposition.status)}
                      className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-700 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-100"
                    >
                      {disposition.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
        {!loading && reports.length === 0 ? (
          <li className="rounded-md border border-border bg-card px-4 py-8 text-center text-muted-foreground">
            {view === 'open' ? 'No content report is waiting for review.' : 'No resolved reports.'}
          </li>
        ) : null}
      </ul>

      <p className="text-sm text-foreground" aria-live="polite">
        {actionResult}
      </p>
    </section>
  );
}
