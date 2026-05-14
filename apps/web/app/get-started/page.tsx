'use client';

import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export default function GetStartedPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Get started.</h1>
          <p className="agi-page-lede">
            Five minutes from zero to a working chat across multiple providers.{' '}
            <strong>Pick your install path, log in or skip auth, and try it.</strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">01 / Install</p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">~/agi-workforce — three install paths</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-comment"># Homebrew (macOS, Linux)</span>
              {'\n'}
              <span className="agi-terminal-prompt">$</span>brew install
              siddharthanagula3/tap/agiworkforce
              {'\n'}
              {'\n'}
              <span className="agi-terminal-comment"># cargo (any platform)</span>
              {'\n'}
              <span className="agi-terminal-prompt">$</span>cargo install agiworkforce-cli
              {'\n'}
              {'\n'}
              <span className="agi-terminal-comment"># curl (macOS, Linux, WSL)</span>
              {'\n'}
              <span className="agi-terminal-prompt">$</span>curl -fsSL
              https://agiworkforce.com/install.sh | sh
            </pre>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">02 / Pick a mode</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Local — free forever</h3>
              <p className="agi-reason-p">
                <code>agiworkforce --provider ollama</code> after installing Ollama. No keys, no
                quotas, fully offline.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">BYOK — free forever</h3>
              <p className="agi-reason-p">
                <code>agiworkforce login</code>. Paste your provider key. Encrypted on device.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Hobby cloud</h3>
              <p className="agi-reason-p">
                Sign in to our managed cloud. We handle the keys; you just chat.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">03 / Try it</p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">first command</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-prompt">$</span>agiworkforce exec &quot;sketch a Rust
              HTTP router&quot;
              {'\n'}
              <span className="agi-terminal-prompt">$</span>agiworkforce
              {'\n'}
              <span className="agi-terminal-comment"># interactive TUI</span>
            </pre>
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
