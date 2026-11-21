import { PageLink } from '@shared/components/layout/EmbeddedPage';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { AUTH_FOOTER_NAV_LINK_CLASS, AUTH_POLICY_LINKS_CLASS } from './authStyles';

export function AccountPolicyLinks() {
  return (
    <nav aria-label="Policies" className={AUTH_POLICY_LINKS_CLASS}>
      <PageLink
        href={CANONICAL_POLICY_ROUTES.acceptableUse}
        target="_blank"
        rel="noopener noreferrer"
        className={`${AUTH_FOOTER_NAV_LINK_CLASS} underline`}
      >
        Acceptable Use Policy
      </PageLink>
      <span aria-hidden="true">·</span>
      <PageLink
        href={CANONICAL_POLICY_ROUTES.dataUse}
        target="_blank"
        rel="noopener noreferrer"
        className={`${AUTH_FOOTER_NAV_LINK_CLASS} underline`}
      >
        Data Use Guidelines
      </PageLink>
    </nav>
  );
}
