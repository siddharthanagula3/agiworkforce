import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Subprocessors | AGI Workforce',
  description:
    'Third parties that process customer data on AGI Workforce&rsquo;s behalf, with their purpose and region.',
  alternates: { canonical: 'https://agiworkforce.com/subprocessors' },
};

const SUBS: { name: string; purpose: string; region: string }[] = [
  {
    name: 'Supabase (Postgres + auth + Realtime + storage)',
    purpose: 'Primary data store, authentication, real-time sync, file storage.',
    region: 'us-east-2',
  },
  {
    name: 'Vercel',
    purpose: 'Hosting and edge delivery for the web surface (agiworkforce.com).',
    region: 'Global edge',
  },
  { name: 'Fly.io', purpose: 'API gateway and signaling-server runtime.', region: 'us-east' },
  { name: 'Stripe', purpose: 'Payment processing for paid tiers.', region: 'United States' },
  {
    name: 'Resend',
    purpose: 'Transactional email (account, billing, support).',
    region: 'United States',
  },
  {
    name: 'Cloudflare',
    purpose: 'DDoS protection, edge caching for the marketing site.',
    region: 'Global edge',
  },
];

export default function SubprocessorsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Subprocessors.</h1>
          <p className="agi-page-lede">
            Third parties that process customer data on our behalf.{' '}
            <strong>
              When this list changes, we update it here and notify customers on Enterprise contracts
              30 days in advance.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Current subprocessors</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Subprocessor</th>
                <th>Purpose</th>
                <th>Region</th>
              </tr>
            </thead>
            <tbody>
              {SUBS.map((s) => (
                <tr key={s.name}>
                  <td style={{ width: '32%', verticalAlign: 'top' }}>{s.name}</td>
                  <td>{s.purpose}</td>
                  <td style={{ width: '18%', color: 'var(--agi-ink-quiet)' }}>{s.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What about LLM providers?</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            When you BYOK against Anthropic, OpenAI, Google, or any other provider, that provider
            becomes a processor of <em>your</em> data, on <em>your</em> contract — not ours. We do
            not process your prompts; the request flows directly from your client to the provider
            you targeted. See{' '}
            <Link href="/byok" style={{ color: 'var(--agi-ink)' }}>
              BYOK
            </Link>{' '}
            for the full posture.
          </p>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
