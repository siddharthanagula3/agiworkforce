import { ArrowRight, Info } from 'lucide-react';
import Link from 'next/link';

import {
  FREE_PLAN_TRAINING_SIGNUP_NOTICE,
  FREE_PLAN_TRAINING_SIGNUP_NOTICE_LINK_LABEL,
  FREE_PLAN_TRAINING_SIGNUP_STATEMENT,
} from '@/lib/compliance/free-plan-training-disclosure';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import {
  AUTH_ACTION_ICON_SIZE,
  AUTH_INLINE_ICON_SIZE,
  AUTH_NOTICE_CLASS,
  AUTH_NOTICE_DETAIL_LINK_CLASS,
  AUTH_NOTICE_LINK_CLASS,
} from './authStyles';

export function AuthDataUseNotice() {
  return (
    <div className={AUTH_NOTICE_CLASS} data-testid="auth-data-use-notice">
      <Info size={AUTH_ACTION_ICON_SIZE} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div>
        <p>{FREE_PLAN_TRAINING_SIGNUP_NOTICE}</p>
        <details className="group">
          <summary
            className={`${AUTH_NOTICE_LINK_CLASS} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
          >
            {FREE_PLAN_TRAINING_SIGNUP_NOTICE_LINK_LABEL}
            <ArrowRight
              size={AUTH_INLINE_ICON_SIZE}
              aria-hidden="true"
              className="group-open:rotate-90"
            />
          </summary>
          <div className="mt-3 flex flex-col gap-2 text-[1.0625rem] leading-relaxed">
            <p>{FREE_PLAN_TRAINING_SIGNUP_STATEMENT}</p>
            <Link href={CANONICAL_POLICY_ROUTES.dataUse} className={AUTH_NOTICE_DETAIL_LINK_CLASS}>
              Data Use Guidelines
            </Link>
          </div>
        </details>
      </div>
    </div>
  );
}
