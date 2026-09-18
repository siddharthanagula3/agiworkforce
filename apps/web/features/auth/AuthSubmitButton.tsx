'use client';

import { Spinner } from '@agiworkforce/ui';

import { useAuthCopy } from './authCopy';
import { AUTH_PRIMARY_BUTTON_CLASS } from './authStyles';

export function AuthSubmitButton({
  label,
  busy = false,
  disabled = false,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  const copy = useAuthCopy();
  return (
    <button
      type="submit"
      className={AUTH_PRIMARY_BUTTON_CLASS}
      disabled={busy || disabled}
      aria-busy={busy || undefined}
    >
      {busy ? <Spinner size="sm" aria-label={copy.text('flow.working', 'Working')} /> : label}
    </button>
  );
}
