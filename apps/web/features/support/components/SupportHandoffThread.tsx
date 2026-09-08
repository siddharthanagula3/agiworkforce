'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SUPPORT_MAX_MESSAGE_LENGTH } from '../lib/support-client';
import type { SupportHandoffMessageView } from '../lib/contract';
import styles from './SupportWidget.module.css';

function turnClass(author: SupportHandoffMessageView['author']): string | undefined {
  if (author === 'user') return styles['userTurn'];
  if (author === 'agent') return styles['agentTurn'];
  return styles['systemTurn'];
}

export function SupportHandoffThread({
  messages,
  loading,
  loadError,
  sending,
  sendError,
  canSend,
  disabledReason,
  onSend,
  onDismissSendError,
}: {
  messages: SupportHandoffMessageView[];
  loading: boolean;
  loadError: string | null;
  sending: boolean;
  sendError: string | null;
  canSend: boolean;
  disabledReason: string;
  onSend: (body: string) => void;
  onDismissSendError: () => void;
}) {
  const [draft, setDraft] = useState('');
  const listEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend || sending) return;
    const body = draft.trim();
    if (body.length === 0) return;
    // The draft is kept until the send settles, so a failure leaves the words
    // in the box rather than asking the person to type them again.
    onSend(body);
    setDraft('');
  };

  return (
    <div data-support-handoff-thread="">
      <ol className={styles['handoffThread']} aria-label="Conversation with the support team">
        {messages.map((message) => (
          <li key={message.seq} className={turnClass(message.author)} data-author={message.author}>
            {message.body}
          </li>
        ))}
      </ol>

      {loading && messages.length === 0 ? (
        <p className={styles['cardBody']} role="status">
          Loading the conversation…
        </p>
      ) : null}

      {messages.length === 0 && !loading ? (
        <p className={styles['cardBody']}>Nothing has been said yet.</p>
      ) : null}

      {loadError ? (
        <p className={styles['errorText']} role="status">
          {loadError}
        </p>
      ) : null}

      <form className={styles['composer']} onSubmit={submit}>
        <label className="sr-only" htmlFor="support-handoff-message">
          Message the support team
        </label>
        <textarea
          id="support-handoff-message"
          className={styles['composerInput']}
          rows={2}
          value={draft}
          maxLength={SUPPORT_MAX_MESSAGE_LENGTH}
          disabled={!canSend || sending}
          placeholder={canSend ? 'Write a message' : disabledReason}
          onChange={(event) => {
            setDraft(event.target.value);
            if (sendError) onDismissSendError();
          }}
        />
        <button
          type="submit"
          className={styles['composerSubmit']}
          disabled={!canSend || sending || draft.trim().length === 0}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>

      {!canSend ? <p className={styles['cardBody']}>{disabledReason}</p> : null}

      {sendError ? (
        <p className={styles['errorText']} role="alert">
          {sendError}
        </p>
      ) : null}

      <div ref={listEnd} />
    </div>
  );
}
