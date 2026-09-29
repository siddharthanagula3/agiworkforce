import Link from 'next/link';

import { FREE_PLAN_TRAINING_DATA_DISCLOSURE } from '@/lib/compliance/free-plan-training-disclosure';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { AUTH_FOOTER_LINK_CLASS } from './authStyles';

export function AccountDataDisclosure() {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-text-muted">
      <p>{FREE_PLAN_TRAINING_DATA_DISCLOSURE}</p>
      <p className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link
          href={CANONICAL_POLICY_ROUTES.dataUse}
          target="_blank"
          rel="noopener noreferrer"
          className={`${AUTH_FOOTER_LINK_CLASS} whitespace-nowrap underline`}
        >
          Data Use Guidelines
        </Link>
        <Link
          href={CANONICAL_POLICY_ROUTES.acceptableUse}
          target="_blank"
          rel="noopener noreferrer"
          className={`${AUTH_FOOTER_LINK_CLASS} whitespace-nowrap underline`}
        >
          Acceptable Use Policy
        </Link>
      </p>
    </div>
  );
}
