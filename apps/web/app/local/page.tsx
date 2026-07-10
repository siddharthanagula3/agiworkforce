import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { ProductFrame } from '../../components/marketing/ProductFrame';
import { CapabilityGrid, FinalCta } from '../../components/marketing/FlagshipSections';
import { WaitlistTrigger } from '../../components/marketing/WaitlistModal';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Local: Run AI on Your Device, Free Forever',
  description: `Run AGI fully local with Ollama and LM Studio on Desktop and CLI, plus on-device Local Mode on Mobile. No account required, works offline. ${LAUNCH.publicLabel}.`,
  path: '/local',
});

export default function LocalPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-local-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Local Mode</p>
          <h1 id="agi-local-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Your hardware.</span>
            <span className="agi-fl-h1-line">Your data.</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">Free forever.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Run AGI entirely on your own machine with Ollama and LM Studio, or on-device on your
            phone. Local chats, files, and sessions never silently leave your device. No account
            required. Works offline.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
              Get notified
            </Link>
            <Link href="/desktop" className="agi-fl-cta agi-fl-cta--secondary">
              See AGI Desktop
            </Link>
            <Link href="/cli" className="agi-fl-cta agi-fl-cta--ghost">
              Explore the CLI
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Local mode guarantees">
            <li>On-device</li>
            <li>Works offline</li>
            <li>No account required</li>
          </ul>

          <div className="agi-fl-hero-console" aria-hidden="true">
            <ProductFrame
              variant="desktop"
              title="AGI Desktop"
              badge="Local"
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="offline"
              className="agi-fl-hero-frame agi-fl-hero-frame--terminal"
            />
            <ProductFrame
              variant="phone"
              title="AGI Mobile"
              className="agi-fl-hero-frame agi-fl-hero-frame--phone"
            />
          </div>
        </section>

        <CapabilityGrid
          eyebrow="Where Local runs"
          title="Three surfaces run fully local."
          items={[
            {
              meta: 'Desktop',
              title: 'AGI Desktop',
              body: 'Ollama and LM Studio models in the native app. Chat, files, and tools without a cloud call.',
              href: '/desktop',
            },
            {
              meta: 'Terminal',
              title: 'AGI CLI',
              body: 'The agi binary works offline with local models. Sessions, code review, and sandboxed execution included.',
              href: '/cli',
            },
            {
              meta: 'Mobile',
              title: 'AGI Mobile',
              body: 'Local Mode keeps conversations, memory, and files on the phone by default.',
              href: '/mobile',
            },
          ]}
        />

        <section className="agi-fl-section" aria-labelledby="agi-local-commands-title">
          <p className="agi-fl-eyebrow">Verified commands</p>
          <h2 id="agi-local-commands-title" className="agi-fl-h2">
            From local server to first prompt.
          </h2>
          <p className="agi-fl-section-lede">
            Point AGI at a running Ollama or LM Studio server, scan for models, and start working.
            The CLI infers the provider where it can, or you pass it explicitly.
          </p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">agi · local mode</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-comment"># With an Ollama server running</span>
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>ollama pull &lt;your-model&gt;
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi models scan
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi --provider ollama --model
              &lt;model&gt;
              {'\n'}
              {'\n'}
              <span className="agi-terminal-comment"># With an LM Studio server running</span>
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi models scan
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi --provider lmstudio --model
              &lt;model&gt;
            </pre>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-local-boundary-title">
          <p className="agi-fl-eyebrow">The boundary</p>
          <h2 id="agi-local-boundary-title" className="agi-fl-h2">
            Local is a trust boundary, not a toggle.
          </h2>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Private by boundary</h3>
              <p className="agi-reason-p">
                In Local Mode, prompts, files, and responses stay on the device. Moving work to BYOK
                or Cloud is an explicit, labeled continuation. Never a silent handoff.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Free forever</h3>
              <p className="agi-reason-p">
                Local inference runs on your hardware. No meter, no account, no cloud bill. Usage is
                bounded only by your device.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">The full product shell</h3>
              <p className="agi-reason-p">
                You get the same composer, projects, artifacts, model selector, and memory controls
                as every other mode, before any key or invite.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-local-upgrade-title">
          <p className="agi-fl-eyebrow">When you want more</p>
          <div className="agi-callout">
            <h2 id="agi-local-upgrade-title" className="agi-callout-h">
              Reach past your hardware, deliberately.
            </h2>
            <p className="agi-callout-p">
              Bring your own provider keys on Desktop and CLI, or use AGI managed cloud — public
              alpha, open by default — for hosted compute. Either way, the move out of Local is an
              explicit choice with the provider label visible before anything is sent.
            </p>
          </div>
          <div className="agi-fl-cta-row">
            <Link href="/byok" className="agi-fl-cta agi-fl-cta--secondary">
              Set Up BYOK
            </Link>
            <WaitlistTrigger
              label="Team & Enterprise access"
              source="website"
              className="agi-fl-cta agi-fl-cta--ghost"
            />
          </div>
        </section>

        <FinalCta
          eyebrow="Local Mode"
          title="Own the whole stack."
          body="Follow the Desktop and CLI pages for current install routes, point AGI at Ollama or LM Studio, and keep your work on your machine."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/desktop', label: 'See AGI Desktop' },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
