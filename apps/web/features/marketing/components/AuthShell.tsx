import type { ReactNode } from 'react';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from './MarketingFooter';

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
          <section className="agi-auth-embedded-frame" aria-label="AGI Desktop Cloud sign-in">
            <header className="agi-auth-embedded-header">
              <div className="agi-auth-embedded-brand">
                <span className="agi-auth-orbit agi-auth-orbit--compact" aria-hidden="true">
                  <AgiMark size={26} spinning />
                </span>
                <span>AGI Desktop</span>
              </div>
              <span className="agi-auth-secure-badge">Secure Cloud sign-in</span>
            </header>
            <div className="agi-auth-card">{children}</div>
            <p className="agi-auth-embedded-note">Local Mode stays available without an account.</p>
          </section>
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
              <span className="agi-auth-orbit" aria-hidden="true">
                <AgiMark size={34} spinning />
              </span>
              <span className="agi-auth-logo-name">AGI</span>
            </div>
            <h2 className="agi-auth-title">{title}</h2>
            <p className="agi-auth-lede">{lede}</p>
            <div className="agi-auth-continuity">
              <p className="agi-auth-continuity-title">One account. Three surfaces.</p>
              <ul className="agi-auth-surface-list" aria-label="AGI account surfaces">
                {[
                  ['Web', 'Start here'],
                  ['Desktop', 'Continue securely'],
                  ['Mobile', 'Stay in sync'],
                ].map(([surface, description]) => (
                  <li key={surface}>
                    <span className="agi-auth-surface-node" aria-hidden="true" />
                    <span>
                      <strong>{surface}</strong>
                      <small>{description}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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
