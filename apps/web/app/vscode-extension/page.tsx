import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { DevBand, FinalCta, TrustTriptych } from '@/features/marketing/components/FlagshipSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { WaitlistTrigger } from '@/features/marketing/components/WaitlistModal';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI in VS Code: the @agi chat participant',
  description:
    'Chat with @agi inside VS Code with workspace-scoped context, six slash commands, and diff review. Plus an explicit local bridge to AGI Desktop. Developer preview.',
  path: '/vscode-extension',
});

const SLASH: { cmd: string; desc: string }[] = [
  { cmd: '/explain', desc: 'Explain the selection in plain language' },
  { cmd: '/fix', desc: 'Find and fix bugs in the selection' },
  { cmd: '/refactor', desc: 'Suggest refactoring improvements, each change explained' },
  { cmd: '/tests', desc: 'Generate unit tests covering edge cases and error paths' },
  { cmd: '/docs', desc: 'Write doc comments in the style of the language' },
  { cmd: '/model', desc: 'Switch the active provider and model' },
];

export default function VscodeExtensionPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-vscode-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <p className="agi-fl-eyebrow">AGI in VS Code · coming soon</p>
              <h1 id="agi-vscode-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">Your editor,</span>{' '}
                <span className="agi-fl-h1-line">with an agent</span>{' '}
                <span className="agi-fl-h1-line">
                  <em className="agi-fl-h1-em">on call.</em>
                </span>
              </h1>
              <p className="agi-fl-lede">
                Mention @agi in VS Code chat. Work with an assistant grounded in your workspace. Run
                /explain and /tests, review diffs, and hand heavier work to Desktop over an explicit
                local bridge.
              </p>
              <div className="agi-fl-cta-row">
                <WaitlistTrigger
                  label="Get VSIX Access"
                  source="website"
                  className="agi-fl-cta agi-fl-cta--primary"
                />
                <Link href="/agi-code" className="agi-fl-cta agi-fl-cta--secondary">
                  Explore AGI Code
                </Link>
                <Link href="/cli" className="agi-fl-cta agi-fl-cta--ghost">
                  See the CLI
                </Link>
              </div>
              <ul className="agi-fl-mode-ribbon" aria-label="Extension highlights">
                <li>@agi · chat participant</li>
                <li>Context · workspace-scoped</li>
                <li>Handoffs · explicit</li>
              </ul>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main" aria-hidden="true">
              <ProductFrame variant="editor" title="AGI · VS Code" badge="@agi" />
            </div>
          </div>
        </section>

        <TrustTriptych
          eyebrow="In the preview"
          title="A focused start, on the suite's rules."
          lede="AGI in VS Code ships the way every AGI surface does: visible context, reviewable changes, no silent routing. Here's what works today."
          cards={[
            {
              mode: '@agi chat',
              glyph: '◆',
              title: "Ask where you're typing.",
              body: 'A chat participant grounded in your workspace.',
              points: [
                'Reads the active file, selection, and language',
                'Adds diagnostics, open files, and project structure',
                'Pinned files travel with the conversation',
              ],
              cta: { label: 'Get VSIX Access', waitlist: true },
            },
            {
              mode: 'Diff review',
              glyph: '◇',
              title: 'Changes land on your terms.',
              body: 'Proposed edits arrive as diffs you review first.',
              points: [
                'See exactly what would change before it touches your files',
                '/fix and /refactor explain every change they propose',
                'You decide what gets applied',
              ],
              cta: { href: '/agi-code', label: 'Explore AGI Code' },
            },
            {
              mode: 'Desktop bridge',
              glyph: '●',
              title: 'Heavier work, handed off explicitly.',
              body: 'Pair the editor with AGI Desktop when you choose to.',
              points: [
                'Local WebSocket bridge on port 8787',
                'Authenticated handshake with allowlisted message types',
                "Degrades gracefully when Desktop isn't running",
              ],
              cta: { href: '/desktop', label: 'See AGI Desktop' },
            },
          ]}
        />

        <section className="agi-fl-section" aria-labelledby="agi-vscode-slash-title">
          <p className="agi-fl-eyebrow">Slash commands</p>
          <h2 id="agi-vscode-slash-title" className="agi-fl-h2">
            Six commands, zero context switching.
          </h2>
          <p className="agi-fl-section-lede">
            Type / in the @agi chat to act on your selection: explain it, fix it, test it, document
            it, or switch the model behind the conversation.
          </p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">@agi · VS Code chat</div>
            <pre className="agi-terminal-pre">
              {SLASH.map((s, i) => (
                <span key={s.cmd}>
                  {i > 0 ? '\n' : null}
                  <span className="agi-terminal-prompt">{s.cmd.padEnd(11, ' ')}</span>
                  {s.desc}
                </span>
              ))}
            </pre>
          </div>
        </section>

        <DevBand
          eyebrow="AGI Code"
          title="One developer story, two surfaces."
          body="AGI in VS Code pairs with the AGI CLI. Assistance in the editor when you want context and diffs. An agent in the terminal when you want resumable sessions and sandboxed execution. Developer sessions stay separate from consumer chat sync. Every cloud or local handoff is explicit."
          ctas={[
            { href: '/agi-code', label: 'Explore AGI Code' },
            { href: '/cli', label: 'See the CLI' },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Bring @agi into your editor."
          body="AGI in VS Code is in developer preview and ships as a VSIX. Request access and pair it with AGI Desktop and the AGI CLI. Installers open at public launch."
          ctas={[
            { label: 'Get VSIX Access', waitlist: true },
            { href: '/download', label: 'Get notified' },
            { href: '/cli', label: 'See the CLI' },
          ]}
          stamp="Coming soon · VSIX distribution"
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
