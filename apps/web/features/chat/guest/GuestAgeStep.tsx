'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  ACCOUNT_AGE_FIELD_LABEL,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  ACCOUNT_MINIMUM_AGE,
  accountAgeRefusalMessage,
  evaluateAccountAge,
  type AccountAgeRefusal,
} from '@agiworkforce/types';

const CONTINUE = 'Continue';

export interface GuestAgeStepProps {
  focusOnMount: boolean;
  onChecked: (minimumAge: number) => void;
}

export function GuestAgeStep({ focusOnMount, onChecked }: GuestAgeStepProps) {
  const fieldId = useId();
  const noticeId = `${fieldId}-notice`;
  const errorId = `${fieldId}-error`;
  const fieldRef = useRef<HTMLInputElement>(null);
  const [entry, setEntry] = useState('');
  const [refusedAs, setRefusedAs] = useState<AccountAgeRefusal | null>(null);
  const refusal = refusedAs === null ? null : accountAgeRefusalMessage(refusedAs);

  useEffect(() => {
    if (focusOnMount) fieldRef.current?.focus();
  }, [focusOnMount]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const verdict = evaluateAccountAge(entry);
    if (verdict === 'eligible') {
      setEntry('');
      onChecked(ACCOUNT_MINIMUM_AGE);
      return;
    }
    setRefusedAs(verdict);
    fieldRef.current?.focus();
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      className="rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-input-bg)] p-4"
    >
      <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        {ACCOUNT_AGE_FIELD_LABEL}
      </label>
      <p id={noticeId} className="mt-1 text-sm text-muted-foreground">
        {ACCOUNT_AGE_REQUIREMENT_NOTICE}
      </p>
      <div className="mt-3 flex flex-row items-center gap-2">
        <input
          ref={fieldRef}
          id={fieldId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          autoComplete="off"
          aria-required
          aria-invalid={refusal !== null}
          aria-describedby={refusal ? `${noticeId} ${errorId}` : noticeId}
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
          className="h-11 w-24 rounded-xl border border-[var(--chat-border-strong)] bg-transparent px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
        />
        <button
          type="submit"
          className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-quick hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
        >
          {CONTINUE}
        </button>
      </div>
      {refusal ? (
        <p id={errorId} role="alert" className="mt-2 text-sm text-danger">
          {refusal}
        </p>
      ) : null}
    </form>
  );
}
