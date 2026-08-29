import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { RouteMap } from '@/features/marketing/components/LandingSections';
import { ProductFrame, type TerminalLine } from '@/features/marketing/components/ProductFrame';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { getModels } from '@agiworkforce/types';

export const metadata = buildMetadata({
  title: 'AGI Solutions: AI workflows for teams, developers, and operators',
  description:
    'Explore AGI solution pages for business teams, developers, startups, consultants, sales teams, IT service providers, and enterprise buyers.',
  path: '/solutions',
});

const SESSION_MODELS = getModels({ modelTypes: ['chat'] })
  .map((model) => model.id)
  .slice(0, 3);

const SESSION_ROWS: readonly { title: string; ref: string; msgs: number }[] = [
  { title: 'Onboarding memo', ref: '4c1a7f02', msgs: 34 },
  { title: 'Streaming fix', ref: '9b30d5e1', msgs: 18 },
  { title: 'Q3 spend rollup', ref: '2f77ac10', msgs: 12 },
];

const WORKSPACE_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi history --limit 3' },
  { kind: 'dim', text: '  Today:' },
  ...SESSION_ROWS.map((row, i) => ({
    kind: 'out' as const,
    text: `    ${row.title.padEnd(24)} [${row.ref}]${String(row.msgs).padStart(6)} msgs  ${SESSION_MODELS[i] ?? ''}`,
  })),
];

export default function SolutionsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="Solutions"
          titleLines={['Every page below is a different', 'way into the same workspace.']}
          em="the same workspace"
          lede="This page is an index and argues nothing on its own. Each card names the job its page was written for, and behind all of them sits one workspace: the same chat, the same projects, the same connectors, and the same approval prompts."
          ctas={[{ href: '/download', label: 'Get AGI Desktop' }]}
          modeRibbon={[]}
          visual={
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="sessions"
              session={WORKSPACE_SESSION}
              hud={false}
            />
          }
        />

        <RouteMap
          eyebrow="Where to start"
          title="Each of these pages was written for someone doing a different job."
          routes={[
            {
              meta: 'You write code',
              title: 'AGI Code',
              body: 'The agi binary and the VS Code extension that spawns it over stdio: ranked review findings on a working diff, a session diff landed as a git patch, and commands run under the OS sandbox.',
              href: '/agi-code',
            },
            {
              meta: 'You want a deliverable',
              title: 'AGI Work',
              body: 'A mode of the web composer that returns a plan before its first tool call, holds the run whenever a call needs your approval, and keeps every run in your task list.',
              href: '/agi-work',
            },
            {
              meta: 'You sign the invoice',
              title: 'AGI for Business',
              body: 'The cost side of a rollout: which route we bill for, what hosted capacity buys, and how a single run is capped in dollars before it starts.',
              href: '/business',
            },
            {
              meta: 'You know your role',
              title: 'Use cases',
              body: 'Role pages for startups, consulting firms, IT service providers, and sales teams, each starting from the job rather than the surface.',
              href: '/use-cases',
            },
          ]}
        />

        <FinalCta
          eyebrow="Before you pick"
          title="Cost and privacy are each argued once, on the page that owns the claim."
          body="The map sorts pages by the person doing the work, and stops there. What a route costs, and what a Local session is allowed to do, are settled in one place each. Follow the links to read them where they are argued."
          ctas={[
            { href: '/pricing', label: 'See what each route costs' },
            { href: '/local', label: 'Read how Local mode works' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
