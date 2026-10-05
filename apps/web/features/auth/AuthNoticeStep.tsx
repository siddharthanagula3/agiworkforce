'use client';

import Link from 'next/link';

import { CONTACT_SUBJECTS, contactMailto } from '@/lib/legal-constants';
import { SUSPENSION_APPEAL_PATH } from '@/lib/auth/account-status';
import type { AuthNoticeKind } from '@/lib/auth/error-taxonomy';
import { useAuthCopy } from './authCopy';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthStepFrame } from './AuthStepFrame';
import {
  AUTH_PRIMARY_BUTTON_CLASS,
  AUTH_STANDALONE_LINK_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import { useCountdown } from './useCountdown';

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
        <p role="status" data-testid="auth-notice">
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

      {notice === 'account_suspended' ? (
        <div className={AUTH_STEP_LINKS_CLASS}>
          <Link href={SUSPENSION_APPEAL_PATH} className={AUTH_STANDALONE_LINK_CLASS}>
            {copy.text('flow.notice.appeal', 'Appeal this suspension')}
          </Link>
        </div>
      ) : null}
      {notice === 'account_locked' ? (
        <div className={AUTH_STEP_LINKS_CLASS}>
          <Link
            href={contactMailto(CONTACT_SUBJECTS.appeal)}
            className={AUTH_STANDALONE_LINK_CLASS}
          >
            {copy.text('flow.notice.contactSupport', 'Contact support')}
          </Link>
        </div>
      ) : null}
    </AuthStepFrame>
  );
}
