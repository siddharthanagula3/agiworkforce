'use client';

import Link from 'next/link';
import { formatPrivacyModeLabel } from '@agiworkforce/types';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';

export default function GetStartedPage() {
  const localLabel = formatPrivacyModeLabel('local');
  const byokLabel = formatPrivacyModeLabel('byok');

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Get started.</h1>
          <p className="agi-page-lede">
            Five minutes from zero to a working chat across multiple providers.{' '}
            <strong>
              {LAUNCH.publicLabel}. {POSITIONING.trustBoundary}
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">01 / Install</p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">~/agi-workforce — three install paths</div>
            <pre className="agi-terminal-pre">{`# Homebrew (macOS, Linux)
$ brew install agiworkforce/tap/agiworkforce

# cargo from source (Rust 1.94+)
$ cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli --bin agi

# curl (macOS, Linux, WSL)
$ curl -fsSL https://agiworkforce.com/install.sh | bash`}</pre>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">02 / Pick a mode</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">{localLabel} — free forever</h3>
              <p className="agi-reason-p">
                Run <code>agi models scan</code>, then{' '}
                <code>agi --provider ollama --model &lt;model&gt;</code> after installing Ollama. No
                keys, no quotas, fully offline.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">{byokLabel} — free forever</h3>
              <p className="agi-reason-p">
                <code>agi login</code>. Paste your provider key. Encrypted on device.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Managed cloud waitlist</h3>
              <p className="agi-reason-p">
                Request an invite code if you want AGI-hosted compute later. Local and BYOK stay
                free acquisition paths.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">03 / Try it</p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">first command</div>
            <pre className="agi-terminal-pre">{`$ agi exec "sketch a Rust HTTP router"
$ agi
# interactive TUI`}</pre>
          </div>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/download" className="agi-cta-primary">
              Download desktop
            </Link>
            <Link href="/cli" className="agi-cta-ghost">
              CLI reference →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
