import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

import { AUTH_ERROR_CLASS, AUTH_INPUT_CLASS, AUTH_LABEL_CLASS } from './authStyles';

export function AuthField({
  label,
  error,
  trailing,
  ...input
}: {
  label: string;
  error?: ReactNode;
  trailing?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  return (
    <div>
      <label htmlFor={fieldId} className={AUTH_LABEL_CLASS}>
        {label}
      </label>
      <div className="relative mt-2">
        <input
          {...input}
          id={fieldId}
          className={`${AUTH_INPUT_CLASS}${trailing ? ' pr-14' : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {trailing}
      </div>
      {error ? (
        <p id={errorId} role="alert" className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
