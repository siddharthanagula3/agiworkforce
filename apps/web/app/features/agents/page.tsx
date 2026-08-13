import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { FeatureGrid } from '@/features/marketing/components/LandingSections';
import { DevBand, FinalCta } from '@/features/marketing/components/FlagshipSections';

export const metadata = buildMetadata({
  title: 'AGI Agents | Delegated Work With Explicit Permissions',
  description:
    'AGI agents are delegated, tool-using sessions: named agents and parallel subagents in the CLI, scheduled runs and dispatch with AGI Work on Desktop. Explicit approvals, sandboxed execution, and visible routes.',
  path: '/features/agents',
});

const AGENT_FEATURES = [
  {
    meta: 'Define',
    title: 'Named agents',
    body: 'Describe an agent in a plain file: what it is for, an optional model, and the tools it may use. Scoped to one project or shared globally. /agents lists, filters, and invokes them in the CLI.',
  },
  {
    meta: 'Parallelize',
    title: 'Subagents in parallel',
    body: 'Fan a task out to subagents that work simultaneously. Each reports running, completed, failed, or cancelled, and returns its output along with the files it modified.',
  },
  {
    meta: 'Approve',
    title: 'Approvals before actions',
    body: 'Risky actions pause and ask first. The CLI raises an approval overlay before a tool runs, and Desktop puts the same explicit consent in front of MCP connectors and tools.',
  },
  {
    meta: 'Contain',
    title: 'Sandboxed execution',
    body: 'In the CLI, tool execution runs inside OS-level sandboxing. Seatbelt on macOS, bubblewrap on Linux. Turning the sandbox off is a loud, deliberate choice.',
  },
  {
    meta: 'Observe',
    title: 'Hooks on the lifecycle',
    body: 'Lifecycle hooks fire across a session: before and after tool calls, on prompt submit, on stop. Wire your own guardrails, logs, and automations around an agent.',
  },
  {
    meta: 'Schedule',
    title: 'AGI Work on Desktop',
    body: 'Schedule recurring runs and dispatch work with AGI Work. Scheduled and Dispatch are built in on AGI Desktop, the local-private compute host.',
    href: '/agi-work',
  },
];

export default function FeaturesAgentsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-fl-agents-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">AGI Agents</p>
          <h1 id="agi-fl-agents-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Delegated work,</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">on your terms.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            An agent in AGI is a tool-using session you can hand work to: it reads files, runs
            commands, uses connectors, and reports back. What it may touch is set by explicit
            permissions, risky actions pause for approval, and the route it runs on is always
            visible.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
              Get notified
            </Link>
            <Link href="/agi-code" className="agi-fl-cta agi-fl-cta--secondary">
              Explore AGI Code
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Agent highlights">
            <li>Approvals · explicit</li>
            <li>Sandbox · on by default</li>
            <li>Routes · always visible</li>
          </ul>

          <div className="agi-fl-hero-console">
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="sandboxed"
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
          </div>
        </section>

        <FeatureGrid
          eyebrow="How delegation works"
          title="Built for handing off. Designed for oversight."
          items={AGENT_FEATURES}
        />

        <section className="agi-fl-section" aria-labelledby="agi-fl-agents-surfaces-title">
          <p className="agi-fl-eyebrow">Where agents run</p>
          <h2 id="agi-fl-agents-surfaces-title" className="agi-fl-h2">
            Four surfaces, one permission model.
          </h2>
          <p className="agi-fl-section-lede">
            Agents live where the work is: the terminal, the desktop, the editor, and the browser.
            Every surface keeps the same rule: explicit permissions, visible routes.
          </p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>CLI</td>
                <td>
                  The agi binary: resumable sessions, named agents and subagents, hooks, and
                  sandboxed execution. Works offline with local models.
                </td>
              </tr>
              <tr>
                <td>Desktop</td>
                <td>
                  The local-private compute host: AGI Work Scheduled and Dispatch, MCP connectors,
                  and tool approvals.
                </td>
              </tr>
              <tr>
                <td>VS Code</td>
                <td>
                  @agi in the editor with workspace-scoped context and diff review before changes
                  land.
                </td>
              </tr>
              <tr>
                <td>Chrome</td>
                <td>
                  A side panel that captures page context on request and hands real work to Desktop
                  over a paired bridge.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <DevBand
          eyebrow="Boundaries"
          title="An agent never picks its own route."
          body="Local, BYOK, and AGI Cloud are separate trust boundaries for agents too. A Local session never silently continues on your keys or managed compute. Moving work elsewhere is an explicit, visible step."
          ctas={[
            { href: '/local', label: 'Run AGI Locally' },
            { href: '/byok', label: 'Set Up BYOK' },
          ]}
        />

        <FinalCta
          eyebrow="Start now"
          title="Put an agent on it."
          body="Follow current release availability for Local and BYOK agent work on Desktop, CLI, and VS Code. AGI managed cloud is in public alpha — open by default."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/agi-code', label: 'Explore AGI Code' },
            { label: 'Enterprise early access', waitlist: true },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
