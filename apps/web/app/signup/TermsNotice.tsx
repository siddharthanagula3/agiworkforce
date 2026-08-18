import Link from 'next/link';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';

/**
 * Assent tied to the action, not a checkbox above the form.
 *
 * The clickwrap sat at the top of the page and blocked the auth widget until it
 * was ticked, which meant a returning user met a consent wall before anything
 * identified them. This states the same agreement against the button the user is
 * about to press, which is where the deliberate act actually happens — the
 * pattern OpenAI and Google's own consent screen use.
 *
 * It does not replace the durable record. /signup/complete and /login/complete
 * still call the server and store the accepted version against the account, and
 * a terms update still re-prompts there, so what a user agreed to and when
 * remains provable independently of anything rendered here.
 */
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
