import { PageLink } from '@shared/components/layout/EmbeddedPage';
import { CONTACT_EMAIL } from '@/lib/legal-constants';

export const HELP_UNAVAILABLE_ON_PHONE_TITLE = 'Not available in the app';
export const HELP_UNAVAILABLE_ON_PHONE_BODY = `Search the help centre or browse every collection instead. For anything else, email ${CONTACT_EMAIL}.`;
export const HELP_UNAVAILABLE_ON_PHONE_LINK = 'Back to help';

export function HelpArticleUnavailableOnPhone() {
  return (
    <article className="break-words">
      <div className="dx-head">
        <h1 className="dx-title" id="help-article-title">
          {HELP_UNAVAILABLE_ON_PHONE_TITLE}
        </h1>
      </div>
      <p className="dx-desc">{HELP_UNAVAILABLE_ON_PHONE_BODY}</p>
      <p>
        <PageLink href="/help" className="agi-ds-link">
          {HELP_UNAVAILABLE_ON_PHONE_LINK}
        </PageLink>
      </p>
    </article>
  );
}
