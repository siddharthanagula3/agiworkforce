import type { Metadata } from 'next';

import { EditorialPage } from '../../components/marketing/editorial/EditorialPage';
import { RuledSection } from '../../components/marketing/editorial/RuledSection';
import { Slug } from '../../components/marketing/editorial/Slug';
import { OpsizMorph } from '../../components/marketing/editorial/OpsizMorph';
import { MonoButton } from '../../components/marketing/editorial/MonoButton';
import { StampComingSoon } from '../../components/marketing/editorial/StampComingSoon';
import { OperatorConsole } from '../../components/marketing/editorial/OperatorConsole';
import { DispatchSection } from '../../components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'CLI | AGI Workforce',
  description:
    'agiworkforce — pure Rust CLI. 22 subcommands. 13 wired providers. 999 tests. v1.0 live.',
  alternates: { canonical: 'https://agiworkforce.com/cli' },
  openGraph: {
    title: 'CLI | AGI Workforce',
    description:
      'Pure Rust CLI with Ratatui TUI. 22 subcommands. 13 providers. 5.7 MB binary. 999 tests.',
    url: 'https://agiworkforce.com/cli',
    type: 'website',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce CLI' }],
  },
};

/* ── canonical subcommand list from apps/cli/src/main.rs ─────────────────── */
const SUBCOMMANDS: { cmd: string; desc: string }[] = [
  { cmd: 'exec', desc: 'run a task non-interactively' },
  { cmd: 'review', desc: 'non-interactive code review' },
  { cmd: 'apply', desc: 'apply latest diff as git patch' },
  { cmd: 'sandbox', desc: 'run commands inside a sandbox' },
  { cmd: 'mcp-server', desc: 'run as mcp server (stdio)' },
  { cmd: 'app-server', desc: 'run app server for ide integration' },
  { cmd: 'resume', desc: 'continue a previous session' },
  { cmd: 'fork', desc: 'fork a previous session' },
  { cmd: 'session', desc: 'inspect or branch sessions (replay)' },
  { cmd: 'cloud', desc: 'cloud tasks (byok, top models only)' },
  { cmd: 'plugin', desc: 'manage plugins' },
  { cmd: 'features', desc: 'inspect feature flags' },
  { cmd: 'execpolicy', desc: 'show execution policy rules' },
  { cmd: 'ecosystem', desc: 'scan and import mcp configs' },
  { cmd: 'history', desc: 'browse session history' },
  { cmd: 'sync', desc: 'sync dotfiles and settings across devices' },
  { cmd: 'login', desc: 'sign in to a provider or agi workforce cloud' },
  { cmd: 'logout', desc: 'logout from agi workforce cloud' },
  { cmd: 'auth-status', desc: 'show auth status for all providers' },
  { cmd: 'marketplace', desc: 'browse and install marketplace plugins' },
  { cmd: 'init', desc: 'initialize ~/.agiworkforce/ directory structure' },
  { cmd: 'onboarding', desc: 'run the first-run onboarding wizard again' },
];

const ENGINEERING_SPECS: { label: string; value: string }[] = [
  { label: 'Language', value: 'Rust (no Electron, no Tauri -- pure Rust)' },
  { label: 'Source files', value: '195 .rs files' },
  { label: 'Lines of code', value: '155,029 LOC' },
  { label: 'Test count', value: '999 tests' },
  { label: 'TUI', value: 'Ratatui -- 125 files' },
  { label: 'Subcommands', value: '22' },
  { label: 'Hook events', value: '22' },
  { label: 'Wired providers', value: '12 named + Custom BYO (OpenAI-compatible)' },
  { label: 'MCP transports', value: 'stdio (SSE + streamable HTTP coming)' },
  { label: 'Plan mode', value: 'update_plan tool (legacy plan_mode removed)' },
  {
    label: 'Sandbox',
    value: 'macOS Seatbelt · Linux bwrap (Windows/Landlock = stubs)',
  },
  { label: 'Binary size', value: '5.7 MB on arm64' },
  { label: 'Install path', value: '~/.cargo/bin/agiworkforce' },
  { label: 'Released', value: 'v1.0 LIVE (2026-05-03)' },
];

