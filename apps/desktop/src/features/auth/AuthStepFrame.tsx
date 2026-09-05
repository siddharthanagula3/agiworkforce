import type { ReactNode } from 'react';

import { AUTH_BODY_CLASS, AUTH_HEADING_CLASS, AUTH_MUTED_LINE_CLASS } from './authStyles';

export function AuthStepFrame({
  heading,
  detail,
  children,
  footer,
}: {
  heading: string;
  detail?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col">
      <h1 className={AUTH_HEADING_CLASS}>{heading}</h1>
      {detail ? <div className={`mt-3 ${AUTH_MUTED_LINE_CLASS}`}>{detail}</div> : null}
      <div className={AUTH_BODY_CLASS}>{children}</div>
      {footer}
    </div>
  );
}
