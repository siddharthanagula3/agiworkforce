import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Chrome Extension — AI alongside every webpage | AGI',
  description:
    'A side panel that lives on top of any tab. Read the page, ask a question. Your desktop is the brain. No model runs in the browser.',
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
    label: 'Desktop bridge (planned)',
    body: 'Planned: native messaging to AGI Desktop. All inference runs on your machine. The bridge is the planned architecture, not yet shipped.',
  },
  {
    label: 'BYOK across providers',
    body: 'No model runs in the browser. Keys stay on your desktop; the extension never touches them.',
  },
  {
    label: 'Privacy by design',
    body: 'Page text never sent to a server. It goes to your desktop only.',
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
            question.{' '}
            <strong>
              The extension is the UI. Your desktop is the brain. No model runs in the browser.
            </strong>{' '}
            The extension is in development.
          </p>
          <div className="agi-cta-row">
            <Link href="/contact" className="agi-cta-primary">
              Join the waitlist
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
              <span className="agi-step-n">02 / Planned: native messaging bridge</span>
              <h3 className="agi-step-h">Planned architecture: bridge to your desktop</h3>
              <p className="agi-step-body">
                The planned design routes intent through Chrome&rsquo;s native messaging API to the
                AGI desktop process. This bridge is not yet shipped.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">03 / Planned: desktop executes</span>
              <h3 className="agi-step-h">Planned: desktop executes</h3>
              <p className="agi-step-body">
                In the target architecture, tool calls and model traffic happen on your desktop with
                full BYOK or local-mode access. Results stream back into the side panel.
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
              <h3 className="agi-reason-h">Desktop bridge (planned)</h3>
              <p className="agi-reason-p">
                Planned: native messaging to AGI Desktop so all inference runs on your machine, not
                in the browser.
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
                <td>Planned: native messaging on localhost:8787 (not yet shipped)</td>
              </tr>
              <tr>
                <td>Browser model</td>
                <td>None — desktop runs all inference</td>
              </tr>
              <tr>
                <td>Web Store</td>
                <td>Coming soon — join the waitlist for early access</td>
              </tr>
            </tbody>
          </table>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
