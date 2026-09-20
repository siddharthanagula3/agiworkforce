import Link from 'next/link';

import { ACCOUNT_DENIAL_NOTICE, type AccountAccessDenied } from '@/lib/auth/account-status';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthStepFrame } from './AuthStepFrame';
import { AUTH_PRIMARY_BUTTON_CLASS } from './authStyles';

export function AccountAccessNotice({
  denial,
  signInHref,
}: {
  denial: AccountAccessDenied;
  signInHref: string;
}) {
  const { title, action } = ACCOUNT_DENIAL_NOTICE[denial.reason];

  return (
    <AuthStepFrame
      heading={title}
      detail={
        <p className="text-center" role="status" data-testid="account-access-notice">
          {denial.message}
        </p>
      }
      footer={<AuthLegalFooter />}
      focusHeading
    >
      <Link
        href={denial.recoveryPath ?? signInHref}
        className={AUTH_PRIMARY_BUTTON_CLASS}
        data-account-denial={denial.reason}
      >
        {action}
      </Link>
    </AuthStepFrame>
  );
}
