'use client';

import Link from 'next/link';
import { formatPrivacyModeLabel } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
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
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">In the browser. Nothing to install.</h3>
              <p className="agi-reason-p">
                <Link href="/login?redirectTo=%2F">Try AGI Web</Link> for hosted chat, projects, and
                artifacts today.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Desktop &amp; CLI: Local and BYOK hosts</h3>
              <p className="agi-reason-p">
                Coming soon for macOS, Windows, and Linux (the <code>agi</code> CLI: macOS and
                Linux). Leave your email on the <Link href="/download">download page</Link> and
                we&rsquo;ll tell you when they&rsquo;re ready.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Mobile, Chrome &amp; VS Code</h3>
              <p className="agi-reason-p">
                Availability per surface lives on the <Link href="/download">download page</Link>{' '}
                with honest status labels.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">02 / Pick a mode</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">{localLabel}: free forever</h3>
              <p className="agi-reason-p">
                Run <code>agi models scan</code>, then{' '}
                <code>agi --provider ollama --model &lt;model&gt;</code> after installing Ollama. No
                keys, no quotas, fully offline.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">{byokLabel}: free forever</h3>
              <p className="agi-reason-p">
                <code>agi login</code>. Paste your provider key. Encrypted on device.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Managed cloud · public alpha</h3>
              <p className="agi-reason-p">
                Sign in to use AGI-hosted compute today, open by default with a small free cap.
                Local and BYOK stay free acquisition paths.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">03 / What&rsquo;s next</p>
          <p className="agi-reason-p">
            Desktop and the CLI open for Local and BYOK work at public launch. Leave your email on
            the download page and we will tell you the moment they are ready.
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/download" className="agi-cta-primary">
              Get notified
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
