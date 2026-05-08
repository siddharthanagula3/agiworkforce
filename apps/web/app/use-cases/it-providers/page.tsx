import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'IT service providers — AGI Workforce',
  description:
    'How MSPs and IT shops use AGI Workforce: triage, runbooks, ticket-grade automation, and operations across multi-provider AI.',
  alternates: { canonical: 'https://agiworkforce.com/use-cases/it-providers' },
};

export default function ItProvidersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">IT service providers.</h1>
          <p className="agi-page-lede">
            Triage, runbooks, and ticket-grade automation across every tool your operators already
            touch.{' '}
            <strong>
              Computer use plus MCP plugins plus a real CLI — so the agent can do the thing, not
              just describe it.
            </strong>
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Where it shows up</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Triage</h3>
              <p className="agi-reason-p">
                Read tickets, classify, summarize prior context, propose next steps. Branch into
                deeper investigation only when the cheap path doesn&rsquo;t suffice.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Runbooks</h3>
              <p className="agi-reason-p">
                Encode runbooks as MCP tools. Agents execute them with full audit, sandboxed by
                default — macOS Seatbelt or Linux bwrap.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">CI-style operations</h3>
              <p className="agi-reason-p">
                <code>agiworkforce exec</code> in headless mode for scripted incident workflows.
                Pipe in a ticket, get a structured response back.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Posture</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Sandboxed tools</td>
                <td>Dangerous tools (file writes, shell, network) sandboxed by default.</td>
              </tr>
              <tr>
                <td>Provider routing</td>
                <td>
                  Cheap models for triage, flagship for the hard 1%. Cross-provider in one thread.
                </td>
              </tr>
              <tr>
                <td>Audit trail</td>
                <td>Journaled tool calls, replayable sessions, exportable to your SIEM.</td>
              </tr>
              <tr>
                <td>BYOK enforcement</td>
                <td>Force BYOK org-wide. Zero managed-cloud spend unless you opt in.</td>
              </tr>
            </tbody>
          </table>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/enterprise" className="agi-cta-primary">
              Talk to enterprise
            </Link>
            <Link href="/cli" className="agi-cta-ghost">
              See the CLI →
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
