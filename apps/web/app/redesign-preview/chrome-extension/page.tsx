import Link from 'next/link';
import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

export default function RedesignPreviewChromeExtensionPage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">AI alongside every webpage.</h1>
        <p className="pv-page-lede">
          A side panel that lives on top of any tab. Read the page you&rsquo;re on, ask a question,
          get a tool call back.{' '}
          <strong>
            The extension is the UI. Your desktop is the brain. No model runs in the browser.
          </strong>
        </p>
        <div className="pv-cta-row">
          <Link href="/download" className="pv-cta-primary">
            Install dev build
          </Link>
          <Link href="/redesign-preview/desktop" className="pv-cta-ghost">
            Pair with desktop →
          </Link>
        </div>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">The architecture</p>
        <ol className="pv-steps">
          <li className="pv-step">
            <span className="pv-step-n">01 / Browser captures intent</span>
            <h3 className="pv-step-h">Browser captures intent</h3>
            <p className="pv-step-body">
              Side panel + content scripts read the active tab and your composed prompt. No keys, no
              inference, no model traffic in the browser process.
            </p>
          </li>
          <li className="pv-step">
            <span className="pv-step-n">02 / Native messaging bridge</span>
            <h3 className="pv-step-h">Bridge to your desktop on localhost:8787</h3>
            <p className="pv-step-body">
              The intent flows through Chrome&rsquo;s native messaging API to the AGI Workforce
              desktop process running on your machine.
            </p>
          </li>
          <li className="pv-step">
            <span className="pv-step-n">03 / Desktop executes</span>
            <h3 className="pv-step-h">Desktop executes</h3>
            <p className="pv-step-body">
              Tool calls and model traffic happen on your desktop with full BYOK or local-mode
              access. Results stream back into the side panel.
            </p>
          </li>
        </ol>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Built-in</p>
        <ul className="pv-reasons">
          <li className="pv-reason">
            <h3 className="pv-reason-h">Side panel + popup</h3>
            <p className="pv-reason-p">
              Chat alongside any tab. Quick-access popup for one-off questions.
            </p>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">Platform assistants</h3>
            <p className="pv-reason-p">
              Context-aware on Slack, Gmail, Calendar, Docs, GitHub. Triggered automatically.
            </p>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">Job autofill</h3>
            <p className="pv-reason-p">
              One-click application autofill on LinkedIn and Lever. Pulls your profile context.
            </p>
          </li>
        </ul>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Distribution</p>
        <table className="pv-ledger">
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

      <AgiFooter />
    </main>
  );
}
