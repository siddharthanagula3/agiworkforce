import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { COMING_SOON_LABEL } from '@/lib/marketing-constants';

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
  { href: '/download', label: COMING_SOON_LABEL },
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
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/acceptable-use', label: 'Acceptable use' },
  { href: '/agent-permissions', label: 'Agent permissions' },
  { href: '/security', label: 'Security' },
  // Cookie policy is expected in the footer in the EU, and /legal is the index a
  // procurement or security reviewer starts from — it links the DPA,
  // subprocessors, SLA, refunds, accessibility and the EU-representative
  // statement, none of which were reachable from the footer before.
  { href: '/cookies', label: 'Cookies' },
  // A product that hosts user uploads and publishes artifacts at shareable URLs
  // needs a reachable notice-and-takedown route, and one that routes to
  // several third-party and open-weight models needs its licence terms stated.
  { href: '/copyright', label: 'Copyright' },
  { href: '/model-licenses', label: 'Model licences' },
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
      <div className="agi-footer-strip">
        <span>© 2026 AGI. Proprietary.</span>
        <span>
          Local and BYOK stay explicit. Managed cloud is open in public alpha; higher-capacity paid
          plans roll out as release controls are proven.
        </span>
      </div>
    </footer>
  );
}
