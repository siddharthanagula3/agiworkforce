import { PageLink } from '@shared/components/layout/EmbeddedPage';

import { AUTH_HINT_CLASS, AUTH_LINK_CLASS } from './authStyles';

const DATA_EXPORT_HREF = '/settings/privacy';
const ACCOUNT_DELETION_HREF = '/settings/account';
const DATA_RIGHTS_HREF = '/privacy/requests';

/**
 * An account that cannot use the product still owns what it stored. These are
 * the routes that stay open to it: settings is not behind the age decision.
 */
export function AgeDataAccessLinks() {
  return (
    <p className={AUTH_HINT_CLASS} data-testid="age-data-access">
      Your data stays yours. You can{' '}
      <PageLink href={DATA_EXPORT_HREF} className={AUTH_LINK_CLASS}>
        export it
      </PageLink>
      ,{' '}
      <PageLink href={ACCOUNT_DELETION_HREF} className={AUTH_LINK_CLASS}>
        delete your account
      </PageLink>{' '}
      or{' '}
      <PageLink href={DATA_RIGHTS_HREF} className={AUTH_LINK_CLASS}>
        make a data request
      </PageLink>
      .
    </p>
  );
}
