import type { Metadata } from 'next';
import { ACCOUNT_SECURITY_POLICY } from '@agiworkforce/cloud-contracts/account-security';

import { AccountSecurityUndo } from '@/features/account-security/components/AccountSecurityUndo';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Turn off Advanced Account Security',
  robots: { index: false, follow: false },
};

export default function AccountSecurityUndoPage() {
  return (
    <AuthLayout scene>
      <AuthStepFrame
        heading="Was this not you?"
        detail={
          <p>
            Advanced Account Security was turned on for your account. If you did not do it, turn it
            off here without a passkey. This permanently removes its recovery keys and the saved
            passkey and security-key registrations that existed when it was turned on. Session
            sign-out and password protection are attempted, but account recovery may need further
            attention. Review your sign-in methods and active sessions afterwards. This link works
            for {ACCOUNT_SECURITY_POLICY.undoHours} hours after it was sent.
          </p>
        }
      >
        <AccountSecurityUndo />
      </AuthStepFrame>
    </AuthLayout>
  );
}
