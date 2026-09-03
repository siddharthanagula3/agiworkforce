import Link from 'next/link';
import './system.css';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GRIEVANCE_OFFICER_NAME,
  contactMailto,
} from '@/lib/legal-constants';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { Container } from './Container';
import { FOOTER_COLUMNS, FOOTER_LEGAL } from './nav';

const COPYRIGHT_YEAR = 2026;
const MARK_SIZE = 18;
const BRAND_STATEMENT = {
  lead: 'One AI workspace across six surfaces.',
  accent: 'Local, your keys, or managed cloud.',
  tail: 'You see the route before anything leaves your device.',
} as const;

export function MarketingFooter({ condensed = false }: { condensed?: boolean } = {}) {
  return (
    <footer className={condensed ? 'agi-ds-footer agi-ds-footer--condensed' : 'agi-ds-footer'}>
      <Container>
        {!condensed && (
          <div className="agi-ds-footer-brand">
            <span className="agi-ds-footer-wordmark">
              <AgiMark size={MARK_SIZE} />
              AGI
            </span>
            <p className="agi-ds-footer-statement">
              {BRAND_STATEMENT.lead} <em className="agi-ds-accent">{BRAND_STATEMENT.accent}</em>{' '}
              {BRAND_STATEMENT.tail}
            </p>
            <span className="agi-ds-footer-watermark" aria-hidden="true">
              AGI
            </span>
          </div>
        )}
        {!condensed && (
          <div className="agi-ds-footer-cols">
            {FOOTER_COLUMNS.map((column) => (
              <ul className="agi-ds-footer-col" key={column.title}>
                <li className="agi-ds-footer-title">{column.title}</li>
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="agi-ds-footer-link">
                      {link.label}
                      {'status' in link && link.status ? (
                        <span className="agi-ds-footer-link-status"> · {link.status}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        )}
        <div className="agi-ds-footer-legal">
          <span>© {COPYRIGHT_YEAR} AGI. Proprietary.</span>
          {FOOTER_LEGAL.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
          <span>
            {GRIEVANCE_OFFICER_NAME}:{' '}
            <a href={contactMailto(CONTACT_SUBJECTS.dpdpGrievance)}>{CONTACT_EMAIL}</a>
          </span>
        </div>
      </Container>
    </footer>
  );
}
