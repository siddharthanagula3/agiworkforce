import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { FeatureGrid } from '@/features/marketing/components/LandingSections';
import { DevBand, FinalCta, TrustTriptych } from '@/features/marketing/components/FlagshipSections';
import { MARKETING, SURFACE_STATUS } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI CLI: the agi agent in your terminal',
  description: `agi is a Rust-native developer agent: resumable sessions, code review, sandboxed execution, hooks, skills, and MCP, offline-capable with local models. ${SURFACE_STATUS.cli}.`,
  path: '/cli',
});

const SUBCOMMANDS: { cmd: string; desc: string }[] = [
  { cmd: 'exec', desc: 'Run a task non-interactively' },
  { cmd: 'review', desc: 'Non-interactive code review' },
  { cmd: 'apply', desc: 'Apply latest diff as a git patch' },
  { cmd: 'sandbox', desc: 'Run a command inside a sandbox' },
  { cmd: 'mcp-server', desc: 'Run as an MCP server (stdio)' },
  { cmd: 'app-server', desc: 'Run the app server for IDE integration' },
  { cmd: 'resume', desc: 'Continue a previous session' },
  { cmd: 'fork', desc: 'Fork a previous session' },
  { cmd: 'session', desc: 'Inspect or branch sessions' },
  { cmd: 'plugin', desc: 'Manage plugins' },
  { cmd: 'history', desc: 'Browse session history' },
  { cmd: 'login', desc: 'Sign in to a provider or configure BYOK' },
  { cmd: 'auth-status', desc: 'Show auth status for every provider' },
  { cmd: 'init', desc: 'Initialize ~/.agiworkforce/' },
  { cmd: 'onboarding', desc: 'Re-run the first-run onboarding' },
];

const FEATURES = [
  {
    meta: 'Headless',
    title: 'agi exec for CI',
    body: 'Run any task non-interactively and stream typed JSON events. Every tool call, fallback, and turn usage arrives as machine-readable JSONL your pipeline can parse.',
  },
  {
    meta: 'Sessions',
    title: 'Resume, fork, replay',
    body: 'Every session persists with a turn-by-turn journal. Continue with agi resume. Branch with agi fork. Fork any past turn into a new named session.',
  },
  {
    meta: 'Safety',
    title: 'Sandboxed by default',
    body: 'Tool execution runs inside macOS Seatbelt or Linux bubblewrap. Opting out is loud: the TUI shows a red “no sandbox” indicator whenever sandboxing is off.',
  },
  {
    meta: 'Extensibility',
    title: 'Hooks, skills & plugins',
    body: 'Lifecycle hooks fire across the session. /skills lists every discovered skill. Custom slash commands are plain markdown files in your project or home directory.',
  },
  {
    meta: 'MCP',
    title: 'MCP in both directions',
    body: 'Connect MCP servers over stdio, SSE, or Streamable HTTP with optional OAuth. Or expose agi itself to any MCP client with agi mcp-server.',
  },
  {
    meta: 'Routing',
    title: 'Multi-model fallback',
    body: 'Pass a comma-separated model list and the CLI fails over on rate limits, network errors, and stream disconnects. A visible banner and a JSON event fire on each switch.',
  },
  {
    meta: 'Cost',
    title: 'Live cost HUD',
    body: 'Running tokens in and out, dollar spend, and context usage sit in the corner of the TUI. Pricing comes from the model catalog. Never hardcoded.',
  },
  {
    meta: 'Migration',
    title: 'Bring your setup',
    body: 'agi migrate imports your settings from Claude Code, and imported commands and prompts are recognized where they already live.',
  },
];

