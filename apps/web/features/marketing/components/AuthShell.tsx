import type { ReactNode } from 'react';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { Header } from '@shared/components/layout/Header';
import { Container, Eyebrow, Ledger, type LedgerRow } from './system';
import { SURFACE_STATUS } from '@/lib/marketing-constants';

const ACCOUNT_LEDGER: readonly LedgerRow[] = [
  { label: 'Web', value: `${SURFACE_STATUS.web}: sign in here to pick up where you left off.` },
  {
    label: 'CLI',
    value: `${SURFACE_STATUS.cli}: five signed v1.0.0 archives on /download, same account.`,
  },
  {
    label: 'Desktop',
    value:
      'A Linux build exists as a release artifact and is pending its signature check. No macOS or Windows date yet.',
    quiet: true,
  },
  {
    label: 'Mobile',
    value: 'Not shipped: no listing on the App Store or Google Play.',
    quiet: true,
  },
];

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
        <section className="agi-ds-auth-split">
          <div className="agi-ds-auth-card">{children}</div>
          <aside className="agi-ds-auth-brand" aria-label="Why AGI">
            <h2 className="agi-ds-h2">{title}</h2>
            <p className="agi-ds-prose" data-size="lg" style={{ marginTop: 14 }}>
              {lede}
            </p>
            <ul className="agi-ds-auth-points" style={{ marginTop: 22 }}>
              {points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="agi-ds-card p-5" style={{ width: 'min(100%, 31rem)', marginTop: 28 }}>
              <Eyebrow>What this account gives you today</Eyebrow>
              <div style={{ marginTop: 12 }}>
                <Ledger rows={ACCOUNT_LEDGER} caption="Surface availability" />
              </div>
            </div>
          </aside>
        </section>
      </Container>
    </div>
  );
}
