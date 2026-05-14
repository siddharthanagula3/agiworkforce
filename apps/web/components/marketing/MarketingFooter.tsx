import Link from 'next/link';
import { AgiMark } from '../agi/AgiMark';

/*
 * Site-wide marketing footer. Three-column compact layout — Product,
 * Surfaces, Company. Bottom strip with copyright + data policy.
 *
 * Same default export as the previous footer so every page importer
 * keeps working.
 */

const PRODUCT = [
  { href: '/', label: 'Home' },
  { href: '/providers', label: 'Providers' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/byok', label: 'BYOK' },
  { href: '/local', label: 'Local' },
  { href: '/compare', label: 'Compare' },
];

const SURFACES = [
  { href: '/desktop', label: 'Desktop' },
  { href: '/mobile', label: 'Mobile' },
  { href: '/cli', label: 'CLI' },
  { href: '/chrome-extension', label: 'Chrome' },
  { href: '/vscode-extension', label: 'VS Code' },
  { href: '/download', label: 'Download' },
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
    <div data-design="agi" className="agi-chrome-band" style={{ marginTop: 96 }}>
      <footer
        className="agi-footer"
        style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 28px 28px' }}
      >
        <div className="agi-footer-row">
          <Link href="/" className="agi-footer-mark" aria-label="AGI Workforce home">
            <AgiMark size={18} />
            <span style={{ marginLeft: 8 }}>
              agi<span className="agi-mark-dot">.</span>workforce
            </span>
          </Link>
          <div className="agi-footer-cols">
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
        </div>
        <div className="agi-footer-strip">
          <span>© 2026 AGI Automation LLC · Austin, Texas</span>
          <span>We do not train on your data.</span>
        </div>
      </footer>
    </div>
  );
}
