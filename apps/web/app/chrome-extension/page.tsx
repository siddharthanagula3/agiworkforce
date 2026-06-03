import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Chrome Extension: AI alongside every webpage',
  description: `A Chrome side panel for page-aware AGI workflows. ${POSITIONING.wedge} ${LAUNCH.publicLabel}.`,
  alternates: { canonical: 'https://agiworkforce.com/chrome-extension' },
};

function ExtensionProductView({ label, description }: { label: string; description: string }) {
  return (
    <div
      style={{
        background: 'var(--agi-card)',
        border: '1px solid var(--agi-rule-strong)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Browser chrome bar */}
      <div
        style={{
          background: 'var(--agi-bg-3)',
          borderBottom: '1px solid var(--agi-rule)',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--agi-rule-strong)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--agi-rule-strong)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--agi-rule-strong)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            marginLeft: 8,
            fontSize: 11,
            color: 'var(--agi-ink-quiet)',
            fontFamily: 'var(--mono)',
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          padding: '32px 24px',
          minHeight: 160,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          background: 'linear-gradient(135deg, var(--agi-card) 0%, var(--agi-amber-soft) 100%)',
        }}
      >
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--agi-amber)',
            margin: 0,
          }}
        >
          Product view
        </p>
        <p
          style={{
            fontSize: 14,
            color: 'var(--agi-ink-2)',
            textAlign: 'center',
            maxWidth: 320,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    label: 'Side panel chat',
    body: 'Persistent side panel alongside any tab. The conversation carries page context automatically.',
  },
  {
    label: 'Page reader',
    body: 'Content scripts extract structured text from articles, docs, and tickets. No copy-paste.',
  },
  {
    label: 'Desktop bridge',
    body: 'Native messaging to AGI Desktop lets the extension use Local, BYOK, or invited Cloud without storing model keys in Chrome.',
  },
  {
    label: 'BYOK across providers',
    body: 'Model execution does not happen inside the extension. Keys stay in the selected Local, BYOK, or invited Cloud boundary.',
  },
  {
    label: 'Privacy by design',
    body: 'Page context follows the selected trust boundary: Local desktop, chosen BYOK provider, or invited Cloud.',
  },
];

export default function ChromeExtensionPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow" style={{ marginBottom: 12 }}>
            {LAUNCH.publicLabel}
          </p>
          <h1 className="agi-page-h1">AI alongside every webpage.</h1>
          <p className="agi-page-lede">
            A side panel that lives on top of any tab. Read the page you&rsquo;re on, ask a
            question.{' '}
            <strong>The extension is the UI. Desktop, BYOK, or invited Cloud is the brain.</strong>{' '}
            {POSITIONING.trustBoundary}
          </p>
          <div className="agi-cta-row">
            <Link href="/download" className="agi-cta-primary">
              {LAUNCH.ctaLabel}
            </Link>
            <Link href="/desktop" className="agi-cta-ghost">
              Pair with desktop &rarr;
            </Link>
          </div>
        </section>

        {/* ---- SCREENSHOTS ---- */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">How it looks</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            <ExtensionProductView
              label="Side panel: chat alongside any tab"
              description="AGI side panel open next to a GitHub pull request. Ask about the diff, request a summary, or run a slash command."
            />
            <ExtensionProductView
              label="Page reader"
              description="Content scripts extract structured text from articles, docs, and tickets. No copy-paste needed."
            />
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
              <h3 className="agi-step-h">Bridge to your desktop</h3>
              <p className="agi-step-body">
                Intent routes through Chrome&rsquo;s native messaging API to the AGI desktop process
                when the user chooses Local or BYOK execution.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">03 / Desktop executes</span>
              <h3 className="agi-step-h">Desktop executes</h3>
              <p className="agi-step-body">
                Tool calls and model traffic happen through the selected trust boundary. Results
                stream back into the side panel with the active route visible.
              </p>
            </li>
          </ol>
        </section>

        {/* ---- FEATURES GRID ---- */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">Features</p>
          <ul className="agi-perks-grid" style={{ marginTop: 24 }} aria-label="Extension features">
            {FEATURES.map((f) => (
              <li key={f.label} className="agi-perk-card">
                <p className="agi-perk-title">{f.label}</p>
                <p className="agi-perk-description">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Built-in</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Side panel chat</h3>
              <p className="agi-reason-p">
                Persistent side panel alongside any tab. The conversation carries page context
                automatically.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Page reader</h3>
              <p className="agi-reason-p">
                Content scripts extract structured text from articles, docs, and tickets. No
                copy-paste.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Desktop bridge</h3>
              <p className="agi-reason-p">
                Native messaging to AGI Desktop keeps model keys and local tools out of the browser
                extension process.
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
                <td>Native messaging to AGI Desktop on the July 12 public release path</td>
              </tr>
              <tr>
                <td>Browser model</td>
                <td>None; desktop runs all inference</td>
              </tr>
              <tr>
                <td>Web Store</td>
                <td>Public release aligned to {LAUNCH.date}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
