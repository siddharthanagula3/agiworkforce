import type { ReactNode } from 'react';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { Header } from '@shared/components/layout/Header';
import { Container } from './system';

export function AuthShell({
  children,
  embedded = false,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
  if (embedded) {
    return (
      <div data-design="agi">
        <main className="agi-ds-auth-embedded-shell" data-testid="desktop-auth-shell">
          <section className="agi-ds-auth-embedded-frame" aria-label="AGI Desktop Cloud sign-in">
            <header className="agi-ds-auth-embedded-header">
              <div className="agi-ds-auth-embedded-brand">
                <AgiMark size={26} />
                <span>AGI Desktop</span>
              </div>
              <span className="agi-ds-auth-secure-badge">Secure Cloud sign-in</span>
            </header>
            <div className="agi-ds-auth-card">{children}</div>
            <p className="agi-ds-auth-embedded-note">
              Local Mode stays available without an account.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header minimal />
      <Container>
        <section className="agi-ds-auth-centered">
          <div className="agi-ds-auth-card">{children}</div>
        </section>
      </Container>
    </div>
  );
}
