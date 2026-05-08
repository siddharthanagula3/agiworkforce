import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Status | AGI Workforce',
  description: 'Operational status of AGI Workforce services — gateway, web, signaling, providers.',
  alternates: { canonical: 'https://agiworkforce.com/status' },
};

const COMPONENTS: {
  name: string;
  status: 'ok' | 'degraded' | 'down' | 'maintenance';
  note: string;
}[] = [
  { name: 'Web (agiworkforce.com)', status: 'ok', note: 'Vercel edge.' },
  {
    name: 'API gateway (/api/llm/v1)',
    status: 'ok',
    note: 'Express on Fly.io. BYOK + managed routing.',
  },
  { name: 'Signaling server', status: 'ok', note: 'WebRTC signaling, deployed on Fly.io.' },
  { name: 'Supabase (us-east-2)', status: 'ok', note: 'Auth, storage, Realtime.' },
  {
    name: 'Providers (BYOK passthrough)',
    status: 'ok',
    note: 'Status follows the provider you target.',
  },
];

const STATUS_COPY: Record<(typeof COMPONENTS)[number]['status'], { label: string; color: string }> =
  {
    ok: { label: 'Operational', color: 'var(--agi-ink)' },
    degraded: { label: 'Degraded', color: 'var(--agi-amber)' },
    down: { label: 'Down', color: '#ff6b6b' },
    maintenance: { label: 'Maintenance', color: 'var(--agi-amber)' },
  };

export default function StatusPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Status.</h1>
          <p className="agi-page-lede">
            Operational status of every AGI Workforce service.{' '}
            <strong>
              For active incidents, follow{' '}
              <a
                href="https://twitter.com/agiworkforce"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--agi-ink)' }}
              >
                @agiworkforce
              </a>{' '}
              on X — we post the moment we know.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Components</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {COMPONENTS.map((c) => (
                <tr key={c.name}>
                  <td style={{ width: '32%' }}>{c.name}</td>
                  <td style={{ color: STATUS_COPY[c.status].color, fontWeight: 600 }}>
                    ● {STATUS_COPY[c.status].label}
                  </td>
                  <td>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Reach us</p>
          <div className="agi-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-cta-primary">
              Email an incident
            </a>
            <Link href="/security" className="agi-cta-ghost">
              Security posture →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