export default function CliPage() {
  return (
    <EditorialPage tier="mixed">
      {/* S1 — Masthead Hero */}
      <RuledSection tier="graphite" id="cli-hero">
        <div className="py-20 md:py-32">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
            {/* Left: asymmetric headline */}
            <div>
              <h1 className="leading-[1.02] tracking-[-0.018em]">
                <span
                  className="block font-[var(--font-newsreader)] font-light text-[var(--color-cream-on-graphite)]"
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
                >
                  agiworkforce &mdash;
                </span>
                <span
                  className={[
                    'block font-[var(--font-newsreader)] font-extrabold italic',
                    'text-[var(--color-cream-on-graphite)]',
                    'underline decoration-[var(--color-rule)] underline-offset-4',
                  ].join(' ')}
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
                >
                  the operator&apos;s CLI.
                </span>
              </h1>
            </div>

            {/* Right: lede */}
            <div className="flex flex-col justify-end">
              <p
                className={[
                  'font-mono text-[14px] leading-[1.65]',
                  'text-[var(--color-fg-quiet)]',
                  'whitespace-pre-line',
                ].join(' ')}
              >
                {`Pure Rust. Ratatui TUI. 22 subcommands. 13 wired providers. 999 tests. 5.7 MB binary on arm64.

The CLI is the product. The apps are surfaces over it.

— THE EDITORS`}
              </p>

              {/* Hairline amber rule */}
              <div className="mt-6 mb-4 border-t border-[var(--color-rule)]" />

              {/* Trust strip */}
              <p
                className={[
                  'font-mono text-[11px] tracking-[0.18em] uppercase',
                  'text-[var(--color-fg-muted)]',
                ].join(' ')}
              >
                RUST · NO ELECTRON · MCP STDIO+SSE+HTTP · LOCAL OR CLOUD
              </p>

              {/* CTAs */}
              <div className="mt-8 flex flex-wrap gap-3">
                <MonoButton variant="primary" href="#install" prefix="./">
                  install
                </MonoButton>
                <MonoButton
                  variant="ghost"
                  href="https://github.com/siddharthanagula3/agiworkforce"
                >
                  source on github
                </MonoButton>
              </div>
            </div>
          </div>
        </div>
      </RuledSection>

      {/* S2 — Operator Console live demo */}
      <OperatorConsole slugIndex="01" slugKicker="LIVE DEMO" />

      {/* S3 — Subcommand index */}
      <RuledSection tier="graphite" slug={<Slug index="02" kicker="SUBCOMMANDS" />}>
        <div className="py-20 md:py-28">
          <OpsizMorph as="h2" className="text-[var(--color-cream-on-graphite)] mb-12">
            22 subcommands.
          </OpsizMorph>

          <nav aria-label="CLI subcommands">
            <ul className="flex flex-col divide-y divide-[var(--color-rule-soft)]">
              {SUBCOMMANDS.map(({ cmd, desc }) => (
                <li key={cmd}>
                  <a
                    href={`/docs/cli/${cmd}`}
                    className={[
                      'flex items-baseline gap-2 px-3 py-3',
                      'group -mx-3',
                      'transition-colors duration-150',
                      'hover:bg-[var(--color-graphite-2)]',
                      'focus-visible:outline focus-visible:outline-2',
                      'focus-visible:outline-[var(--color-rule)] focus-visible:outline-offset-1',
                    ].join(' ')}
                  >
                    {/* Command name */}
                    <span
                      className={[
                        'font-mono text-[13px] font-semibold tracking-[0.08em]',
                        'text-[var(--color-cream-on-graphite)]',
                        'shrink-0 w-36',
                        'group-hover:underline group-hover:decoration-[var(--color-rule)]',
                        'group-hover:underline-offset-2',
                      ].join(' ')}
                    >
                      {cmd}
                    </span>

                    {/* Dot leaders */}
                    <span
                      className="flex-1 border-b border-dotted border-[var(--color-rule-soft)] self-end mb-[0.35em]"
                      aria-hidden="true"
                    />

                    {/* Description */}
                    <span
                      className={[
                        'font-mono text-[12px] tracking-[0.04em]',
                        'text-[var(--color-fg-quiet)]',
                        'shrink-0 text-right max-w-[50%]',
                      ].join(' ')}
                    >
                      {desc}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </RuledSection>

      {/* S4 — Install */}
      <RuledSection tier="graphite" id="install" slug={<Slug index="03" kicker="INSTALL" />}>
        <div className="py-20 md:py-28">
          <h2
            className={[
              'font-[var(--font-newsreader)] font-light',
              'text-[var(--color-cream-on-graphite)]',
              'mb-12',
            ].join(' ')}
            style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
          >
            Four ways in.
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Card 1 — Homebrew */}
            <div className="border border-[var(--color-rule)] p-6 flex flex-col gap-4">
              <p
                className={[
                  'font-mono text-[11px] tracking-[0.18em] uppercase',
                  'text-[var(--color-fg-muted)]',
                ].join(' ')}
              >
                HOMEBREW · MACOS, LINUX
              </p>
              <code
                className={[
                  'font-mono text-[13px] leading-[1.6] break-all',
                  'text-[var(--color-amber-text)]',
                ].join(' ')}
              >
                brew install siddharthanagula3/tap/agiworkforce
              </code>
              <p
                className={[
                  'font-mono text-[10px] tracking-[0.15em] uppercase mt-auto',
                  'text-[var(--color-stamp-ok)]',
                ].join(' ')}
              >
                LIVE
              </p>
            </div>

            {/* Card 2 — Cargo */}
            <div className="border border-[var(--color-rule)] p-6 flex flex-col gap-4">
              <p
                className={[
                  'font-mono text-[11px] tracking-[0.18em] uppercase',
                  'text-[var(--color-fg-muted)]',
                ].join(' ')}
              >
                CARGO · ANY PLATFORM
              </p>
              <code
                className={[
                  'font-mono text-[13px] leading-[1.6] break-all',
                  'text-[var(--color-amber-text)]',
                ].join(' ')}
              >
                cargo install agiworkforce-cli
              </code>
              <p
                className={[
                  'font-mono text-[10px] tracking-[0.15em] uppercase mt-auto',
                  'text-[var(--color-stamp-ok)]',
                ].join(' ')}
              >
                LIVE
              </p>
            </div>

            {/* Card 3 — curl */}
            <div className="border border-[var(--color-rule)] p-6 flex flex-col gap-4">
              <p
                className={[
                  'font-mono text-[11px] tracking-[0.18em] uppercase',
                  'text-[var(--color-fg-muted)]',
                ].join(' ')}
              >
                CURL · MACOS, LINUX, WSL
              </p>
              <code
                className={[
                  'font-mono text-[13px] leading-[1.6] break-all',
                  'text-[var(--color-amber-text)]',
                ].join(' ')}
              >
                curl -fsSL https://agiworkforce.com/install.sh | sh
              </code>
              <p
                className={[
                  'font-mono text-[10px] tracking-[0.15em] uppercase mt-auto',
                  'text-[var(--color-stamp-ok)]',
                ].join(' ')}
              >
                LIVE
              </p>
            </div>

            {/* Card 4 — npm */}
            <div className="border border-[var(--color-rule)] p-6 flex flex-col gap-4">
              <p
                className={[
                  'font-mono text-[11px] tracking-[0.18em] uppercase',
                  'text-[var(--color-fg-muted)]',
                ].join(' ')}
              >
                NPM · ANY PLATFORM
              </p>
              <code
                className={[
                  'font-mono text-[13px] leading-[1.6] break-all',
                  'text-[var(--color-amber-text)]',
                ].join(' ')}
              >
                npm install -g @agiworkforce/cli
              </code>
              <div className="mt-auto">
                <StampComingSoon variant="coming-soon" />
              </div>
            </div>
          </div>

          {/* Default install line */}
          <div className="mt-10 bg-[var(--color-graphite-2)] border border-[var(--color-rule-soft)] p-6">
            <p
              className={[
                'font-mono text-[11px] tracking-[0.15em] uppercase mb-3',
                'text-[var(--color-fg-quiet)]',
              ].join(' ')}
            >
              # quickest path in
            </p>
            <code className="font-mono text-[13px] text-[var(--color-cream-on-graphite)]">
              curl -fsSL https://agiworkforce.com/install.sh | sh
            </code>
          </div>
        </div>
      </RuledSection>

      {/* S5 — Engineering facts */}
      <RuledSection tier="graphite" slug={<Slug index="04" kicker="ENGINEERING" />}>
        <div className="py-20 md:py-28">
          <h2
            className={[
              'font-[var(--font-newsreader)] font-light',
              'text-[var(--color-cream-on-graphite)]',
              'mb-12',
            ].join(' ')}
            style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
          >
            What&apos;s actually under the hood.
          </h2>

          <dl className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3 border-t border-[var(--color-rule-soft)]">
            {ENGINEERING_SPECS.map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-col gap-1 py-4 pr-6 border-b border-[var(--color-rule-soft)]"
              >
                <dt
                  className={[
                    'font-mono text-[10px] tracking-[0.18em] uppercase',
                    'text-[var(--color-fg-faint)]',
                  ].join(' ')}
                >
                  {label}
                </dt>
                <dd
                  className={[
                    'font-mono text-[13px] leading-[1.5]',
                    'text-[var(--color-cream-on-graphite)]',
                  ].join(' ')}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <p
            className={[
              'mt-10 font-[var(--font-newsreader)] italic',
              'text-[var(--color-fg-muted)]',
              'text-lg',
            ].join(' ')}
          >
            The CLI is the product.
          </p>
        </div>
      </RuledSection>

      {/* S6 — Dispatch */}
      <DispatchSection slugIndex="05" slugKicker="DISPATCH" />
    </EditorialPage>
  );
}
