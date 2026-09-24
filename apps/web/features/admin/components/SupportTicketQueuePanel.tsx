'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { describeDiagnostics } from '@/lib/support/diagnostics/types';
import {
  MAX_TICKET_MESSAGE_CHARS,
  OPEN_TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  severityForPriority,
  type StaffSupportTicket,
  type StaffTicketPage,
  type StaffTicketThread,
} from '@/lib/support/tickets/types';
import { formatDateTime } from '../lib/operator-format';

const QUEUE_ENDPOINT = '/api/support/staff/tickets';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const ACTION_CLASS =
  'rounded-full border border-border px-4 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50';

const QUEUE_UNREADABLE = 'The ticket queue could not be loaded.';
const REPLY_SAVED_UNSHOWN =
  'The reply was saved, but the ticket could not be shown again. Go back to the queue and open it.';
const REPLY_SAVED_NOTICE =
  'Reply saved on the ticket. The customer reads it in Settings, Help; it is not emailed to them.';

async function requestJson(path: string, init: RequestInit, fallback: string): Promise<unknown> {
  const response = await fetch(path, { ...init, cache: 'no-store' });
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: unknown };
  } | null;
  if (!response.ok) {
    const message = body?.error?.message;
    throw new Error(typeof message === 'string' && message.trim() ? message : fallback);
  }
  if (body === null) throw new Error(fallback);
  return body;
}

function asPage(body: unknown, fallback: string): StaffTicketPage {
  const page = body as Partial<StaffTicketPage>;
  if (!Array.isArray(page.tickets)) throw new Error(fallback);
  return {
    tickets: page.tickets,
    nextOffset: typeof page.nextOffset === 'number' ? page.nextOffset : null,
  };
}

function asThread(body: unknown, fallback: string): StaffTicketThread {
  const thread = body as Partial<StaffTicketThread>;
  if (!thread.ticket || typeof thread.ticket !== 'object' || !Array.isArray(thread.replies)) {
    throw new Error(fallback);
  }
  return { ticket: thread.ticket, replies: thread.replies };
}

function ticketPath(ticketId: string): string {
  return `${QUEUE_ENDPOINT}/${encodeURIComponent(ticketId)}`;
}

function describePriority(ticket: StaffSupportTicket): string {
  const severity = severityForPriority(ticket.priority).toUpperCase();
  return ticket.supportTier
    ? `${ticket.priority} (${severity}, ${ticket.supportTier})`
    : `${ticket.priority} (${severity})`;
}

