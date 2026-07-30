'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import {
  useAuditLogActions,
  useAuditLogs,
  type AuditLogEntry,
} from '../hooks/use-settings-queries';

const PAGE_SIZE = 20;

function formatAction(action: string): string {
  return action
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function entryContext(entry: AuditLogEntry): string | null {
  if (entry.resourceType && entry.resourceId) {
    return `${entry.resourceType} · ${entry.resourceId}`;
  }
  return entry.resourceType ?? entry.resourceId ?? entry.ipAddress;
}

export function AuditLogPanel() {
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const logsQuery = useAuditLogs({
    action: action || undefined,
    limit: PAGE_SIZE,
    offset,
  });
  const actionsQuery = useAuditLogActions();

  const entries = logsQuery.data ?? [];
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <section
      aria-labelledby="security-audit-log-heading"
      className="overflow-hidden rounded-xl border border-border/60 bg-card/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div>
          <h2 id="security-audit-log-heading" className="text-sm font-semibold text-foreground">
            Security activity
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Recent sign-ins and security-sensitive changes for your account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="audit-action-filter">
            Filter security activity
          </label>
          <select
            id="audit-action-filter"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setOffset(0);
            }}
            disabled={actionsQuery.isLoading}
            className="h-8 max-w-48 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="">All activity</option>
            {(actionsQuery.data ?? []).map((value) => (
              <option key={value} value={value}>
                {formatAction(value)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void logsQuery.refetch()}
            disabled={logsQuery.isFetching}
            aria-label="Refresh security activity"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${logsQuery.isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {logsQuery.isLoading ? (
        <div role="status" className="px-5 py-8 text-sm text-muted-foreground">
          Loading security activity…
        </div>
      ) : logsQuery.isError ? (
        <div role="alert" className="px-5 py-8">
          <p className="text-sm font-medium text-foreground">Security activity could not load.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {logsQuery.error?.message ?? 'Try again in a moment.'}
          </p>
          <button
            type="button"
            onClick={() => void logsQuery.refetch()}
            className="mt-3 text-xs font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">
          {action ? 'No activity matches this filter.' : 'No security activity recorded yet.'}
        </div>
      ) : (
        <ul className="divide-y divide-border/50" aria-label="Security activity entries">
          {entries.map((entry) => {
            const context = entryContext(entry);
            return (
              <li key={entry.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {formatAction(entry.action)}
                  </p>
                  {context ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{context}</p>
                  ) : null}
                </div>
                <time
                  dateTime={entry.createdAt}
                  className="shrink-0 text-right text-xs text-muted-foreground"
                >
                  {formatTimestamp(entry.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
        <span className="text-xs text-muted-foreground">Page {page}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
            disabled={offset === 0 || logsQuery.isFetching}
            aria-label="Previous security activity page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
            disabled={entries.length < PAGE_SIZE || logsQuery.isFetching}
            aria-label="Next security activity page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
