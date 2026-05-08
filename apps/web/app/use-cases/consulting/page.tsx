import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Consulting firms — AGI Workforce',
  description:
    'How consulting practices use AGI Workforce: research, deliverables, data analysis, and reporting at scale across multiple AI providers.',
  alternates: { canonical: 'https://agiworkforce.com/use-cases/consulting' },
};

export default function ConsultingPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Consulting firms.</h1>
          <p className="agi-page-lede">
            Research, deliverables, data analysis, and client reporting — across every cloud
            provider you bring keys to.{' '}
            <strong>
              Switch from Claude (long-form prose) to Gemini (long-context spreadsheet) to GPT
              (tool-heavy automation) inside one engagement, without losing the thread.
            </strong>
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Where it shows up</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Research</h3>
              <p className="agi-reason-p">
                Read whole repositories of prior decks, transcripts, and primary sources. Hand off
                synthesis to whichever model handles your shape of context best.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Deliverables</h3>
              <p className="agi-reason-p">
                Draft analyses, executive summaries, and slide narratives in your house tone. The
                conversation history travels across model switches.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Reporting at scale</h3>
              <p className="agi-reason-p">
                Run the same analysis prompt across many client datasets in parallel through the
                CLI. Headless mode for CI-style pipelines.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">What partners ask for</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Provider choice</td>
                <td>BYOK against any cloud — pay providers directly. No markup.</td>
              </tr>
              <tr>
                <td>Confidentiality</td>
                <td>Local mode for sensitive engagements. AES-256-GCM key storage.</td>
              </tr>
              <tr>
                <td>Audit trail</td>
                <td>
                  Every prompt and tool call journaled. Exportable to your engagement&rsquo;s
                  records.
                </td>
              </tr>
              <tr>
                <td>Team scale</td>
                <td>Enterprise SSO/SCIM and per-engagement retention windows.</td>
              </tr>
            </tbody>
          </table>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/enterprise" className="agi-cta-primary">
              Talk to enterprise
            </Link>
            <Link href="/byok" className="agi-cta-ghost">
              How BYOK works →
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
