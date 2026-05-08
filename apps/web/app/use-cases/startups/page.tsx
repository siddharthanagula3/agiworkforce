import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Startups — AGI Workforce',
  description:
    'How startups use AGI Workforce: ship product faster with multi-provider AI, BYOK, and a CLI that fits CI.',
  alternates: { canonical: 'https://agiworkforce.com/use-cases/startups' },
};

export default function StartupsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Startups.</h1>
          <p className="agi-page-lede">
            Ship faster. Pay for inference at provider rates, not someone else&rsquo;s margin.{' '}
            <strong>
              Use the CLI in CI, the desktop for hard problems, the Chrome extension for inbox and
              docs — same chat history, same model picker, three keys in your vault.
            </strong>
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Why startups pick this shape</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">No lock-in</h3>
              <p className="agi-reason-p">
                Provider preferences change quarterly. We let you switch without moving your
                conversation history or rebuilding your tool integrations.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Real CI</h3>
              <p className="agi-reason-p">
                <code>agiworkforce exec</code> works as a Unix tool. Pipe a task, get JSON. Use in
                GitHub Actions, in scripts, anywhere a shell runs.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Cheap experiments</h3>
              <p className="agi-reason-p">
                Local mode is free forever. BYOK pays providers at their public rate. The expensive
                tier is opt-in, not the default.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">What you actually get</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Cost posture</td>
                <td>Local + BYOK free forever. Hobby $10/mo or $5/mo annual.</td>
              </tr>
              <tr>
                <td>Surface coverage</td>
                <td>Desktop, CLI, web, mobile, Chrome extension, VS Code extension.</td>
              </tr>
              <tr>
                <td>Provider count</td>
                <td>10+ wired in. Plus any OpenAI-compatible BYO endpoint.</td>
              </tr>
              <tr>
                <td>Privacy</td>
                <td>We don&rsquo;t train on your data. Local mode never leaves your laptop.</td>
              </tr>
            </tbody>
          </table>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/download" className="agi-cta-primary">
              Install
            </Link>
            <Link href="/pricing" className="agi-cta-ghost">
              See pricing →
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
