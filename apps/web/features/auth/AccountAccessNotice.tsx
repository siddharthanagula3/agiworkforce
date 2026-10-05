import Link from 'next/link';

import { ACCOUNT_DENIAL_NOTICE, type AccountAccessDenied } from '@/lib/auth/account-status';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthStepFrame } from './AuthStepFrame';
import {
  AUTH_PRIMARY_BUTTON_CLASS,
  AUTH_STANDALONE_LINK_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import { SuspensionAppeal } from './SuspensionAppeal';

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
        <p role="status" data-testid="account-access-notice">
          {denial.message}
        </p>
      }
      footer={<AuthLegalFooter />}
      focusHeading
    >
      {denial.reason === 'suspended' ? (
        <div data-account-denial={denial.reason}>
          <SuspensionAppeal signedIn />
          <div className={AUTH_STEP_LINKS_CLASS}>
            <Link href="/terms#s-11" className={AUTH_STANDALONE_LINK_CLASS}>
              When accounts are suspended
            </Link>
          </div>
        </div>
      ) : (
        <Link
          href={denial.recoveryPath ?? signInHref}
          className={AUTH_PRIMARY_BUTTON_CLASS}
          data-account-denial={denial.reason}
        >
          {action}
        </Link>
      )}
    </AuthStepFrame>
  );
}
