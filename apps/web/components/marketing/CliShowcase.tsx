'use client';

import { Check, Minus, Terminal } from 'lucide-react';

/**
 * CliShowcase - full-bleed section for the AGI Workforce CLI.
 *
 * Anchored on the YC-application differentiators:
 *   • Multi-provider in one session (mid-turn switch)
 *   • MCP over stdio + SSE + HTTP + OAuth (sprint B, May 2026)
 *   • Real plan mode (`update_plan` model tool)
 *   • Apache-2.0, native Rust binary
 *
 * Visual: rendered as a "terminal manuscript" - editorial serif headings,
 * monospaced body text in the demo card, hairline-rule comparison table.
 */
export function CliShowcase() {
  return (
    <section
      id="cli"
      className="scroll-reveal relative overflow-hidden border-y border-white/[0.05] bg-[#0a0a0c] py-24 opacity-0 translate-y-8 transition-all duration-1000 ease-out md:py-32"
    >
      {/* Background - diagonal hatching from the lower-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, #c8892a 0, #c8892a 1px, transparent 1px, transparent 22px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-15%] top-[-10%] h-[480px] w-[480px] rounded-full bg-[#c8892a]/[0.06] blur-[140px]"
      />

      <div className="container relative mx-auto px-4">
        {/* ── Section eyebrow + headline ── */}
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
              The Terminal
            </p>
            <h2 className="font-heading text-4xl leading-[0.95] tracking-tight text-[#edebe8] md:text-6xl lg:text-[4.5rem]">
              The CLI for
              <br />
              engineers who
              <br />
              <span className="bg-gradient-to-r from-[#c8892a] via-[#e8af50] to-[#c8892a] bg-clip-text text-transparent">
                refuse vendor lock.
              </span>
            </h2>

            <p className="font-body mt-7 max-w-md text-base leading-relaxed text-[#888480] md:text-lg">
              Eight LLM providers in one session. Mid-turn provider switch. Live cost HUD. Forking
              sessions. MCP over stdio, SSE, HTTP, and OAuth. Apache-2.0. Native Rust.
            </p>

            {/* Install snippet */}
            <div className="mt-9 rounded-xl border border-white/[0.06] bg-[#08080a] p-5 font-mono text-[13px]">
              <div className="mb-3 flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-[#555150]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#555150]">
                  Install
                </span>
              </div>
              <code className="block leading-relaxed text-[#a8a4a0]">
                <span className="text-[#666260]">$</span> cargo install agiworkforce-cli
              </code>
              <code className="mt-1 block leading-relaxed text-[#a8a4a0]">
                <span className="text-[#666260]">$</span> agiworkforce login anthropic
              </code>
              <code className="mt-1 block leading-relaxed text-[#a8a4a0]">
                <span className="text-[#666260]">$</span> agiworkforce{' '}
                <span className="text-[#c8892a]">-m</span> claude-sonnet-4-6,gpt-5.4,llama3.1{' '}
                <span className="text-emerald-400/80">"refactor main.rs"</span>
              </code>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#666260]">
              <ShipBadge>v1.0.0 shipped</ShipBadge>
              <span>·</span>
              <span>5.7 MB binary</span>
              <span>·</span>
              <span>Apache-2.0</span>
              <span>·</span>
              <span>2,161 tests green</span>
            </div>
          </div>

          {/* ── Terminal demo card ── */}
          <div className="md:col-span-7">
            <TerminalCard />
          </div>
        </div>

        {/* ── Comparison matrix ── */}
        <div className="mt-24 md:mt-28">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
            Versus the field
          </p>
          <h3 className="font-heading text-3xl tracking-tight text-[#edebe8] md:text-4xl lg:text-5xl">
            Where the others stop, we keep going.
          </h3>
          <p className="font-body mt-4 max-w-2xl text-[#888480] md:text-lg">
            We audited the source of every major agentic CLI. Here&rsquo;s the honest matrix - no
            marketing fluff.
          </p>

          <ComparisonTable />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function ShipBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      {children}
    </span>
  );
}

