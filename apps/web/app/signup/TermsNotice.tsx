import Link from 'next/link';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export function TermsNotice({ action = 'continuing' }: { action?: string }) {
  return (
    <p className="text-center text-xs leading-relaxed text-muted-foreground">
      By {action}, you agree to our{' '}
      <Link href={CANONICAL_POLICY_ROUTES.terms} className="underline underline-offset-2">
        Terms of Service
      </Link>
      , including the arbitration clause and class-action waiver, and acknowledge our{' '}
      <Link href={CANONICAL_POLICY_ROUTES.privacy} className="underline underline-offset-2">
        Privacy Policy
      </Link>
      . <span className="whitespace-nowrap">Version {POLICY_LAST_UPDATED.terms}.</span>
    </p>
  );
}
