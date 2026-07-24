import type { ReactNode } from 'react';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from './MarketingFooter';

/**
 * AuthShell · shared chrome for /login and /signup.
 *
 * Split layout: the Clerk card first in the DOM (auth is the page's job, so
 * it leads focus order and stacks first on small screens), the brand panel
 * carrying the trust-mode story placed in the left column on desktop via
 * grid. Styled by the `agi-auth-*` classes in globals.css (token-driven,
 * follows the light/dark marketing theme).
 */
export function AuthShell({
  title,
  lede,
  points,
  children,
  embedded = false,
}: {
  title: string;
  lede: string;
  points: string[];
  children: ReactNode;
  embedded?: boolean;
}) {
  if (embedded) {
    return (
      <div data-design="agi">
        <main className="agi-auth-embedded-shell" data-testid="desktop-auth-shell">
          <div className="agi-auth-card">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header minimal />
        <section className="agi-auth-page agi-auth-split">
          <div className="agi-auth-card">{children}</div>
          <aside className="agi-auth-brand" aria-label="Why AGI">
            <div className="agi-auth-logo">
              <AgiMark size={36} spinning />
              <span className="agi-auth-logo-name">AGI</span>
            </div>
            <h2 className="agi-auth-title">{title}</h2>
            <p className="agi-auth-lede">{lede}</p>
            <ul className="agi-auth-points">
              {points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p className="agi-auth-meta">Web · Desktop · Mobile · CLI · Chrome · VS Code</p>
          </aside>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
