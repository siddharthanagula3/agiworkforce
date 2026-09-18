'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { useAuthCopy } from './authCopy';
import { AuthField } from './AuthField';

const TOGGLE_CLASS =
  'absolute right-2 top-2 flex size-9 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary';
const TOGGLE_ICON_SIZE = 16;

export function AuthPasswordField({
  label,
  name = 'password',
  value,
  error,
  disabled,
  autoComplete,
  onChange,
}: {
  label: string;
  name?: string;
  value: string;
  error?: string | null;
  disabled?: boolean;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  const copy = useAuthCopy();
  const [revealed, setRevealed] = useState(false);
  const Glyph = revealed ? EyeOff : Eye;

  return (
    <AuthField
      label={label}
      type={revealed ? 'text' : 'password'}
      name={name}
      value={value}
      error={error ?? null}
      disabled={disabled}
      autoComplete={autoComplete}
      autoFocus
      required
      onChange={(event) => onChange(event.target.value)}
      trailing={
        <button
          type="button"
          className={TOGGLE_CLASS}
          onClick={() => setRevealed((current) => !current)}
          aria-pressed={revealed}
          aria-label={copy.text('flow.password.reveal', 'Show password')}
        >
          <Glyph size={TOGGLE_ICON_SIZE} aria-hidden="true" />
        </button>
      }
    />
  );
}
