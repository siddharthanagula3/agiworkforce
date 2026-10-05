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
            off here without a passkey. Every session and linked device is signed out, your password
            is reset, and the passkeys, security keys and recovery keys added when it was turned on
            are removed. This link works for {ACCOUNT_SECURITY_POLICY.undoHours} hours after it was
            sent.
          </p>
        }
      >
        <AccountSecurityUndo />
      </AuthStepFrame>
    </AuthLayout>
  );
}
