import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Mobile — Phone as commander, desktop as agent | AGI Workforce',
  description:
    'Tap a task on your phone. Your desktop runs it with full tool access. Watch the trace come back over Realtime. App Store and Google Play coming soon.',
  alternates: { canonical: 'https://agiworkforce.com/mobile' },
};

export default function MobilePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Phone as commander. Desktop as agent.</h1>
          <p className="agi-page-lede">
            Tap a task on your phone. Your desktop runs it with full tool access. Watch the trace
            come back over Realtime.{' '}
            <strong>
              App Store and Google Play listings are not yet live; the apps build cleanly and ship
              as soon as the listings clear.
            </strong>
          </p>
          <div className="agi-cta-row">
            <Link href="/contact" className="agi-cta-primary">
              Notify me on launch
            </Link>
            <Link href="/desktop" className="agi-cta-ghost">
              Get the desktop now →
            </Link>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">How dispatch works</p>
          <ol className="agi-steps">
            <li className="agi-step">
              <span className="agi-step-n">01 / Compose on your phone</span>
              <h3 className="agi-step-h">Compose on your phone</h3>
              <p className="agi-step-body">
                Type or speak the task. Pick the agent and tools. Send.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">02 / Desktop executes</span>
              <h3 className="agi-step-h">Desktop executes</h3>
              <p className="agi-step-body">
                Your desktop picks up the task and runs it with full computer-use access — files,
                browser, terminal, screen.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">03 / Watch the trace</span>
              <h3 className="agi-step-h">Watch the trace</h3>
              <p className="agi-step-body">
                Tool calls and intermediate output stream back to your phone over Realtime. You can
                interrupt, redirect, or take over from the desktop at any point.
              </p>
            </li>
          </ol>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Under the hood</p>
          <table className="agi-ledger">
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
        <MarketingFooter />
      </main>
    </div>
  );
}
