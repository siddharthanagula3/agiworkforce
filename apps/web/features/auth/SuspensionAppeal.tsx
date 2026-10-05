'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';

import { Spinner } from '@agiworkforce/ui';

import { readSuspensionAppeal, submitSuspensionAppeal } from '@/features/support/lib/ticket-client';
import {
  MAX_TICKET_MESSAGE_CHARS,
  OPEN_TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  type SupportTicketThread,
} from '@agiworkforce/cloud-contracts/support';
import { toUserMessage } from '@/lib/user-error-message';

import {
  AUTH_ERROR_CLASS,
  AUTH_HINT_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from './authStyles';

const TEXTAREA_CLASS =
  'auth-field mt-2 w-full rounded-2xl border border-rule bg-transparent px-4 py-3 text-base text-text-primary placeholder:text-text-muted';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; appeal: SupportTicketThread | null };

function AppealThread({ appeal }: { appeal: SupportTicketThread }) {
  const { ticket, replies } = appeal;
  return (
    <section aria-label="Your appeal" className="mt-8 flex flex-col gap-3 text-sm">
      <p className="text-center text-text-muted">
        Reference {ticket.id} · {TICKET_STATUS_LABEL[ticket.status]}
      </p>
      <ol className="flex flex-col gap-3">
        <li className="rounded-2xl border border-rule px-4 py-3">
          <p className="font-medium text-text-primary">You</p>
          <p className="mt-1 whitespace-pre-wrap text-text-primary">{ticket.message}</p>
        </li>
        {replies.map((reply) => (
          <li key={reply.id} className="rounded-2xl border border-rule px-4 py-3">
            <p className="font-medium text-text-primary">{reply.isStaff ? 'Support' : 'You'}</p>
            <p className="mt-1 whitespace-pre-wrap text-text-primary">{reply.message}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SuspensionAppeal({ signedIn }: { signedIn: boolean }) {
  const emailId = useId();
  const messageId = useId();
  const [load, setLoad] = useState<LoadState>(
    signedIn ? { kind: 'loading' } : { kind: 'ready', appeal: null },
  );
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    readSuspensionAppeal()
      .then((appeal) => {
        if (!cancelled) setLoad({ kind: 'ready', appeal });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoad({
            kind: 'failed',
            message: toUserMessage(cause, 'Your appeal could not be loaded.'),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (load.kind === 'loading') {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner aria-label="Loading your appeal" />
      </div>
    );
  }

  if (load.kind === 'failed') {
    return (
      <p role="alert" className={AUTH_ERROR_CLASS}>
        {load.message}
      </p>
    );
  }

  if (received) {
    return (
      <p role="status" className={`${AUTH_HINT_CLASS} mt-8`}>
        If that address belongs to a suspended account, your appeal is recorded and a receipt with
        its reference is on its way there. Replies come to the same address.
      </p>
    );
  }

  const appeal = load.appeal;
  const appealOpen = appeal !== null && OPEN_TICKET_STATUSES.includes(appeal.ticket.status);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    if (!signedIn && !email.trim()) {
      setError('Enter the email address of the suspended account.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const next = await submitSuspensionAppeal(
        signedIn ? { message: trimmed } : { message: trimmed, email: email.trim() },
      );
      setMessage('');
      if (signedIn) setLoad({ kind: 'ready', appeal: next });
      else setReceived(true);
    } catch (cause) {
      setError(toUserMessage(cause, 'Your appeal was not sent.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {appeal ? <AppealThread appeal={appeal} /> : null}
      <form onSubmit={handleSubmit} noValidate className="mt-8">
        {signedIn ? null : (
          <div className="mb-6">
            <label htmlFor={emailId} className={AUTH_LABEL_CLASS}>
              Email address of the suspended account
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={sending}
              onChange={(event) => setEmail(event.target.value)}
              className={`${AUTH_INPUT_CLASS} mt-2`}
            />
          </div>
        )}
        <label htmlFor={messageId} className={AUTH_LABEL_CLASS}>
          {appealOpen ? 'Add to your appeal' : 'Why should the suspension be lifted?'}
        </label>
        <textarea
          id={messageId}
          rows={5}
          required
          maxLength={MAX_TICKET_MESSAGE_CHARS}
          value={message}
          disabled={sending}
          onChange={(event) => setMessage(event.target.value)}
          className={TEXTAREA_CLASS}
        />
        {error ? (
          <p role="alert" className={AUTH_ERROR_CLASS}>
            {error}
          </p>
        ) : (
          <p className={AUTH_HINT_CLASS}>A person reviews every appeal.</p>
        )}
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className={AUTH_PRIMARY_BUTTON_CLASS}
        >
          {sending ? <Spinner size="sm" aria-hidden="true" /> : null}
          {appealOpen ? 'Send' : 'Submit appeal'}
        </button>
      </form>
    </>
  );
}
