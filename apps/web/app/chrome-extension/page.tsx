import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Chrome Extension — AI alongside every webpage | AGI',
  description:
    'A side panel that lives on top of any tab. Read the page, ask a question, get a tool call back. The extension is the UI; your desktop is the brain. No model runs in the browser.',
  alternates: { canonical: 'https://agiworkforce.com/chrome-extension' },
};

/** Inline screenshot placeholder card — no images needed at launch. */
function ScreenshotPlaceholder({ label, description }: { label: string; description: string }) {
  return (
    <div
      style={{
        background: 'var(--agi-card)',
        border: '1px solid var(--agi-rule-strong)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Mock browser chrome bar */}
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
      {/* Placeholder body */}
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
          Screenshot
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
    label: 'Platform assistants',
    body: 'Context-aware on Slack, Gmail, Google Calendar, Google Docs, and GitHub. Triggered by URL pattern.',
  },
  {
    label: 'Job autofill',
    body: 'One-click application autofill on LinkedIn and Lever. Pulls profile context from your settings.',
  },
  {
    label: 'Quick popup',
    body: 'Click the toolbar icon for one-off questions without opening the side panel.',
  },
  {
    label: 'Desktop bridge',
    body: 'Native messaging to AGI Desktop on localhost:8787. All inference runs on your machine.',
  },
  {
    label: 'BYOK across providers',
    body: 'No model runs in the browser. Keys stay on your desktop; the extension never touches them.',
  },
  {
    label: 'Privacy by design',
    body: 'Zero telemetry on AI screens. Page text never sent to a server — it goes to your desktop only.',
  },
];

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
            <ScreenshotPlaceholder
              label="Side panel — chat alongside any tab"
              description="AGI side panel open next to a GitHub pull request. Ask about the diff, request a summary, or run a slash command."
            />
            <ScreenshotPlaceholder
              label="Platform assistant — Gmail"
              description="Context card appears automatically on Gmail. Summarize thread, draft reply, or extract action items in one click."
            />
            <ScreenshotPlaceholder
              label="Quick popup — one-off questions"
              description="Toolbar icon popup for fast queries. No side panel needed. Answer streams back in under a second over the desktop bridge."
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
              <h3 className="agi-step-h">Bridge to your desktop on localhost:8787</h3>
              <p className="agi-step-body">
                The intent flows through Chrome&rsquo;s native messaging API to the AGI desktop
                process running on your machine.
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
