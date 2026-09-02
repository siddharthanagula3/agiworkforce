import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame, type TerminalLine } from '@/features/marketing/components/ProductFrame';
import { CapabilityGrid, FinalCta } from '@/features/marketing/components/FlagshipSections';
import { DESKTOP_LOCAL_RUNTIMES, LAUNCH, SURFACE_STATUS } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Local: run AI on your device, no cost',
  description: `Run AGI locally with Ollama, LM Studio, llama.cpp, or vLLM on Desktop, supported local models in the CLI, and on-device Local Mode in Mobile source. No account is required for Local mode. ${LAUNCH.publicLabel}.`,
  path: '/local',
});

const LOCAL_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'summarise what changed in src/auth/session.rs' },
  { kind: 'out', text: 'The 30-minute TTL moved out of the middleware and into' },
  { kind: 'out', text: 'SessionGuard, so an expired token now fails before any' },
  { kind: 'out', text: 'handler runs.' },
  { kind: 'cmd', text: '/cost' },
  { kind: 'ok', text: 'Turns: 6 │ Tokens: 4182 in / 1370 out (no cost: local model)' },
];

const BOUNDARY_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: '/privacy-mode byok' },
  { kind: 'out', text: 'Privacy mode was not changed.' },
  { kind: 'ok', text: 'Local -> BYOK requires an explicit reviewable handoff.' },
  { kind: 'dim', text: 'Run /continue-with-byok to draft a fork with selected' },
  { kind: 'dim', text: 'context, secret-scan redaction, payload preview, and' },
  { kind: 'dim', text: 'consent before sending.' },
];

const LOCAL_HUD = { tokensIn: 4182, tokensOut: 1370, cost: '$0.0000', ctx: '11%' };

export default function LocalPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-local-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <p className="agi-fl-eyebrow">Local Mode</p>
              <h1 id="agi-local-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">
                  The runtime <em className="agi-fl-h1-em">refuses to move</em> a Local session.
                </span>
              </h1>
              <p className="agi-fl-lede">
                Point AGI at a model server you already run. The work happens on your hardware, with
                no AGI account and no meter, and the only route out of Local mode is one you read
                before you send it.
              </p>
              <ul className="agi-fl-mode-ribbon" aria-label="What Local mode costs you">
                <li>No account required</li>
                <li>No cost: local model</li>
              </ul>
              <div className="agi-fl-cta-row">
                <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
                  Get notified
                </Link>
                <Link href="/cli" className="agi-fl-cta agi-fl-cta--secondary">
                  Set up the CLI
                </Link>
              </div>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main">
              <ProductFrame
                variant="terminal"
                title="agi · local"
                badge="ollama"
                session={LOCAL_SESSION}
                hud={LOCAL_HUD}
              />
            </div>
          </div>
        </section>

        <CapabilityGrid
          eyebrow="Surfaces"
          title="Each surface reaches local models its own way."
          items={[
            {
              meta: `Desktop · ${SURFACE_STATUS.desktop}`,
              title: 'Runtime URLs live in Settings',
              body: `${DESKTOP_LOCAL_RUNTIMES.label} each take a server URL. Desktop checks that the URL answers, lists the models the runtime reports, and refreshes the model catalog from the reply.`,
              href: '/desktop',
            },
            {
              meta: `CLI · ${SURFACE_STATUS.cli}`,
              title: 'agi models scan',
              body: 'The CLI probes Ollama and LM Studio on loopback, prints every installed model beside its base URL, and blocks any address that is not loopback before a request is built.',
              href: '/cli',
            },
            {
              meta: `Mobile · ${SURFACE_STATUS.mobile}`,
              title: 'Local Mode on the phone',
              body: 'Local Mode keeps the conversation, memory, and files on the device. The surface itself has not shipped.',
              href: '/mobile',
            },
          ]}
        />

        <section className="agi-fl-section" aria-labelledby="agi-local-setup-title">
          <p className="agi-fl-eyebrow">Setup</p>
          <h2 id="agi-local-setup-title" className="agi-fl-h2">
            You point AGI at a server you already run.
          </h2>
          <p className="agi-fl-section-lede">
            Nothing is installed on your behalf. Start the runtime, pull or load a model the way you
            normally would, then let AGI discover what is there and name the provider explicitly.
          </p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">agi · local mode</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-comment"># an Ollama server is already running</span>
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>ollama pull &lt;your-model&gt;
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi models scan
              {'\n'}
              Local model servers
              {'\n'}
              {'\n'}
              ollama running http://localhost:11434
              {'\n'}
              {'  '}models:
              {'\n'}
              {'    '}- &lt;your-model&gt;
              {'\n'}
              {'\n'}
              lmstudio not running http://localhost:1234/v1
              {'\n'}
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi --provider ollama --model
              &lt;model&gt;
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi --provider lmstudio --model
              &lt;model&gt;
            </pre>
          </div>
        </section>

        <section className="agi-fl-devband" aria-labelledby="agi-local-boundary-title">
          <div className="agi-fl-devband-copy">
            <p className="agi-fl-eyebrow">The trust boundary</p>
            <h2 id="agi-local-boundary-title" className="agi-fl-h2">
              The runtime checks the boundary before every request.
            </h2>
            <p className="agi-fl-section-lede">
              A session carries its own privacy authority (local, byok, or managed) written down
              beside its transcript, and the runtime re-reads it before each request it builds. When
              the selected model routes somewhere that authority does not cover, the send stops
              there and the error names the one command that would carry the work across properly.
            </p>
            <p className="agi-fl-section-lede">
              That command forks a second session which starts with no history at all. It runs a
              secret scan over the messages you picked, shows you the exact payload with counts of
              what was included, excluded and truncated, and completes only when you send that
              reviewed draft back word for word. Attached files are never added for you. The Local
              session it forked from keeps its own authority and its own transcript, unchanged.
            </p>
          </div>
          <div className="agi-fl-devband-visual">
            <ProductFrame
              variant="terminal"
              title="agi · local"
              badge="boundary"
              session={BOUNDARY_SESSION}
              hud={LOCAL_HUD}
            />
          </div>
        </section>

        <FinalCta
          eyebrow="Local Mode"
          title="The machine you own can run the model."
          body="Desktop carries the widest set of local runtimes. BYOK is the reviewed way out on the days a local model is not enough."
          ctas={[
            { href: '/desktop', label: 'See AGI Desktop' },
            { href: '/byok', label: 'How BYOK works' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
