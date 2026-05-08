import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Chrome Extension — AI alongside every webpage | AGI Workforce',
  description:
    'A side panel that lives on top of any tab. Read the page, ask a question, get a tool call back. The extension is the UI; your desktop is the brain. No model runs in the browser.',
  alternates: { canonical: 'https://agiworkforce.com/chrome-extension' },
};

export default function ChromeExtensionPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">AI alongside every webpage.</h1>
          <p className="agi-page-lede">
            A side panel that lives on top of any tab. Read the page you&rsquo;re on, ask a
            question, get a tool call back.{' '}
            <strong>
              The extension is the UI. Your desktop is the brain. No model runs in the browser.
            </strong>
          </p>
          <div className="agi-cta-row">
            <Link href="/download" className="agi-cta-primary">
              Install dev build
            </Link>
            <Link href="/desktop" className="agi-cta-ghost">
              Pair with desktop →
            </Link>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">The architecture</p>
          <ol className="agi-steps">
            <li className="agi-step">
              <span className="agi-step-n">01 / Browser captures intent</span>
              <h3 className="agi-step-h">Browser captures intent</h3>
              <p className="agi-step-body">
                Side panel + content scripts read the active tab and your composed prompt. No keys,
                no inference, no model traffic in the browser process.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">02 / Native messaging bridge</span>
              <h3 className="agi-step-h">Bridge to your desktop on localhost:8787</h3>
              <p className="agi-step-body">
                The intent flows through Chrome&rsquo;s native messaging API to the AGI Workforce
                desktop process running on your machine.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">03 / Desktop executes</span>
              <h3 className="agi-step-h">Desktop executes</h3>
              <p className="agi-step-body">
                Tool calls and model traffic happen on your desktop with full BYOK or local-mode
                access. Results stream back into the side panel.
              </p>
            </li>
          </ol>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Built-in</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Side panel + popup</h3>
              <p className="agi-reason-p">
                Chat alongside any tab. Quick-access popup for one-off questions.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Platform assistants</h3>
              <p className="agi-reason-p">
                Context-aware on Slack, Gmail, Calendar, Docs, GitHub. Triggered automatically.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Job autofill</h3>
              <p className="agi-reason-p">
                One-click application autofill on LinkedIn and Lever. Pulls your profile context.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Distribution</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Manifest</td>
                <td>Chrome MV3</td>
              </tr>
              <tr>
                <td>Bridge</td>
                <td>Native messaging on localhost:8787</td>
              </tr>
              <tr>
                <td>Browser model</td>
                <td>None — desktop runs all inference</td>
              </tr>
              <tr>
                <td>Web Store</td>
                <td>Listing in review — install the dev build until then</td>
              </tr>
            </tbody>
          </table>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