function StaffTicketThreadView({
  thread,
  onBack,
  onThread,
}: {
  thread: StaffTicketThread;
  onBack: () => void;
  onThread: (next: StaffTicketThread) => void;
}) {
  const [reply, setReply] = useState('');
  const [resolve, setResolve] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { ticket, replies } = thread;
  const canReply = OPEN_TICKET_STATUSES.includes(ticket.status);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = reply.trim();
    if (sending || body.length === 0) return;
    setSending(true);
    setError(null);
    setSaved(false);
    try {
      const next = await requestJson(
        ticketPath(ticket.id),
        {
          method: 'POST',
          headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ reply: body, resolve }),
        },
        'That reply was not saved.',
      );
      setReply('');
      setResolve(false);
      onThread(asThread(next, REPLY_SAVED_UNSHOWN));
      setSaved(true);
    } catch (replyError) {
      setError(toUserMessage(replyError, 'That reply was not saved.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button type="button" className={`${ACTION_CLASS} self-start`} onClick={onBack}>
        Back to the queue
      </button>

      <div className={CARD_CLASS}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">{ticket.subject}</h3>
          <span className="text-xs font-medium">{TICKET_STATUS_LABEL[ticket.status]}</span>
        </div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <dt>Priority</dt>
          <dd>{describePriority(ticket)}</dd>
          <dt>Raised</dt>
          <dd>{formatDateTime(ticket.createdAt)}</dd>
          <dt>Account</dt>
          <dd className="break-all font-mono">{ticket.userId}</dd>
          <dt>Contact</dt>
          <dd className="break-all">{ticket.email}</dd>
        </dl>
        <p className="mt-3 whitespace-pre-wrap text-sm">{ticket.message}</p>
        {ticket.diagnostics ? (
          <details className="mt-3">
            <summary className="min-h-6 cursor-pointer text-xs font-medium">
              Diagnostics attached to the ticket
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs">
              {describeDiagnostics(ticket.diagnostics)}
            </pre>
          </details>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            No diagnostics were attached to this ticket.
          </p>
        )}
      </div>

      {replies.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody has replied on this ticket yet.</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Replies">
          {replies.map((entry) => (
            <li key={entry.id} className={CARD_CLASS}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium">
                  {entry.isStaff ? 'Support' : 'Customer'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(entry.createdAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{entry.message}</p>
            </li>
          ))}
        </ol>
      )}

      {saved ? (
        <p role="status" className="text-xs text-muted-foreground">
          {REPLY_SAVED_NOTICE}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      ) : null}

      {canReply ? (
        <form className="flex flex-col gap-2" onSubmit={submit}>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Reply to the customer</span>
            <textarea
              className={FIELD_CLASS}
              rows={4}
              value={reply}
              maxLength={MAX_TICKET_MESSAGE_CHARS}
              disabled={sending}
              onChange={(event) => setReply(event.target.value)}
            />
          </label>
          <label className="flex min-h-6 items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={resolve}
              disabled={sending}
              onChange={(event) => setResolve(event.target.checked)}
            />
            Mark resolved: this reply answers the ticket
          </label>
          <button
            type="submit"
            className={`${ACTION_CLASS} self-start`}
            disabled={sending || reply.trim().length === 0}
          >
            {sending ? 'Sending…' : 'Send reply'}
          </button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          This ticket is closed, so it takes no more replies.
        </p>
      )}
    </div>
  );
}

export default function SupportTicketQueuePanel() {
  const [tickets, setTickets] = useState<StaffSupportTicket[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [thread, setThread] = useState<StaffTicketThread | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (offset: number) => {
    setError(null);
    const page = asPage(
      await requestJson(
        `${QUEUE_ENDPOINT}?offset=${offset}`,
        { method: 'GET', headers: { Accept: 'application/json' } },
        QUEUE_UNREADABLE,
      ),
      QUEUE_UNREADABLE,
    );
    setTickets((current) =>
      offset === 0 || current === null ? page.tickets : [...current, ...page.tickets],
    );
    setNextOffset(page.nextOffset);
  }, []);

  const reload = useCallback(async () => {
    setTickets(null);
    try {
      await loadPage(0);
    } catch (loadError) {
      setError(toUserMessage(loadError, QUEUE_UNREADABLE));
    }
  }, [loadPage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(nextOffset);
    } catch (loadError) {
      setError(toUserMessage(loadError, 'The next tickets could not be loaded.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const openTicket = async (ticketId: string) => {
    setOpening(true);
    setError(null);
    try {
      const next = await requestJson(
        ticketPath(ticketId),
        { method: 'GET', headers: { Accept: 'application/json' } },
        'That ticket could not be opened.',
      );
      setThread(asThread(next, 'That ticket could not be opened.'));
    } catch (openError) {
      setError(toUserMessage(openError, 'That ticket could not be opened.'));
    } finally {
      setOpening(false);
    }
  };

  const applyThread = (next: StaffTicketThread) => {
    setThread(next);
    setTickets((current) =>
      current
        ? current.map((entry) => (entry.id === next.ticket.id ? next.ticket : entry))
        : current,
    );
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="support-ticket-queue-title">
      <div>
        <h2 id="support-ticket-queue-title" className="text-sm font-medium">
          Support tickets
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tickets customers raised in Settings, Help that are open or in progress, newest first. A
          reply here appears on the customer&apos;s ticket straight away. It is not emailed to them,
          so write to the contact address on the ticket when it cannot wait.
        </p>
      </div>

      {error ? (
        <div role="alert" className={CARD_CLASS}>
          <p className="text-sm text-danger-text">{error}</p>
          <button type="button" className={`${ACTION_CLASS} mt-3`} onClick={() => void reload()}>
            Try again
          </button>
        </div>
      ) : null}

      {thread ? (
        <StaffTicketThreadView
          thread={thread}
          onBack={() => setThread(null)}
          onThread={applyThread}
        />
      ) : opening || (tickets === null && !error) ? (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">
            {opening ? 'Opening that ticket…' : 'Reading the ticket queue…'}
          </span>
        </div>
      ) : tickets !== null && tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ticket is waiting. A ticket appears here when a customer raises one in Settings, Help,
          and leaves the queue once it is resolved or closed.
        </p>
      ) : tickets !== null ? (
        <>
          <ul className="flex flex-col gap-2">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => void openTicket(ticket.id)}
                  className={`${CARD_CLASS} w-full text-left transition-colors hover:bg-muted`}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{ticket.subject}</span>
                    <span className="text-xs font-medium">
                      {TICKET_STATUS_LABEL[ticket.status]}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {describePriority(ticket)} · raised {formatDateTime(ticket.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {nextOffset !== null ? (
            <button
              type="button"
              className={`${ACTION_CLASS} self-start`}
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Loading…' : 'Show older tickets'}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
