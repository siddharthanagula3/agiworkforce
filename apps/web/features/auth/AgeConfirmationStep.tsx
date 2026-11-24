'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import {
  ADULT_ELIGIBILITY_ERROR_CODES,
  ADULT_ELIGIBILITY_PATH,
  type AdultEligibilityRequest,
  type AdultEligibilitySurface,
} from '@agiworkforce/cloud-contracts';
import { ACCOUNT_AGE_REQUIREMENT_NOTICE } from '@agiworkforce/types';
import { PageLink } from '@shared/components/layout/EmbeddedPage';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';

import { AgeDataAccessLinks } from './AgeDataAccessLinks';
import { AuthAgeField } from './AuthAgeField';
import { useAuthCopy } from './authCopy';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import { AUTH_ERROR_CLASS, AUTH_FIELD_AID_CLASS, AUTH_FIELD_AID_LINK_CLASS } from './authStyles';
import { useSignupAgeGate } from './useSignupAgeGate';

const TERMS_ELIGIBILITY_HREF = `${CANONICAL_POLICY_ROUTES.terms}#s-02`;
const SUBMIT_TIMEOUT_MS = 20_000;
const REFUSED_STATUS = 403;

async function serverRefusedForAge(response: Response): Promise<boolean> {
  if (response.status !== REFUSED_STATUS) return false;
  const body: unknown = await response.json().catch(() => null);
  return (
    (body as { error?: { code?: unknown } } | null)?.error?.code ===
    ADULT_ELIGIBILITY_ERROR_CODES.ineligible
  );
}

/**
 * The one place a signed-in account is asked its age. The server judges the
 * number and keeps only its decision; this screen re-renders from that
 * decision, so it never moves an account on by itself.
 */
export function AgeConfirmationStep({
  surface = 'web-login',
  footer,
}: {
  surface?: Extract<AdultEligibilitySurface, 'web-login' | 'web-signup'>;
  footer?: ReactNode;
}) {
  const copy = useAuthCopy();
  const router = useRouter();
  const gate = useSignupAgeGate();
  const noticeId = useId();
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async () => {
    setSending(true);
    setFailed(false);
    const payload: AdultEligibilityRequest = {
      surface,
      evidence: { kind: 'declared_age', age: Number(gate.age) },
    };
    try {
      const response = await fetch(ADULT_ELIGIBILITY_PATH, {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      if (!response.ok && !(await serverRefusedForAge(response))) {
        throw new Error(`age confirmation failed: ${response.status}`);
      }
      router.refresh();
    } catch {
      setFailed(true);
      setSending(false);
    }
  };

  return (
    <AuthStepFrame
      heading={copy.text('flow.age.heading', 'Confirm your age')}
      detail={<p id={noticeId}>{copy.text('flow.age.notice', ACCOUNT_AGE_REQUIREMENT_NOTICE)}</p>}
      footer={footer}
    >
      <form
        method="post"
        data-testid="age-confirmation-step"
        onSubmit={(event) => {
          event.preventDefault();
          gate.admit(() => void send());
        }}
      >
        <AuthAgeField gate={gate} disabled={sending} noticeId={noticeId} />
        <div className={AUTH_FIELD_AID_CLASS}>
          <PageLink href={TERMS_ELIGIBILITY_HREF} className={AUTH_FIELD_AID_LINK_CLASS}>
            {copy.text('flow.age.terms', 'Age requirements')}
          </PageLink>
        </div>

        {gate.refusedAs === 'too_young' ? <AgeDataAccessLinks /> : null}

        {failed ? (
          <p role="alert" className={AUTH_ERROR_CLASS}>
            {copy.text('flow.age.failed', 'We could not check your age. Try again.')}
          </p>
        ) : null}

        <AuthSubmitButton label={copy.text('flow.continue', 'Continue')} busy={sending} />
      </form>
    </AuthStepFrame>
  );
}
