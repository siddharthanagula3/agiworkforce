import Link from 'next/link';
import './system.css';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GRIEVANCE_OFFICER_NAME,
  contactMailto,
} from '@/lib/legal-constants';
import { Container } from './Container';
import { FOOTER_COLUMNS, FOOTER_LEGAL } from './nav';

const COPYRIGHT_YEAR = 2026;

export function MarketingFooter({ condensed = false }: { condensed?: boolean } = {}) {
  return (
    <footer className={condensed ? 'agi-ds-footer agi-ds-footer--condensed' : 'agi-ds-footer'}>
      <Container>
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
          <a href={contactMailto(CONTACT_SUBJECTS.dpdpGrievance)}>
            {GRIEVANCE_OFFICER_NAME}: {CONTACT_EMAIL}
          </a>
        </div>
      </Container>
    </footer>
  );
}
