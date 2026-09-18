'use client';

import { useAuthCopy } from './authCopy';
import { AUTH_DIVIDER_CLASS, AUTH_DIVIDER_LABEL_CLASS } from './authStyles';

export function AuthDivider() {
  const copy = useAuthCopy();
  return (
    <div className={AUTH_DIVIDER_CLASS} aria-hidden="true">
      <span className="h-px flex-1 bg-rule" />
      <span className={AUTH_DIVIDER_LABEL_CLASS}>{copy.text('flow.divider', 'or')}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
