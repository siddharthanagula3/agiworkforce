'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import {
  describeDiagnostics,
  MAX_TICKET_MESSAGE_CHARS,
  OPEN_TICKET_STATUSES,
  RECOVERY_TICKET_SUBJECT,
  TICKET_STATUS_LABEL,
  severityForPriority,
  type StaffSupportTicket,
  type StaffTicketPage,
  type StaffTicketThread,
  SUPPORT_STAFF_TICKETS_PATH,
  supportStaffTicketPath,
  supportStaffTicketRecoveryPath,
} from '@agiworkforce/cloud-contracts/support';
import { formatDateTime } from '../lib/operator-format';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const ACTION_CLASS =
  'rounded-full border border-border px-4 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50';

const QUEUE_UNREADABLE = 'The ticket queue could not be loaded.';
const REPLY_SAVED_UNSHOWN =
  'The reply was saved, but the ticket could not be shown again. Go back to the queue and open it.';
const REPLY_SAVED_NOTICE =
  'Reply saved on the ticket and emailed to the contact address. Signed in, the customer also reads it in Settings, Help.';

function RecoveryActions({ ticketId }: { ticketId: string }) {
  const { confirm, dialog } = useConfirmAction();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (body: {
    action: 'remove_second_factor' | 'replace_email';
    email?: string;
  }) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = (await requestJson(
        supportStaffTicketRecoveryPath(ticketId),
        {
          method: 'POST',
          headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
        },
        'Access was not restored.',
      )) as { sessionsEnded?: number };
      setDone(
        `Done. ${result.sessionsEnded ?? 0} signed-in session(s) were ended. Reply to tell the customer how to sign in.`,
      );
    } catch (recoveryError) {
      setError(toUserMessage(recoveryError, 'Access was not restored.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={CARD_CLASS}>
      {dialog}
      <h4 className="text-sm font-medium">Restore access</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Only after you have verified the requester owns this account. Each action ends every session
        signed in to it.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={ACTION_CLASS}
          disabled={busy}
          onClick={() =>
            confirm({
              title: 'Remove two-factor authentication?',
              description:
                'The account signs in with its password or email code alone until the owner sets two-factor up again. Every signed-in session ends.',
              confirmLabel: 'Remove two-factor',
              destructive: true,
              onConfirm: () => run({ action: 'remove_second_factor' }),
            })
          }
        >
          Remove two-factor
        </button>
        <input
          type="email"
          aria-label="New sign-in email"
          placeholder="New sign-in email"
          value={email}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
          className={`${FIELD_CLASS} max-w-xs`}
        />
        <button
          type="button"
          className={ACTION_CLASS}
          disabled={busy || !email.trim()}
          onClick={() =>
            confirm({
              title: `Make ${email.trim()} the sign-in email?`,
              description:
                'The account signs in with this address from now on and every signed-in session ends. The old address stays on the account until the owner removes it.',
              confirmLabel: 'Replace email',
              destructive: true,
              onConfirm: () => run({ action: 'replace_email', email: email.trim() }),
            })
          }
        >
          Replace sign-in email
        </button>
      </div>
      {done ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {done}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

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
        supportStaffTicketPath(ticket.id),
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
          <h3 className="text-h5">{ticket.subject}</h3>
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

      {ticket.subject === RECOVERY_TICKET_SUBJECT && canReply ? (
        <RecoveryActions ticketId={ticket.id} />
      ) : null}

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
        `${SUPPORT_STAFF_TICKETS_PATH}?offset=${offset}`,
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
        supportStaffTicketPath(ticketId),
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
        <h2 id="support-ticket-queue-title" className="text-h5">
          Support tickets
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tickets customers raised in Settings, Help that are open or in progress, newest first. A
          reply here appears on the customer&apos;s ticket straight away and is emailed to the
          contact address on the ticket.
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
                  className={`${CARD_CLASS} w-full text-start transition-colors hover:bg-muted`}
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
