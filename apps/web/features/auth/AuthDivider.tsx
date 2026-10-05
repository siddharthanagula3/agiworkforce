'use client';

import { useAuthCopy } from './authCopy';
import {
  AUTH_DIVIDER_ABOVE_FIELD_CLASS,
  AUTH_DIVIDER_CLASS,
  AUTH_DIVIDER_LABEL_CLASS,
} from './authStyles';

// A floating-label field keeps its own headroom for the label, so a divider
// directly above one needs no margin of its own beneath it.
export function AuthDivider({ aboveField = false }: { aboveField?: boolean }) {
  const copy = useAuthCopy();
  return (
    <div
      className={aboveField ? AUTH_DIVIDER_ABOVE_FIELD_CLASS : AUTH_DIVIDER_CLASS}
      aria-hidden="true"
    >
      <span className="h-px flex-1 bg-rule" />
      <span className={AUTH_DIVIDER_LABEL_CLASS}>{copy.text('flow.divider', 'or')}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
