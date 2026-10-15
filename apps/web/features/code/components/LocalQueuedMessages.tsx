'use client';

import { useState } from 'react';
import { LOCAL_CODE_COPY, type LocalQueuedMessage } from '../local-code';
import styles from '../CloudCodePage.module.css';

export interface LocalQueuedMessagesProps {
  queued: LocalQueuedMessage[];
  paused: boolean;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onSendNow: (id: string) => void;
}

function QueuedRow({
  item,
  onUpdate,
  onRemove,
  onSendNow,
}: {
  item: LocalQueuedMessage;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onSendNow: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  return (
    <li className={styles['notice']} data-testid="local-queued-message">
      {editing ? (
        <textarea
          className={styles['input']}
          value={draft}
          rows={2}
          aria-label={LOCAL_CODE_COPY.queuedMessage}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <span className={styles['hintText']}>{item.text}</span>
      )}
      <div className={styles['noticeActions']}>
        {editing ? (
          <button
            type="button"
            className={styles['secondaryButton']}
            disabled={draft.trim() === '' && item.images.length === 0}
            onClick={() => {
              onUpdate(item.id, draft);
              setEditing(false);
            }}
          >
            {LOCAL_CODE_COPY.saveQueued}
          </button>
        ) : (
          <button
            type="button"
            className={styles['secondaryButton']}
            onClick={() => {
              setDraft(item.text);
              setEditing(true);
            }}
          >
            {LOCAL_CODE_COPY.editQueued}
          </button>
        )}
        <button
          type="button"
          className={styles['secondaryButton']}
          onClick={() => onRemove(item.id)}
        >
          {LOCAL_CODE_COPY.removeQueued}
        </button>
        <button
          type="button"
          className={styles['secondaryButton']}
          disabled={editing}
          onClick={() => onSendNow(item.id)}
        >
          {LOCAL_CODE_COPY.sendQueuedNow}
        </button>
      </div>
    </li>
  );
}

/** Follow-ups waiting for the next turn, each one still the reader's to change. */
export function LocalQueuedMessages({
  queued,
  paused,
  onUpdate,
  onRemove,
  onSendNow,
}: LocalQueuedMessagesProps) {
  if (queued.length === 0) return null;

  return (
    <section aria-label={LOCAL_CODE_COPY.queued(queued.length)} data-testid="local-queue">
      <p className={styles['statusLine']}>
        {paused
          ? `${LOCAL_CODE_COPY.queued(queued.length)}. ${LOCAL_CODE_COPY.queuePaused}`
          : LOCAL_CODE_COPY.queued(queued.length)}
      </p>
      <ul className={styles['fileList']}>
        {queued.map((item) => (
          <QueuedRow
            key={item.id}
            item={item}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onSendNow={onSendNow}
          />
        ))}
      </ul>
    </section>
  );
}
