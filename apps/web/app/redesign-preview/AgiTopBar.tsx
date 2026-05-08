import Link from 'next/link';
import { AgiMark } from './AgiMark';

/*
 * Shared top bar for every page in the redesign preview surface.
 * Six links + brand mark. Renders identically on every page so the surface
 * reads as one product, not separate marketing pages.
 */

const NAV = [
  { href: '/redesign-preview/providers', label: 'Providers' },
  { href: '/redesign-preview/pricing', label: 'Pricing' },
  { href: '/redesign-preview/compare', label: 'Compare' },
  { href: '/redesign-preview/about', label: 'About' },
];

export function AgiTopBar() {
  return (
    <header className="pv-top">
      <Link href="/redesign-preview" className="pv-mark" aria-label="AGI Workforce home">
        <AgiMark size={20} />
        <span style={{ marginLeft: 8 }}>
          agi<span className="pv-mark-dot">.</span>workforce
        </span>
      </Link>
      <nav className="pv-top-right" aria-label="Primary">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="pv-top-link">
            {item.label}
          </Link>
        ))}
        <Link href="/login" className="pv-top-link">
          Sign in
        </Link>
        <Link href="/download" className="pv-top-cta">
          Install
        </Link>
      </nav>
    </header>
  );
}
