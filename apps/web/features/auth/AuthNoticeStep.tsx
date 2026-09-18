'use client';

import Link from 'next/link';

import { CONTACT_SUBJECTS, contactMailto } from '@/lib/legal-constants';
import type { AuthNoticeKind } from '@/lib/auth/error-taxonomy';
import { useAuthCopy } from './authCopy';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthStepFrame } from './AuthStepFrame';
import { AUTH_LINK_CLASS, AUTH_PRIMARY_BUTTON_CLASS, AUTH_STEP_LINKS_CLASS } from './authStyles';
import { useCountdown } from './useCountdown';

const SUPPORT_NOTICES: readonly AuthNoticeKind[] = ['account_suspended', 'account_locked'];

export function AuthNoticeStep({
  notice,
  retryAfterSeconds,
  onRestart,
  restartHref,
}: {
  notice: AuthNoticeKind;
  retryAfterSeconds: number | null;
  onRestart?: () => void;
  restartHref?: string;
}) {
  const copy = useAuthCopy();
  const [remaining] = useCountdown(retryAfterSeconds ?? 0);
  const { title, message, action } = copy.errorCopy(notice);
  const waiting = remaining > 0;

  return (
    <AuthStepFrame
      heading={title}
      detail={
        <p className="text-center" role="status" data-testid="auth-notice">
          {message}
        </p>
      }
      footer={<AuthLegalFooter />}
      focusHeading
    >
      {restartHref && !waiting ? (
        <Link href={restartHref} className={AUTH_PRIMARY_BUTTON_CLASS}>
          {action}
        </Link>
      ) : (
        <button
          type="button"
          className={AUTH_PRIMARY_BUTTON_CLASS}
          disabled={waiting}
          onClick={onRestart}
        >
          {waiting
            ? copy.text('flow.notice.retryIn', 'Try again in {{seconds}}s', { seconds: remaining })
            : action}
        </button>
      )}

      {SUPPORT_NOTICES.includes(notice) ? (
        <div className={AUTH_STEP_LINKS_CLASS}>
          <Link href={contactMailto(CONTACT_SUBJECTS.appeal)} className={AUTH_LINK_CLASS}>
            {copy.text('flow.notice.contactSupport', 'Contact support')}
          </Link>
        </div>
      ) : null}
    </AuthStepFrame>
  );
}
