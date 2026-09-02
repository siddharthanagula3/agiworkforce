import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'Solutions: AI workflows for teams, developers, and operators',
  description:
    'Explore AGI solution pages for business teams, developers, startups, consultants, sales teams, IT service providers, and enterprise buyers.',
  path: '/solutions',
});

const ROUTES = [
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
] as const;

export default function SolutionsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-solutions-title"
          eyebrow="Solutions"
          title="Every page below is a different way into the same workspace."
          lede="This page is an index and argues nothing on its own. Each card names the job its page was written for, and behind all of them sits one workspace: the same chat, the same projects, the same connectors, and the same approval prompts."
          ctas={[{ href: '/download', label: "See what's live" }]}
        />

        <Section id="solutions-map" labelledBy="agi-solutions-map-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Where to start</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-solutions-map-title">
                Each of these pages was written for someone doing a different job.
              </h2>
            </div>
            <FactGrid
              items={ROUTES.map((route) => ({
                meta: route.meta,
                title: route.title,
                body: (
                  <>
                    {route.body}{' '}
                    <a href={route.href} className="agi-ds-link">
                      Read more
                    </a>
                  </>
                ),
              }))}
            />
          </Stack>
        </Section>

        <Section id="solutions-close" labelledBy="agi-solutions-close-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Before you pick</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-solutions-close-title">
                Cost and privacy are each argued once, on the page that owns the claim.
              </h2>
              <Prose>
                The map sorts pages by the person doing the work, and stops there. What a route
                costs, and what a Local session is allowed to do, are settled in one place each.
                Follow the links to read them where they are argued.
              </Prose>
            </div>
            <ButtonRow>
              <Button href="/pricing">See what each route costs</Button>
              <Button href="/local" variant="secondary">
                Read how Local mode works
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <MarketingFooter />
      </main>
    </div>
  );
}
