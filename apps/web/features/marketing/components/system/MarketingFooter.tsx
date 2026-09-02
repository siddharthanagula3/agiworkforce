import Link from 'next/link';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GRIEVANCE_OFFICER_NAME,
  contactMailto,
} from '@/lib/legal-constants';
import { Container } from './Container';
import { FOOTER_COLUMNS, FOOTER_LEGAL } from './nav';

const COPYRIGHT_YEAR = 2026;

export function MarketingFooter() {
  return (
    <footer className="agi-ds-footer">
      <Container>
        <div className="agi-ds-footer-cols">
          {FOOTER_COLUMNS.map((column) => (
            <ul className="agi-ds-footer-col" key={column.title}>
              <li className="agi-ds-footer-title">{column.title}</li>
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="agi-ds-footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </div>
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
