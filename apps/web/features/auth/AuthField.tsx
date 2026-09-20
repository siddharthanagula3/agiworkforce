'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

import {
  AUTH_ERROR_CLASS,
  AUTH_HINT_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
} from './authStyles';

export function AuthField({
  label,
  error,
  hint,
  trailing,
  ...input
}: {
  label: string;
  error?: ReactNode;
  /** A condition of the input itself, announced beside it rather than as a failure. */
  hint?: ReactNode;
  trailing?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const described = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');
  const inputRef = useRef<HTMLInputElement>(null);
  const wasErrored = useRef(false);

  // Submitting leaves focus on the button, so the message the field just grew
  // is behind whoever is reading the page rather than in front of them.
  useEffect(() => {
    const errored = Boolean(error);
    if (errored && !wasErrored.current) {
      const active = document.activeElement;
      const alreadyOnAnErroredField =
        active instanceof HTMLInputElement && active.getAttribute('aria-invalid') === 'true';
      if (!alreadyOnAnErroredField && active !== inputRef.current) inputRef.current?.focus();
    }
    wasErrored.current = errored;
  }, [error]);

  return (
    <div>
      <label htmlFor={fieldId} className={AUTH_LABEL_CLASS}>
        {label}
      </label>
      <div className="relative mt-2">
        <input
          {...input}
          ref={inputRef}
          id={fieldId}
          className={`${AUTH_INPUT_CLASS}${trailing ? ' pr-14' : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
        />
        {trailing}
      </div>
      {/* The region outlives its text: one mounted together with its content is often not announced. */}
      {hint !== undefined ? (
        <p id={hintId} role="status" className={hint ? AUTH_HINT_CLASS : 'sr-only'}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
