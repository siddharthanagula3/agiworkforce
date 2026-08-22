import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GRIEVANCE_OFFICER_NAME,
  contactMailto,
} from '@/lib/legal-constants';

/*
 * Site-wide marketing footer. Compact product, surface, capability, and
 * company link groups. Bottom strip carries copyright and mode boundary.
 *
 * Same default export as the previous footer so every page importer
 * keeps working.
 */

const PRODUCT = [
  { href: '/', label: 'Home' },
  { href: '/business', label: 'Business' },
  { href: '/teams', label: 'Teams' },
  { href: '/apps', label: 'Apps' },
  { href: '/agi-code', label: 'AGI Code' },
  { href: '/agi-work', label: 'AGI Work' },
  { href: '/byok', label: 'BYOK' },
  { href: '/local', label: 'Local' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/waitlist', label: 'Enterprise early access' },
];

const SURFACES = [
  { href: '/desktop', label: 'Desktop' },
  { href: '/mobile', label: 'Mobile' },
  { href: '/cli', label: 'CLI' },
  { href: '/chrome-extension', label: 'Chrome' },
  { href: '/vscode-extension', label: 'VS Code' },
  { href: '/download', label: 'Downloads & release status' },
];

const CAPABILITIES = [
  { href: '/features/artifacts', label: 'Artifacts' },
  { href: '/features/deep-research', label: 'Deep Research' },
  { href: '/features/projects', label: 'Projects' },
  { href: '/features/memory', label: 'Memory' },
  { href: '/providers', label: 'Providers' },
];

const COMPANY = [
  { href: '/about', label: 'About' },
  { href: '/enterprise', label: 'Enterprise' },
  { href: '/contact', label: 'Contact' },
  { href: '/help', label: 'Help' },
  { href: '/faq', label: 'FAQ' },
  { href: '/support', label: 'Support' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/data-use', label: 'How we use your data' },
  { href: '/terms', label: 'Terms' },
  { href: '/acceptable-use', label: 'Acceptable use' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/agent-permissions', label: 'Agent permissions' },
  { href: '/security', label: 'Security' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/copyright', label: 'Copyright' },
  { href: '/model-licenses', label: 'Model licences' },
  { href: '/privacy/india', label: 'India — DPDP notice' },
  { href: '/privacy/requests', label: 'Data rights & consent' },
  { href: '/legal', label: 'All legal docs' },
];

export function MarketingFooter() {
  return (
    <footer className="agi-footer">
      <div className="agi-footer-brandband">
        <div className="agi-footer-brandband-copy">
          <Link href="/" className="agi-footer-mark" aria-label="AGI home">
            <AgiMark size={18} />
            <span className="agi-footer-mark-word">AGI</span>
          </Link>
          <p className="agi-footer-tagline">
            One AI workspace across six surfaces. <em>Local, your keys, or managed cloud</em> — you
            see the route before anything leaves your device.
          </p>
        </div>
        <span className="agi-footer-wordmark" aria-hidden="true">
          AGI
        </span>
      </div>
      <div className="agi-footer-row">
        <ul className="agi-footer-col">
          <li className="agi-footer-col-title">Product</li>
          {PRODUCT.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="agi-footer-link">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="agi-footer-col">
          <li className="agi-footer-col-title">Surfaces</li>
          {SURFACES.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="agi-footer-link">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="agi-footer-col">
          <li className="agi-footer-col-title">Capabilities</li>
          {CAPABILITIES.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="agi-footer-link">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="agi-footer-col">
          <li className="agi-footer-col-title">Company</li>
          {COMPANY.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="agi-footer-link">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {/*
        Grievance contact in the footer, not only on the policy page. India's
        DPDP Act makes the fiduciary's grievance route a precondition for
        complaining to the Data Protection Board, so someone who needs it has to
        be able to find it from any page — including from a page that made them
        want to complain. Subject-line routing because `contact@` is the one
        mailbox proven to receive mail; see lib/legal-constants.ts.
      */}
      <div className="agi-footer-strip">
        <span>
          {GRIEVANCE_OFFICER_NAME}:{' '}
          <a href={contactMailto(CONTACT_SUBJECTS.dpdpGrievance)} className="agi-footer-link">
            {CONTACT_EMAIL}
          </a>{' '}
          · subject &ldquo;{CONTACT_SUBJECTS.dpdpGrievance}&rdquo;
        </span>
        <span>
          <Link href="/privacy/requests" className="agi-footer-link">
            Exercise your data rights
          </Link>
        </span>
      </div>
      <div className="agi-footer-strip">
        <span>© 2026 AGI. Proprietary.</span>
        <span>
          Local and BYOK stay explicit. Managed Cloud is open in public alpha; self-serve paid plans
          are listed on Pricing, while Enterprise remains contract-scoped.
        </span>
      </div>
    </footer>
  );
}
