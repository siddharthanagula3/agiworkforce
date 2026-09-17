'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { toUserMessage } from '@/lib/user-error-message';
import {
  MAX_TICKET_MESSAGE_CHARS,
  MAX_TICKET_SUBJECT_CHARS,
  type SupportTicket,
  type TicketStatus,
} from '@/lib/support/tickets/types';
import {
  listSupportTickets,
  moveSupportTicket,
  openSupportTicket,
  readSupportTicket,
  replyToSupportTicket,
  type SupportTicketThread,
} from '../lib/ticket-client';

const CARD_CLASS = 'rounded-[var(--radius-lg)] border border-border bg-background p-3';
const FIELD_CLASS =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:opacity-60';
const PRIMARY_BUTTON_CLASS =
  'inline-flex min-h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50';
const GHOST_BUTTON_CLASS =
  'inline-flex min-h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50';

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_MEANING: Record<TicketStatus, string> = {
  open: 'Raised and waiting to be picked up.',
  in_progress: 'Someone on the support team is working on it.',
  resolved: 'Answered. Replying here reopens it if it is not actually fixed.',
  closed: 'Finished. Raise a new ticket and reference this one to carry on.',
};

const STATUS_CLASS: Record<TicketStatus, string> = {
  open: 'text-info-text',
  in_progress: 'text-info-text',
  resolved: 'text-success-text',
  closed: 'text-muted-foreground',
};

const CLOSE_CONFIRM_TITLE = 'Close this ticket?';
const CLOSE_CONFIRM_LABEL = 'Close ticket';
const CLOSE_CONFIRM_DESCRIPTION =
  'A closed ticket cannot be reopened and no further replies can be added to it. The thread stays readable, and carrying on means raising a new ticket that references this one.';

function formatDateTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusChip({ status }: { status: TicketStatus }) {
  return (
    <span className={`text-xs font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
  );
}

function NewTicketForm({
  onCreated,
  onCancel,
}: {
  onCreated: (ticket: SupportTicket) => void;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!subject.trim() || !message.trim()) {
      setError('A ticket needs a subject and a description of what happened.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await openSupportTicket({ subject: subject.trim(), message: message.trim() }));
      setSubject('');
      setMessage('');
    } catch (submitError) {
      setError(toUserMessage(submitError, 'That ticket was not raised.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={`${CARD_CLASS} flex flex-col gap-2`} onSubmit={submit}>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-foreground">Subject</span>
        <input
          className={FIELD_CLASS}
          value={subject}
          maxLength={MAX_TICKET_SUBJECT_CHARS}
          disabled={submitting}
          onChange={(event) => setSubject(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-foreground">What happened</span>
        <textarea
          className={`${FIELD_CLASS} resize-y`}
          rows={4}
          value={message}
          maxLength={MAX_TICKET_MESSAGE_CHARS}
          disabled={submitting}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Your build, platform and the last few errors this browser recorded are attached
        automatically. Nothing you were working on is sent.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={submitting}>
          {submitting ? 'Raising…' : 'Raise ticket'}
        </button>
        <button
          type="button"
          className={GHOST_BUTTON_CLASS}
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function TicketThreadView({
  thread,
  onBack,
  onThread,
  onTicket,
}: {
  thread: SupportTicketThread;
  onBack: () => void;
  onThread: (next: SupportTicketThread) => void;
  onTicket: (next: SupportTicket) => void;
}) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmAction();

  const { ticket, replies } = thread;
  const canReply = ticket.status !== 'closed';

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onThread(await replyToSupportTicket(ticket.id, reply.trim()));
      setReply('');
    } catch (replyError) {
      setError(toUserMessage(replyError, 'That reply was not added.'));
    } finally {
      setBusy(false);
    }
  };

  const close = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      onTicket(await moveSupportTicket(ticket.id, 'closed'));
    } catch (closeError) {
      setError(toUserMessage(closeError, 'That ticket did not change.'));
    } finally {
      setBusy(false);
    }
  }, [onTicket, ticket.id]);

  return (
    <div className="flex flex-col gap-3">
      <button type="button" className={`${GHOST_BUTTON_CLASS} self-start`} onClick={onBack}>
        Back to your tickets
      </button>

      <div className={CARD_CLASS}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">{ticket.subject}</h3>
          <StatusChip status={ticket.status} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{STATUS_MEANING[ticket.status]}</p>
        <p className="mt-2 whitespace-pre-wrap text-[13px] text-foreground">{ticket.message}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Raised {formatDateTime(ticket.createdAt)} · priority {ticket.priority}
        </p>
      </div>

      {replies.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No replies yet. You will get an email when the team answers.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {replies.map((entry) => (
            <li key={entry.id} className={CARD_CLASS}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  {entry.isStaff ? 'Support' : 'You'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(entry.createdAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-foreground">
                {entry.message}
              </p>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      ) : null}

      {canReply ? (
        <form className="flex flex-col gap-2" onSubmit={sendReply}>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground">Reply</span>
            <textarea
              className={`${FIELD_CLASS} resize-y`}
              rows={3}
              value={reply}
              maxLength={MAX_TICKET_MESSAGE_CHARS}
              disabled={busy}
              onChange={(event) => setReply(event.target.value)}
            />
          </label>
          {ticket.status === 'resolved' ? (
            <p className="text-xs text-muted-foreground">
              This ticket is marked resolved. Replying puts it back in the queue.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className={PRIMARY_BUTTON_CLASS}
              disabled={busy || reply.trim().length === 0}
            >
              {busy ? 'Sending…' : 'Send reply'}
            </button>
            <button
              type="button"
              className={GHOST_BUTTON_CLASS}
              disabled={busy}
              onClick={() =>
                confirm({
                  title: CLOSE_CONFIRM_TITLE,
                  description: CLOSE_CONFIRM_DESCRIPTION,
                  confirmLabel: CLOSE_CONFIRM_LABEL,
                  onConfirm: close,
                })
              }
            >
              Close ticket
            </button>
          </div>
        </form>
      ) : null}
      {dialog}
    </div>
  );
}

export function SupportTicketsPanel() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [thread, setThread] = useState<SupportTicketThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(await listSupportTickets());
    } catch (loadError) {
      setTickets(null);
      setError(toUserMessage(loadError, 'Your tickets could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(async (ticketId: string) => {
    setOpening(true);
    setError(null);
    try {
      setThread(await readSupportTicket(ticketId));
    } catch (openError) {
      setError(toUserMessage(openError, 'That ticket could not be opened.'));
    } finally {
      setOpening(false);
    }
  }, []);

  const applyTicket = useCallback((ticket: SupportTicket) => {
    setThread((current) => (current ? { ...current, ticket } : current));
    setTickets((current) =>
      current ? current.map((entry) => (entry.id === ticket.id ? ticket : entry)) : current,
    );
  }, []);

  const applyThread = useCallback(
    (next: SupportTicketThread) => {
      setThread(next);
      applyTicket(next.ticket);
    },
    [applyTicket],
  );

  return (
    <section className="flex flex-col gap-3" aria-labelledby="support-tickets-title">
      <div>
        <h2 id="support-tickets-title" className="text-sm font-medium text-foreground">
          Your support tickets
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Everything you have raised with the support team, and the thread on each one. A ticket
          marked resolved reopens if you reply to it.
        </p>
      </div>

      {error ? (
        <div role="alert" className={CARD_CLASS}>
          <p className="text-xs text-danger-text">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 inline-flex min-h-6 items-center text-xs font-medium underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {thread ? (
        <TicketThreadView
          thread={thread}
          onBack={() => setThread(null)}
          onThread={applyThread}
          onTicket={applyTicket}
        />
      ) : loading || opening ? (
        <div className={`${CARD_CLASS} flex items-center gap-2`}>
          <Spinner size="sm" aria-label="Reading your tickets" />
          <span className="text-xs text-muted-foreground">
            {opening ? 'Opening that ticket…' : 'Reading your tickets…'}
          </span>
        </div>
      ) : composing ? (
        <NewTicketForm
          onCancel={() => setComposing(false)}
          onCreated={(ticket) => {
            setComposing(false);
            setTickets((current) => [ticket, ...(current ?? [])]);
            void open(ticket.id);
          }}
        />
      ) : (
        <>
          {tickets !== null && tickets.length === 0 ? (
            <p className={`${CARD_CLASS} text-xs text-muted-foreground`}>
              You have not raised a ticket yet. When you do, it and every reply on it appear here.
            </p>
          ) : null}

          {tickets !== null && tickets.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => void open(ticket.id)}
                    className={`${CARD_CLASS} w-full text-left transition-colors hover:bg-muted`}
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium text-foreground">
                        {ticket.subject}
                      </span>
                      <StatusChip status={ticket.status} />
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Updated {formatDateTime(ticket.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            className={`${PRIMARY_BUTTON_CLASS} self-start`}
            onClick={() => setComposing(true)}
          >
            Raise a ticket
          </button>
        </>
      )}
    </section>
  );
}
