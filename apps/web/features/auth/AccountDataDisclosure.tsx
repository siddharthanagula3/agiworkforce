import Link from 'next/link';

import {
  FREE_PLAN_TRAINING_SIGNUP_STATEMENT,
  FREE_PLAN_TRAINING_TERMS_CARD_BODY,
  FREE_PLAN_TRAINING_TERMS_CARD_LINK_LABEL,
  FREE_PLAN_TRAINING_TERMS_CARD_TITLE,
} from '@/lib/compliance/free-plan-training-disclosure';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import {
  AUTH_DISCLOSURE_CLASS,
  AUTH_DISCLOSURE_TITLE_CLASS,
  AUTH_FOOTER_LINK_CLASS,
  AUTH_FOOTER_NAV_LINK_CLASS,
  AUTH_POLICY_LINKS_CLASS,
} from './authStyles';

export function AccountDataDisclosure() {
  return (
    <div className={AUTH_DISCLOSURE_CLASS} data-testid="account-data-disclosure">
      <p className={AUTH_DISCLOSURE_TITLE_CLASS}>{FREE_PLAN_TRAINING_TERMS_CARD_TITLE}</p>
      <p>{FREE_PLAN_TRAINING_TERMS_CARD_BODY}</p>
      <details>
        <summary
          className={`${AUTH_FOOTER_LINK_CLASS} -mb-2 inline-flex min-h-11 cursor-pointer list-none items-center underline [&::-webkit-details-marker]:hidden`}
        >
          {FREE_PLAN_TRAINING_TERMS_CARD_LINK_LABEL}
        </summary>
        <p className="mt-2">{FREE_PLAN_TRAINING_SIGNUP_STATEMENT}</p>
      </details>
    </div>
  );
}

export function AccountPolicyLinks() {
  return (
    <nav aria-label="Policies" className={AUTH_POLICY_LINKS_CLASS}>
      <Link
        href={CANONICAL_POLICY_ROUTES.acceptableUse}
        target="_blank"
        rel="noopener noreferrer"
        className={`${AUTH_FOOTER_NAV_LINK_CLASS} underline`}
      >
        Acceptable Use Policy
      </Link>
      <span aria-hidden="true">·</span>
      <Link
        href={CANONICAL_POLICY_ROUTES.dataUse}
        target="_blank"
        rel="noopener noreferrer"
        className={`${AUTH_FOOTER_NAV_LINK_CLASS} underline`}
      >
        Data Use Guidelines
      </Link>
    </nav>
  );
}
