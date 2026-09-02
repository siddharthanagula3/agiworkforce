import type { ReactNode } from 'react';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import type { TerminalLine } from '@/features/marketing/components/DeviceMockups';
import { Reveal } from '@/features/marketing/components/Reveal';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { SURFACE_STATUS } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI Use Cases: Startups, consultants, sales, and IT providers',
  description:
    'Use AGI across startup building, consulting, IT service delivery, sales teams, research, coding, and business automation.',
  path: '/use-cases',
});

const CI_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'git diff --stat | agi --print "flag the riskiest change"' },
  { kind: 'out', text: 'The retry loop in the provider adapter has no ceiling.' },
  { kind: 'cmd', text: 'agi --json-events exec "cap the retries, add a test"' },
  { kind: 'dim', text: '{"event":"running_tool","name":"read_file",…}' },
  { kind: 'dim', text: '{"event":"tool_result","name":"write_file","ok":true,…}' },
  { kind: 'ok', text: '{"event":"finished","reason":"completed"}' },
];

const CI_HUD = { tokensIn: 12480, tokensOut: 734, cost: '$0.0000', ctx: '22%' };

const RUNBOOK_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi doctor' },
  { kind: 'out', text: '[Pass] OS sandbox - macOS Seatbelt is available' },
  { kind: 'dim', text: '  - detected executor sandbox: seatbelt' },
  { kind: 'cmd', text: 'agi approvals allow "kubectl get -n prod"' },
  { kind: 'ok', text: 'Always allow: kubectl get -n prod' },
  { kind: 'cmd', text: 'agi approvals deny "kubectl delete"' },
  { kind: 'ok', text: 'Always deny: kubectl delete' },
];

interface UseCaseEntry {
  name: string;
  href: string;
  tagline: string;
  body: string;
  caps: string[];
  surface: string;
  status: string;
  visual: ReactNode;
}

const ENTRIES: UseCaseEntry[] = [
  {
    name: 'Startups',
    href: '/use-cases/startups',
    tagline: 'For the founder who is also the release engineer.',
    body: 'This is the page that makes the spend argument and then shows the automation behind it. A task pipes into agi exec like any other Unix tool, and a typed JSONL event stream comes back for a build step to read. It also sets out why changing provider next quarter costs you no history.',
    caps: ['Provider switching mid-thread', 'agi exec in CI', 'What Local and BYOK cost'],
    surface: 'CLI · terminal',
    status: SURFACE_STATUS.cli,
    visual: (
      <ProductFrame
        variant="terminal"
        title="agi · zsh"
        badge="BYOK"
        routeMode="byok"
        session={CI_SESSION}
        hud={CI_HUD}
      />
    ),
  },
  {
    name: 'Consulting firms',
    href: '/use-cases/consulting',
    tagline: 'For the engagement that outlives any one model.',
    body: 'Consulting is where one thread has to survive a change of provider halfway through: long-context reading for the data room, prose for the executive summary, then the same analysis run headless across a shelf of client datasets. The confidentiality questions partners actually ask are answered there too.',
    caps: ['Synthesis at depth', 'House-tone drafting', 'Headless reporting runs'],
    surface: 'Desktop · BYOK',
    status: SURFACE_STATUS.desktop,
    visual: <ProductFrame variant="desktop" title="AGI Workforce" badge="BYOK" routeMode="byok" />,
  },
  {
    name: 'IT service providers',
    href: '/use-cases/it-providers',
    tagline: 'For the engineer working inside somebody else’s estate.',
    body: 'This one is about restraint. Runbooks are encoded as MCP tools, shell and file writes go through the operating system sandbox, and the allow and deny rules are pinned before the agent touches a client machine rather than argued about afterwards.',
    caps: ['Ticket triage', 'Runbooks as MCP tools', 'Sandboxed execution', 'Pinned approvals'],
    surface: 'CLI · terminal',
    status: SURFACE_STATUS.cli,
    visual: (
      <ProductFrame
        variant="terminal"
        title="agi · zsh"
        badge="sandboxed"
        session={RUNBOOK_SESSION}
        hud={false}
      />
    ),
  },
  {
    name: 'Sales teams',
    href: '/use-cases/sales-teams',
    tagline: 'For the rep who needs the brief before the call.',
    body: 'Sales is written for the browser: pull the public record on a target, draft in your own voice, and prep the data room while the call is still an hour away. It is also the shortest way in, because the web surface asks you to install nothing.',
    caps: ['Account research', 'Outreach drafts', 'Deal-room prep'],
    surface: 'Web · no install',
    status: SURFACE_STATUS.web,
    visual: <ProductFrame variant="web" title="agiworkforce.com/chat" badge="Web" />,
  },
];

export default function UseCasesPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="Use cases"
          titleLines={['We wrote one page per job,', 'and each one shows that job running.']}
          em="that job running"
          lede="A founder automating CI, a partner drafting a deliverable, an engineer running a client runbook and a rep prepping a deal each reach for a different surface first. The four pages below take one of those apiece and open on the surface it runs on."
          ctas={[
            { href: '/download', label: "See what's live" },
            { href: '/solutions', label: 'See the solutions map' },
          ]}
          modeRibbon={[]}
        />

        <section className="agi-fl-section" aria-labelledby="agi-usecases-index-title">
          <p className="agi-fl-eyebrow">The pages</p>
          <h2 id="agi-usecases-index-title" className="agi-fl-h2">
            Each page below opens on the surface its team actually works in.
          </h2>
          <p className="agi-fl-section-lede">
            Underneath they are the same product, with the same projects, connectors and routing, so
            what changes between them is where the work starts and how much of it a script is
            supposed to do. The status beside each one is the honest availability of that surface
            today.
          </p>

          <ol className="agi-fl-surface-list">
            {ENTRIES.map((entry) => (
              <Reveal as="li" key={entry.href} className="agi-fl-surface-row">
                <div className="agi-fl-surface-copy">
                  <h3 className="agi-fl-surface-name">
                    <Link href={entry.href} className="agi-fl-surface-link">
                      {entry.name}
                    </Link>
                  </h3>
                  <p className="agi-fl-surface-tagline">{entry.tagline}</p>
                  <p className="agi-fl-surface-body">{entry.body}</p>
                  <ul className="agi-fl-surface-caps">
                    {entry.caps.map((cap) => (
                      <li key={cap}>{cap}</li>
                    ))}
                  </ul>
                  <p className="agi-fl-surface-meta">
                    <span>{entry.surface}</span>
                    <span className="agi-fl-surface-status">{entry.status}</span>
                  </p>
                </div>
                <div className="agi-fl-surface-visual">{entry.visual}</div>
              </Reveal>
            ))}
          </ol>
        </section>

        <FinalCta
          eyebrow="What it costs"
          title="Every one of these teams can start without paying us."
          body="Local runs on hardware you already own and BYOK bills you at your provider's published rates, and both stay free on our side for as long as you use them. Managed-cloud capacity is the part that carries a price, and the pricing page is where those plans are written down."
          ctas={[{ href: '/pricing', label: 'See plans' }]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
