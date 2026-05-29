import Link from 'next/link';
import { POSITIONING } from '../../lib/marketing-constants';
import { AgiMark } from '../agi/AgiMark';

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
  { href: '/cowork', label: 'Cowork' },
  { href: '/byok', label: 'BYOK' },
  { href: '/local', label: 'Local' },
  { href: '/pricing', label: 'Pricing' },
];

const SURFACES = [
  { href: '/desktop', label: 'Desktop' },
  { href: '/mobile', label: 'Mobile' },
  { href: '/cli', label: 'CLI' },
  { href: '/chrome-extension', label: 'Chrome' },
  { href: '/vscode-extension', label: 'VS Code' },
  { href: '/download', label: 'Download' },
];

const CAPABILITIES = [
  { href: '/features/artifacts', label: 'Artifacts' },
  { href: '/features/deep-research', label: 'Deep Research' },
  { href: '/features/projects', label: 'Projects' },
  { href: '/features/memory', label: 'Memory' },
  { href: '/providers', label: 'Providers' },
  { href: '/compare', label: 'Compare' },
];

const COMPANY = [
  { href: '/about', label: 'About' },
  { href: '/enterprise', label: 'Enterprise' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/security', label: 'Security' },
];

export function MarketingFooter() {
  return (
    <footer className="agi-footer">
      <div className="agi-footer-row">
        <Link href="/" className="agi-footer-mark" aria-label="AGI home">
          <AgiMark size={18} />
          <span style={{ marginLeft: 8 }}>
            agi<span className="agi-mark-dot">.</span>workforce
          </span>
        </Link>
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
        <span>© 2026 AGI Workforce. Proprietary.</span>
        <span>{POSITIONING.trustBoundary}</span>
      </div>
    </footer>
  );
}
