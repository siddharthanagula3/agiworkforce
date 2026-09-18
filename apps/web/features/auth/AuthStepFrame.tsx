'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { AUTH_BODY_CLASS, AUTH_HEADING_CLASS, AUTH_MUTED_LINE_CLASS } from './authStyles';

export function AuthStepFrame({
  heading,
  detail,
  children,
  footer,
  focusHeading = false,
}: {
  heading: string;
  detail?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  focusHeading?: boolean;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A step with no autofocused field would otherwise drop focus to the body
  // when it replaces the step the person was working in.
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  return (
    <section className="flex w-full flex-col" aria-labelledby={headingId}>
      <h1
        id={headingId}
        ref={headingRef}
        tabIndex={focusHeading ? -1 : undefined}
        className={AUTH_HEADING_CLASS}
      >
        {heading}
      </h1>
      {detail ? <div className={`mt-3 ${AUTH_MUTED_LINE_CLASS}`}>{detail}</div> : null}
      <div className={AUTH_BODY_CLASS}>{children}</div>
      {footer}
    </section>
  );
}
