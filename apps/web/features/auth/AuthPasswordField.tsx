'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { AuthField } from './AuthField';

const TOGGLE_CLASS =
  'absolute right-2 top-2 flex size-9 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary';
const TOGGLE_ICON_SIZE = 16;

export function AuthPasswordField({
  label,
  value,
  error,
  disabled,
  autoComplete,
  onChange,
}: {
  label: string;
  value: string;
  error?: string | null;
  disabled?: boolean;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const Glyph = revealed ? EyeOff : Eye;

  return (
    <AuthField
      label={label}
      type={revealed ? 'text' : 'password'}
      value={value}
      error={error ?? null}
      disabled={disabled}
      autoComplete={autoComplete}
      autoFocus
      onChange={(event) => onChange(event.target.value)}
      trailing={
        <button
          type="button"
          className={TOGGLE_CLASS}
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
        >
          <Glyph size={TOGGLE_ICON_SIZE} aria-hidden="true" />
        </button>
      }
    />
  );
}
