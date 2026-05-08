import Link from 'next/link';
import { AgiMark } from './AgiMark';

/*
 * Minimal footer. Brand mark left, two compact link columns right, single
 * bottom strip with copyright + region. Same vocabulary as the top bar —
 * no card grids, no trust badges, no logo carousel.
 */

const PRODUCT_LINKS = [
  { href: '/redesign-preview', label: 'Home' },
  { href: '/redesign-preview/providers', label: 'Providers' },
  { href: '/redesign-preview/pricing', label: 'Pricing' },
  { href: '/redesign-preview/byok', label: 'BYOK' },
  { href: '/redesign-preview/local', label: 'Local' },
  { href: '/redesign-preview/compare', label: 'Compare' },
];

const SURFACES_LINKS = [
  { href: '/redesign-preview/desktop', label: 'Desktop' },
  { href: '/redesign-preview/mobile', label: 'Mobile' },
  { href: '/redesign-preview/cli', label: 'CLI' },
  { href: '/redesign-preview/chrome-extension', label: 'Chrome ext' },
  { href: '/redesign-preview/vscode-extension', label: 'VS Code ext' },
  { href: '/redesign-preview/download', label: 'Download' },
];

const COMPANY_LINKS = [
  { href: '/redesign-preview/about', label: 'About' },
  { href: '/redesign-preview/enterprise', label: 'Enterprise' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/security', label: 'Security' },
  { href: '/contact', label: 'Contact' },
];

export function AgiFooter() {
  return (
    <footer className="pv-footer">
      <div className="pv-footer-row">
        <Link href="/redesign-preview" className="pv-footer-mark" aria-label="AGI Workforce home">
          <AgiMark size={18} />
          <span style={{ marginLeft: 8 }}>
            agi<span className="pv-mark-dot">.</span>workforce
          </span>
        </Link>
        <div className="pv-footer-cols">
          <ul className="pv-footer-col">
            <li className="pv-footer-col-title">Product</li>
            {PRODUCT_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="pv-footer-link">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="pv-footer-col">
            <li className="pv-footer-col-title">Surfaces</li>
            {SURFACES_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="pv-footer-link">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="pv-footer-col">
            <li className="pv-footer-col-title">Company</li>
            {COMPANY_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="pv-footer-link">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="pv-footer-strip">
        <span>© 2026 AGI Automation LLC · Austin, Texas</span>
        <span>We do not train on your data.</span>
      </div>
    </footer>
  );
}
