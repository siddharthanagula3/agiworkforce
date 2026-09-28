'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Spinner } from '@agiworkforce/ui';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import { conversationHref } from '@shared/components/layout/sidebar-session-actions';
import { humanizeToolName } from '@/features/chat/components/messages/ToolTimeline';
import { toUserMessage } from '@/lib/user-error-message';
import { useApprovalHistory } from '../hooks/use-settings-queries';

const PAGE_SIZE = 20;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}

export function ApprovalHistoryPanel() {
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null]);
  const history = useApprovalHistory(PAGE_SIZE, cursors.at(-1) ?? null);
  const approvals = history.data?.approvals ?? [];
  const nextCursor = history.data?.hasMore ? (history.data.nextCursor ?? null) : null;
  const onFirstPage = cursors.length === 1;

  return (
    <section className="space-y-3" aria-labelledby="approval-history-heading">
      <div>
        <h3
          id="approval-history-heading"
          className="text-sm font-medium uppercase tracking-wider text-muted-foreground"
        >
          Approval history
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Tool requests you allowed or denied in chats, newest first.
        </p>
      </div>

      {history.isLoading ? (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Loading approval history
        </div>
      ) : history.isError ? (
        <div role="alert">
          <p className="text-sm text-foreground">Approval history could not load.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {toUserMessage(history.error, 'Try again in a moment.')}
          </p>
          <button
            type="button"
            onClick={() => void history.refetch()}
            className="mt-2 inline-flex min-h-6 items-center text-xs font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      ) : approvals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {onFirstPage ? 'No tool approvals yet.' : 'No older approvals.'}
        </p>
      ) : (
        <ul
          className="divide-y divide-border/50 rounded-lg border border-border/40"
          aria-label="Approval history entries"
        >
          {approvals.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  <span className="font-medium">
                    {entry.decision === 'approved'
                      ? TOOL_APPROVAL_ACTION_LABELS.allowed
                      : TOOL_APPROVAL_ACTION_LABELS.denied}
                  </span>{' '}
                  {humanizeToolName(entry.toolName)}
                </p>
                {entry.conversationId ? (
                  <Link
                    href={conversationHref(entry.conversationId)}
                    className="mt-0.5 inline-flex min-h-6 items-center text-xs text-primary hover:underline"
                  >
                    Open chat
                  </Link>
                ) : null}
              </div>
              <time
                dateTime={entry.createdAt}
                className="shrink-0 text-end text-xs text-muted-foreground"
              >
                {formatTimestamp(entry.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}

      {!onFirstPage || nextCursor ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setCursors((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack))}
            disabled={onFirstPage || history.isFetching}
            className="inline-flex min-h-6 items-center text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            Newer
          </button>
          <button
            type="button"
            onClick={() => {
              if (nextCursor) setCursors((stack) => [...stack, nextCursor]);
            }}
            disabled={!nextCursor || history.isFetching}
            className="inline-flex min-h-6 items-center text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            Older
          </button>
        </div>
      ) : null}
    </section>
  );
}
