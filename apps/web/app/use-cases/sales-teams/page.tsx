import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Sales teams — AGI Workforce',
  description:
    'How revenue teams use AGI Workforce: research, outreach drafts, deal-room briefings, and pipeline triage across every AI provider.',
  alternates: { canonical: 'https://agiworkforce.com/use-cases/sales-teams' },
};

export default function SalesTeamsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Sales teams.</h1>
          <p className="agi-page-lede">
            Research, outreach drafts, deal-room briefings, and pipeline triage —{' '}
            <strong>without sending account context to a vendor that owns one model.</strong> Bring
            your own keys, route to whichever provider answers your shape of question best.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Where it shows up</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Account research</h3>
              <p className="agi-reason-p">
                Pull the public record on a target — filings, releases, hiring, news — into a brief.
                Switch providers depending on what they&rsquo;re strongest at.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Outreach drafts</h3>
              <p className="agi-reason-p">
                Draft messages in your team&rsquo;s tone. The model sees your prior outreach as
                context if you&rsquo;ve given it permission to.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Deal-room prep</h3>
              <p className="agi-reason-p">
                Cross-provider continuity matters here: long-context model for the data room, prose
                model for the narrative summary, all in one thread.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Posture for revenue teams</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Confidentiality</td>
                <td>Local mode for sensitive deals. Keys stay on device.</td>
              </tr>
              <tr>
                <td>BYOK</td>
                <td>Pay providers directly. No markup. Use your existing API budget.</td>
              </tr>
              <tr>
                <td>Tool use</td>
                <td>CRM and email through MCP plugins. Agent acts, not just suggests.</td>
              </tr>
              <tr>
                <td>Audit</td>
                <td>Every model call and tool action journaled.</td>
              </tr>
            </tbody>
          </table>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/download" className="agi-cta-primary">
              Install
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