export default function CliPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-fl-cli-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              {/*
                Availability comes from `SURFACE_STATUS.cli`, not from typed
                copy. This line read "AGI CLI · coming soon" while the header
                dropdown on this same page read "Released · v1.0.0" from the
                registry — the CLI has shipped since the `v-cli-1.0.0` tag.
              */}
              <p className="agi-fl-eyebrow">AGI CLI · {SURFACE_STATUS.cli}</p>
              <h1 id="agi-fl-cli-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">An agent in</span>
                <span className="agi-fl-h1-line">
                  <em className="agi-fl-h1-em">your terminal.</em>
                </span>
              </h1>
              <p className="agi-fl-lede">
                The agi binary is a Rust developer agent. Resume and fork sessions. Run
                non-interactive code review. Execute in a sandbox with explicit approvals. Works
                offline with local models.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
                  Check availability
                </Link>
                <Link href="/agi-code" className="agi-fl-cta agi-fl-cta--secondary">
                  Explore AGI Code
                </Link>
              </div>
              <ul className="agi-fl-mode-ribbon" aria-label="CLI highlights">
                <li>Local · offline-capable</li>
                <li>BYOK · your keys</li>
                <li>Sandboxed · by default</li>
              </ul>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main" aria-hidden="true">
              <ProductFrame variant="terminal" title="agi · zsh" badge="sandboxed" />
            </div>
          </div>
        </section>

        <FeatureGrid eyebrow="Capabilities" title="A full agent runtime." items={FEATURES} />

        <section className="agi-fl-section" aria-labelledby="agi-fl-cli-subcommands-title">
          <p className="agi-fl-eyebrow">Subcommands</p>
          <h2 id="agi-fl-cli-subcommands-title" className="agi-fl-h2">
            One binary. 15 core subcommands.
          </h2>
          <p className="agi-fl-section-lede">
            Every subcommand below ships in the agi binary. Short aliases where it counts: e for
            exec, a for apply.
          </p>
          <table className="agi-ledger">
            <tbody>
              {SUBCOMMANDS.map((s) => (
                <tr key={s.cmd}>
                  <td style={{ fontFamily: 'var(--agi-font-mono)', textTransform: 'lowercase' }}>
                    {s.cmd}
                  </td>
                  <td>{s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <DevBand
          eyebrow="Sandbox"
          title="Risky actions run inside a box."
          body="On Linux the sandbox is bubblewrap. On macOS it's Seatbelt. Tool execution runs under OS-level sandboxing by default. Riskier actions ask for explicit approval. Turning the sandbox off is a visible, deliberate choice."
          ctas={[{ href: '/agi-code', label: 'Explore AGI Code' }]}
        />

        <TrustTriptych
          eyebrow="Trust modes"
          title="Your terminal, your boundary."
          lede="Local, BYOK, and AGI Cloud stay separate in the CLI too. /privacy-mode shows the active trust boundary. A Local session only continues elsewhere when you explicitly ask."
          cards={[
            {
              mode: 'Local',
              glyph: '◆',
              title: 'Offline with local models.',
              body: 'Point agi at Ollama or LM Studio and work entirely on your machine.',
              points: [
                'Local sessions never silently leave your device',
                '/privacy-mode shows the active trust boundary',
                'Session journals live under ~/.agiworkforce/',
                'No account required',
              ],
              cta: { href: '/local', label: 'Run AGI Locally' },
            },
            {
              mode: 'BYOK',
              glyph: '◇',
              title: 'Your keys, your billing.',
              body: 'Sign in with agi login. Device-code OAuth or an API key.',
              points: [
                `${MARKETING.providers.display} providers plus custom OpenAI-compatible endpoints`,
                'Traffic goes directly to your provider',
                '/continue-with-byok is an explicit, visible step',
                'agi auth-status shows every configured provider',
              ],
              cta: { href: '/byok', label: 'Set Up BYOK' },
            },
            {
              mode: 'AGI Cloud',
              glyph: '●',
              title: 'Managed compute, public alpha.',
              body: 'Cloud execution is public alpha, open by default, and still fails closed without an explicit route.',
              points: [
                'Public alpha — sign in and start, no waitlist',
                'agi cloud reports beta status and the model catalog only',
                'Clear labels before anything routes to cloud',
                'Usage metered and transparent',
              ],
              cta: { href: '/get-started', label: 'Get Started' },
            },
          ]}
        />

        <section className="agi-fl-section" aria-labelledby="agi-fl-cli-install-title">
          <p className="agi-fl-eyebrow">{SURFACE_STATUS.cli}</p>
          <h2 id="agi-fl-cli-install-title" className="agi-fl-h2">
            The CLI is released.
          </h2>
          <p className="agi-fl-section-lede">
            The agi binary ships as macOS, Linux, and Windows archives on the v1.0.0 release
            channel. The download page tracks availability for every surface and platform in one
            place.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/download" className="agi-fl-cta agi-fl-cta--secondary">
              Check availability
            </Link>
          </div>
        </section>

        <FinalCta
          eyebrow={SURFACE_STATUS.cli}
          title="An agent for your terminal."
          body="The agi binary is released as v1.0.0: resumable sessions, sandboxed execution, and AGI managed cloud in public alpha, open by default."
          ctas={[
            { href: '/download', label: 'Check availability' },
            { href: '/agi-code', label: 'Explore AGI Code' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          stamp={SURFACE_STATUS.cli}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
