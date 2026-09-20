'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

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
  const [capsLock, setCapsLock] = useState(false);
  const Glyph = revealed ? EyeOff : Eye;

  // A hidden field gives no way to see that every letter arrived uppercase,
  // which reads as a wrong password until someone notices the key.
  const readCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState?.('CapsLock') === true);
  };

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
      onKeyDown={readCapsLock}
      onKeyUp={readCapsLock}
      onBlur={() => setCapsLock(false)}
      hint={capsLock && !revealed ? copy.text('flow.password.capsLock', 'Caps Lock is on') : null}
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
