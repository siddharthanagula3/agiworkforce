import type { ReactNode } from 'react';
import { AgiMark } from '../agi/AgiMark';
import { Header } from '../layout/Header';
import { MarketingFooter } from './MarketingFooter';

/**
 * AuthShell · shared chrome for /login and /signup.
 *
 * Split layout: a brand panel carrying the trust-mode story on the left,
 * the Clerk card on the right. Collapses to a single centered column on
 * small screens. Styled by the `agi-auth-*` classes in globals.css
 * (token-driven, follows the light/dark marketing theme).
 */
export function AuthShell({
  title,
  lede,
  points,
  children,
}: {
  title: string;
  lede: string;
  points: string[];
  children: ReactNode;
}) {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header minimal />
        <section className="agi-auth-page agi-auth-split">
          <aside className="agi-auth-brand" aria-label="Why AGI">
            <div className="agi-auth-logo">
              <AgiMark size={52} spinning />
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
          <div className="agi-auth-card">{children}</div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
