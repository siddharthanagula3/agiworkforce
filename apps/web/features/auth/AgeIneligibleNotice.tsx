import type { ReactNode } from 'react';
import { ACCOUNT_AGE_INELIGIBLE_MESSAGE } from '@agiworkforce/types';
import { PageLink } from '@shared/components/layout/EmbeddedPage';

import { AgeDataAccessLinks } from './AgeDataAccessLinks';
import { AuthStepFrame } from './AuthStepFrame';
import { AUTH_STANDALONE_LINK_CLASS, AUTH_STEP_LINKS_CLASS } from './authStyles';

const SUPPORT_HREF = '/contact';

/**
 * Shown to an account the server holds a refusal for. There is no age field:
 * a second answer does not reopen what the first one closed, so the way back
 * is a person at support, and the way out keeps the data reachable.
 */
export function AgeIneligibleNotice({ footer }: { footer?: ReactNode }) {
  return (
    <AuthStepFrame
      heading="This account can't be used"
      detail={
        <p role="status" data-testid="age-ineligible-notice">
          {ACCOUNT_AGE_INELIGIBLE_MESSAGE}
        </p>
      }
      footer={footer}
      focusHeading
    >
      <AgeDataAccessLinks />
      <div className={AUTH_STEP_LINKS_CLASS}>
        <PageLink href={SUPPORT_HREF} className={AUTH_STANDALONE_LINK_CLASS}>
          Contact support if this is a mistake
        </PageLink>
      </div>
    </AuthStepFrame>
  );
}