/* ─── Terminal demo card ─── */
function TerminalCard() {
  return (
    <div className="relative">
      {/* Soft amber glow behind the terminal */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-tr from-[#c8892a]/[0.08] via-transparent to-transparent blur-xl"
      />
      <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#08080a] shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-white/[0.05] bg-[#0e0e10] px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
          </div>
          <span className="font-mono text-[11px] text-[#666260]">~/projects/yc-demo</span>
          {/* Cost HUD pill (styled like the actual TUI) */}
          <div className="hidden items-center gap-2 rounded-md border border-white/[0.06] bg-black/30 px-2 py-0.5 font-mono text-[10px] text-[#888480] sm:flex">
            <span className="text-emerald-400">▮</span>
            <span>in 1.2k</span>
            <span>·</span>
            <span>out 412</span>
            <span>·</span>
            <span className="text-[#c8892a]">$0.011</span>
            <span>·</span>
            <span>ctx 4%</span>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-1.5 p-5 font-mono text-[12.5px] leading-[1.55] tracking-tight">
          <Line>
            <Prompt /> agiworkforce <Flag>--demo --json-events</Flag> exec <Flag>-m</Flag>{' '}
            claude-sonnet-4-6,gpt-5.4 <Str>&quot;summarize main.rs&quot;</Str>
          </Line>

          <Line dim>
            <JsonEvent>
              {`{"event":"spawning","model":"claude-sonnet-4-6","provider":"anthropic"}`}
            </JsonEvent>
          </Line>
          <Line dim>
            <JsonEvent>{`{"event":"ready_for_prompt","session_id":"9900cb32"}`}</JsonEvent>
          </Line>

          <Line>
            <Note>DEMO: synthesizing rate-limit on primary model</Note>
          </Line>

          <Line>
            <span className="text-[#c8892a]">↘</span>{' '}
            <span className="text-[#edebe8]">Falling back: claude-sonnet-4-6 → gpt-5.4 </span>
            <span className="text-[#888480]">(api_rate_limit)</span>
          </Line>

          <Line>
            <JsonEvent>
              {`{"event":"fallback_triggered","from":"claude-sonnet-4-6","to":"gpt-5.4"}`}
            </JsonEvent>
          </Line>

          <Line>
            <span className="text-[#888480]">[DEMO] Synthesized response from `gpt-5.4`</span>
          </Line>

          <Line dim>
            <JsonEvent muted>
              {`{"event":"turn_usage","in_tokens":1213,"out_tokens":412,"cumulative_dollars":0.011}`}
            </JsonEvent>
          </Line>
          <Line>
            <JsonEvent>{`{"event":"finished","reason":"completed"}`}</JsonEvent>
          </Line>

          {/* Active prompt cursor */}
          <Line>
            <Prompt />{' '}
            <span className="inline-block h-3.5 w-1.5 translate-y-[2px] animate-pulse bg-[#c8892a]" />
          </Line>
        </div>
      </div>

      {/* Caption */}
      <p className="mt-4 text-center text-xs text-[#555150]">
        <span className="text-[#888480]">Live multi-model fallback chain.</span> Every lifecycle
        event is JSONL on stdout - your CI can parse it. Other CLIs can&rsquo;t do this.
      </p>
    </div>
  );
}

function Line({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return <div className={dim ? 'text-[#666260]' : 'text-[#a8a4a0]'}>{children}</div>;
}

function Prompt() {
  return <span className="text-[#666260] select-none">$</span>;
}

function Flag({ children }: { children: React.ReactNode }) {
  return <span className="text-[#c8892a]">{children}</span>;
}

function Str({ children }: { children: React.ReactNode }) {
  return <span className="text-emerald-400/85">{children}</span>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className="text-[#7a7470] italic">{children}</span>;
}

function JsonEvent({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return <span className={muted ? 'text-[#444240]' : 'text-[#888480]'}>{children}</span>;
}

/* ─── Comparison matrix ─── */
function ComparisonTable() {
  type Row = {
    feature: string;
    claudeCode: string | boolean;
    codex: string | boolean;
    opencode: string | boolean;
    gemini: string | boolean;
    agi: string | true;
  };

  const rows: Row[] = [
    {
      feature: 'Multi-provider, mid-turn switch',
      claudeCode: 'Anthropic only',
      codex: 'OpenAI only',
      opencode: '~10 (Vercel AI SDK)',
      gemini: 'Google only',
      agi: '8 + /model',
    },
    {
      feature: 'Live cost HUD (tokens · $ · ctx %)',
      claudeCode: false,
      codex: false,
      opencode: false,
      gemini: false,
      agi: true,
    },
    {
      feature: 'Machine-readable agent events',
      claudeCode: false,
      codex: false,
      opencode: false,
      gemini: false,
      agi: '--json-events',
    },
    {
      feature: 'Multi-model fallback chain',
      claudeCode: false,
      codex: false,
      opencode: false,
      gemini: false,
      agi: '-m a,b,c',
    },
    {
      feature: 'Session fork from any turn',
      claudeCode: 'resume only',
      codex: 'basic fork',
      opencode: true,
      gemini: false,
      agi: '--at-turn N',
    },
    {
      feature: 'Native Rust binary',
      claudeCode: true,
      codex: true,
      opencode: 'Bun runtime',
      gemini: false,
      agi: true,
    },
    {
      feature: 'OSS license',
      claudeCode: 'Closed',
      codex: 'Apache-2.0',
      opencode: 'MIT',
      gemini: 'Apache-2.0',
      agi: 'Apache-2.0',
    },
    {
      feature: 'MCP transports',
      claudeCode: 'stdio · SSE · HTTP · OAuth',
      codex: 'stdio · HTTP · OAuth',
      opencode: 'stdio · SSE · HTTP · OAuth',
      gemini: 'partial',
      agi: 'stdio · SSE · HTTP · OAuth',
    },
    {
      feature: 'Hook events shipped',
      claudeCode: '27',
      codex: '6',
      opencode: 'yes',
      gemini: 'partial',
      agi: '19 canonical',
    },
    {
      feature: 'Plan mode',
      claudeCode: true,
      codex: 'update_plan tool',
      opencode: true,
      gemini: false,
      agi: 'update_plan tool',
    },
  ];

  return (
    <div className="mt-12 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0c]">
      {/* Desktop table */}
      <div className="hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full font-body text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-[#0e0e10]">
                <th className="w-[34%] px-6 py-5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#666260]">
                  Capability
                </th>
                <Th>Claude Code</Th>
                <Th>Codex CLI</Th>
                <Th>OpenCode</Th>
                <Th>Gemini CLI</Th>
                <Th highlight>AGI Workforce</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.feature}
                  className={
                    i % 2 === 0
                      ? 'border-b border-white/[0.03]'
                      : 'border-b border-white/[0.03] bg-[#0c0c0e]'
                  }
                >
                  <td className="px-6 py-4 text-[#a8a4a0]">{row.feature}</td>
                  <Cell value={row.claudeCode} />
                  <Cell value={row.codex} />
                  <Cell value={row.opencode} />
                  <Cell value={row.gemini} />
                  <Cell value={row.agi} highlight />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile/tablet - stacked card per row */}
      <div className="space-y-px lg:hidden">
        {rows.map((row) => (
          <div
            key={row.feature}
            className="border-b border-white/[0.04] bg-[#0a0a0c] px-5 py-5 last:border-b-0"
          >
            <div className="mb-3 text-sm font-semibold text-[#edebe8]">{row.feature}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <MobileCell label="Claude Code" value={row.claudeCode} />
              <MobileCell label="Codex CLI" value={row.codex} />
              <MobileCell label="OpenCode" value={row.opencode} />
              <MobileCell label="Gemini CLI" value={row.gemini} />
              <MobileCell label="AGI Workforce" value={row.agi} highlight />
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function Th({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <th
      className={
        'px-4 py-5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] ' +
        (highlight ? 'text-[#c8892a]' : 'text-[#666260]')
      }
    >
      {children}
    </th>
  );
}

function Cell({ value, highlight = false }: { value: string | boolean; highlight?: boolean }) {
  if (value === true) {
    return (
      <td className={'px-4 py-4 ' + (highlight ? 'text-emerald-400' : 'text-[#a8a4a0]')}>
        <Check className="h-4 w-4" />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="px-4 py-4 text-[#444240]">
        <Minus className="h-4 w-4" />
      </td>
    );
  }
  return (
    <td
      className={
        'px-4 py-4 font-mono text-[12px] ' + (highlight ? 'text-emerald-400' : 'text-[#888480]')
      }
    >
      {value}
    </td>
  );
}

function MobileCell({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | boolean;
  highlight?: boolean;
}) {
  return (
    <>
      <dt className={highlight ? 'text-[#c8892a]' : 'text-[#555150]'}>{label}</dt>
      <dd className={'text-right ' + (highlight ? 'font-mono text-emerald-400' : 'text-[#a8a4a0]')}>
        {value === true ? (
          <Check className="ml-auto h-3.5 w-3.5" />
        ) : value === false ? (
          <Minus className="ml-auto h-3.5 w-3.5 text-[#444240]" />
        ) : (
          value
        )}
      </dd>
    </>
  );
}
