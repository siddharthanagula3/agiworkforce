'use client';

import { useAuthCopy } from './authCopy';
import { AUTH_STATUS_CLASS } from './authStyles';
import type { AuthPhase } from './authContract';

const PHASE_COPY: Readonly<Record<AuthPhase, { key: string; label: string } | null>> = {
  idle: null,
  checking_account: { key: 'flow.phase.checkingAccount', label: 'Checking your account' },
  sending_code: { key: 'flow.phase.sendingCode', label: 'Sending your code' },
  verifying: { key: 'flow.phase.verifying', label: 'Checking what you entered' },
  passkey_requested: { key: 'flow.phase.passkeyRequested', label: 'Waiting for your passkey' },
  redirecting: { key: 'flow.phase.redirecting', label: 'Taking you to your provider' },
  enterprise_redirecting: {
    key: 'flow.phase.enterpriseRedirecting',
    label: 'This address belongs to an organization. Taking you to its sign-in',
  },
};

// The region is always in the tree: an aria-live node added at the same moment
// as its text is not announced by most screen readers.
export function AuthPhaseStatus({ phase }: { phase: AuthPhase }) {
  const copy = useAuthCopy();
  const entry = PHASE_COPY[phase];

  return (
    <p role="status" aria-live="polite" className={AUTH_STATUS_CLASS} data-testid="auth-phase">
      {entry ? copy.text(entry.key, entry.label) : null}
    </p>
  );
}
