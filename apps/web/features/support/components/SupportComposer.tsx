'use client';

import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { SUPPORT_MAX_QUESTION_LENGTH } from '../lib/contract';
import styles from './SupportWidget.module.css';

export function SupportComposer({
  disabled,
  onAsk,
}: {
  disabled: boolean;
  onAsk: (question: string) => void;
}) {
  const inputId = useId();
  const [value, setValue] = useState('');

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    setValue('');
    onAsk(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form className={styles['composer']} onSubmit={submit}>
      <label className="sr-only" htmlFor={inputId}>
        Ask a support question
      </label>
      <textarea
        id={inputId}
        className={styles['composerInput']}
        rows={1}
        maxLength={SUPPORT_MAX_QUESTION_LENGTH}
        placeholder="Ask about the product…"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="submit"
        className={styles['composerSubmit']}
        disabled={disabled || value.trim().length === 0}
      >
        Ask
      </button>
    </form>
  );
}
