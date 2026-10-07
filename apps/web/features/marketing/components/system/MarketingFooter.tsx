import Link from 'next/link';
import { Fragment } from 'react';
import './system.css';
import './public-footer.css';
import {
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GRIEVANCE_OFFICER_NAME,
  contactMailto,
} from '@/lib/legal-constants';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { CookiePreferencesTrigger } from '@shared/components/CookiePreferencesTrigger';
import { COOKIE_PREFERENCES_LABEL } from '@shared/lib/cookie-consent';
import { Container } from './Container';
import { FOOTER_COLUMNS, FOOTER_LEGAL } from './nav';

const COPYRIGHT_YEAR = 2026;
const MARK_SIZE = 18;

const columnHeadingId = (title: string) =>
  `agi-footer-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export function MarketingFooter({ condensed = false }: { condensed?: boolean } = {}) {
  return (
    <footer
      className={['agi-ds-footer', 'agi-footer-responsive', condensed && 'agi-ds-footer--condensed']
        .filter(Boolean)
        .join(' ')}
    >
      <Container>
        {!condensed && (
          <div className="agi-ds-footer-brand">
            <span className="agi-ds-footer-wordmark">
              <AgiMark size={MARK_SIZE} />
              <span>AGI</span>
            </span>
            <p className="agi-ds-footer-statement">
              One workspace for <span className="agi-ds-footer-phrase">AI-assisted</span> work.
            </p>
          </div>
        )}
        {!condensed && (
          <nav aria-label="Footer" className="agi-ds-footer-cols">
            {FOOTER_COLUMNS.map((column) => {
              const headingId = columnHeadingId(column.title);
              return (
                <div className="agi-ds-footer-col" key={column.title}>
                  <h2 className="agi-ds-footer-title" id={headingId}>
                    {column.title}
                  </h2>
                  <ul aria-labelledby={headingId} className="agi-ds-footer-list">
                    {column.links.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href} className="agi-ds-footer-link">
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        )}
        <div className="agi-ds-footer-legal">
          <span>© {COPYRIGHT_YEAR} AGI. Proprietary.</span>
          <nav aria-label="Legal" className="agi-ds-footer-legal-nav">
            {FOOTER_LEGAL.map((link) => (
              <Fragment key={link.href}>
                <Link href={link.href}>{link.label}</Link>
                {link.href === CANONICAL_POLICY_ROUTES.cookies ? (
                  <CookiePreferencesTrigger className="agi-ds-footer-legal-button">
                    {COOKIE_PREFERENCES_LABEL}
                  </CookiePreferencesTrigger>
                ) : null}
              </Fragment>
            ))}
          </nav>
          <span>
            {GRIEVANCE_OFFICER_NAME}:{' '}
            <a href={contactMailto(CONTACT_SUBJECTS.dpdpGrievance)}>{CONTACT_EMAIL}</a>
          </span>
        </div>
      </Container>
    </footer>
  );
}
