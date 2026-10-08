import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { AuthField } from './AuthField';
import { AUTH_FIELD_TOGGLE_CLASS } from './authStyles';

const TOGGLE_ICON_SIZE = 18;

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
      sensitive={revealed ? 'readable' : 'masked'}
      value={value}
      error={error ?? null}
      disabled={disabled}
      autoComplete={autoComplete}
      autoFocus
      onChange={(event) => onChange(event.target.value)}
      trailing={
        <button
          type="button"
          className={AUTH_FIELD_TOGGLE_CLASS}
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
        >
          <Glyph size={TOGGLE_ICON_SIZE} aria-hidden="true" />
        </button>
      }
    />
  );
}
