import Link from 'next/link';

import { FREE_PLAN_TRAINING_SIGNUP_STATEMENT } from '@/lib/compliance/free-plan-training-disclosure';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { AUTH_DISCLOSURE_CLASS, AUTH_FOOTER_LINK_CLASS } from './authStyles';

const POLICY_LINK_CLASS = `${AUTH_FOOTER_LINK_CLASS} whitespace-nowrap underline`;

export function AccountDataDisclosure() {
  return (
    <div className={AUTH_DISCLOSURE_CLASS} data-testid="account-data-disclosure">
      <p>{FREE_PLAN_TRAINING_SIGNUP_STATEMENT}</p>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href={CANONICAL_POLICY_ROUTES.dataUse}
          target="_blank"
          rel="noopener noreferrer"
          className={POLICY_LINK_CLASS}
        >
          Data Use Guidelines
        </Link>
        <Link
          href={CANONICAL_POLICY_ROUTES.acceptableUse}
          target="_blank"
          rel="noopener noreferrer"
          className={POLICY_LINK_CLASS}
        >
          Acceptable Use Policy
        </Link>
      </p>
    </div>
  );
}
