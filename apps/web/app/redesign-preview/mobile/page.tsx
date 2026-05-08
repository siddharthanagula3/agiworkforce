import Link from 'next/link';
import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

export default function RedesignPreviewMobilePage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">Phone as commander. Desktop as agent.</h1>
        <p className="pv-page-lede">
          Tap a task on your phone. Your desktop runs it with full tool access. Watch the trace come
          back over Realtime.{' '}
          <strong>
            App Store and Google Play listings are not yet live; the apps build cleanly and ship as
            soon as the listings clear.
          </strong>
        </p>
        <div className="pv-cta-row">
          <Link href="/contact" className="pv-cta-primary">
            Notify me on launch
          </Link>
          <Link href="/redesign-preview/desktop" className="pv-cta-ghost">
            Get the desktop now →
          </Link>
        </div>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">How dispatch works</p>
        <ol className="pv-steps">
          <li className="pv-step">
            <span className="pv-step-n">01 / Compose on your phone</span>
            <h3 className="pv-step-h">Compose on your phone</h3>
            <p className="pv-step-body">Type or speak the task. Pick the agent and tools. Send.</p>
          </li>
          <li className="pv-step">
            <span className="pv-step-n">02 / Desktop executes</span>
            <h3 className="pv-step-h">Desktop executes</h3>
            <p className="pv-step-body">
              Your desktop picks up the task and runs it with full computer-use access — files,
              browser, terminal, screen.
            </p>
          </li>
          <li className="pv-step">
            <span className="pv-step-n">03 / Watch the trace</span>
            <h3 className="pv-step-h">Watch the trace</h3>
            <p className="pv-step-body">
              Tool calls and intermediate output stream back to your phone over Realtime. You can
              interrupt, redirect, or take over from the desktop at any point.
            </p>
          </li>
        </ol>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Under the hood</p>
        <table className="pv-ledger">
          <tbody>
            <tr>
              <td>Framework</td>
              <td>Expo + React Native</td>
            </tr>
            <tr>
              <td>Storage</td>
              <td>MMKV + biometric + secure storage</td>
            </tr>
            <tr>
              <td>Realtime</td>
              <td>Supabase Realtime over WSS</td>
            </tr>
            <tr>
              <td>iOS bundle ID</td>
              <td>com.agiworkforce.app</td>
            </tr>
            <tr>
              <td>Modes</td>
              <td>Cloud only — local mode is desktop-only</td>
            </tr>
          </tbody>
        </table>
      </section>

      <AgiFooter />
    </main>
  );
}
