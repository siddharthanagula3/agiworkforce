import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { BILLING_PLAN_PRICING, BILLING_PLAN_PRODUCT_LIMITS } from '@agiworkforce/types';
import { BYOK_SURFACES, DESKTOP_LOCAL_RUNTIMES, SURFACE_STATUS } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Customers',
  description:
    'We print no customer name without written permission, so this page carries none. It works through three situations instead, each naming the surface it runs on, the mechanics behind it, the plan limit it meets, and the work it leaves to you.',
  path: '/customers',
});

const BASIC_SCHEDULES = BILLING_PLAN_PRODUCT_LIMITS.basic.maxScheduledTasks;
const PRO_SCHEDULES = BILLING_PLAN_PRODUCT_LIMITS.pro.maxScheduledTasks;

interface ScenarioMechanic {
  label: string;
  value: string;
}

interface Scenario {
  sector: string;
  title: string;
  problem: string;
  mechanics: ScenarioMechanic[];
  caveat: string;
  meta: string;
  status: string;
  href: string;
  hrefLabel: string;
}

const SCENARIOS: Scenario[] = [
  {
    sector: 'Engineering · Local mode',
    title: 'A team whose source cannot reach a third party',
    problem:
      'An NDA forbids sending this repository to an external model provider, which disqualifies most AI coding tools on the question of where inference happens, long before anyone gets to judge how well they answer.',
    mechanics: [
      {
        label: 'Model picker',
        value: `Desktop keeps one server URL per runtime (${DESKTOP_LOCAL_RUNTIMES.label}) and fills its model picker from whatever that server answers with.`,
      },
      {
        label: 'Server discovery',
        value:
          'agi models status names every local server it can reach and the models sitting on each. A base URL that is not loopback never gets a request built for it.',
      },
      {
        label: 'Billing',
        value:
          'No AGI account takes part, and a finished run reports no cost for a local model because there was nothing to bill.',
      },
      {
        label: 'Plan tier',
        value: `The ${BILLING_PLAN_PRICING['local-only'].label} plan tier is priced at zero and puts no cap on work you run against your own hardware.`,
      },
    ],
    caveat:
      'AGI supplies neither the hardware nor the weights, and a model you host will lose to a frontier hosted model on the hardest problems. That is capability traded for containment, and it is a trade you have to want.',
    meta: `Desktop · ${SURFACE_STATUS.desktop}`,
    status: `CLI · ${SURFACE_STATUS.cli}`,
    href: '/local',
    hrefLabel: 'How Local mode works',
  },
  {
    sector: 'Consulting · BYOK',
    title: 'A firm that charges model spend back to a client',
    problem:
      'Every engagement has to carry its own AI cost, and the firm will not put a platform vendor between itself and the invoice it has to justify line by line to the client paying it.',
    mechanics: [
      {
        label: 'Key storage',
        value:
          'Each surface writes the key into its own platform credential store, so one engagement’s key stays on the one machine that engagement runs from.',
      },
      {
        label: 'Request routing',
        value:
          'Requests reach the provider endpoint directly, so the usage lands on the firm’s own provider account and shows up on the firm’s own invoice.',
      },
      {
        label: 'Cost estimate',
        value:
          'The CLI estimates cost from the same catalog rate card it ships with, so the arithmetic behind a cost line is inspectable before a run starts.',
      },
      {
        label: 'Budget cap',
        value:
          '--max-budget-usd ends a run once estimated spend passes a ceiling you set, which keeps a runaway loop off a client’s bill.',
      },
      {
        label: 'Plan tier',
        value: `The ${BILLING_PLAN_PRICING.byok.label} plan tier is priced at zero, which leaves the provider invoice as the only bill in the arrangement.`,
      },
    ],
    caveat:
      'Per-client attribution comes out of your provider’s own billing tooling, one key or project per engagement. The number the CLI prints is an estimate from a local rate table; AGI never sees your invoice and writes no per-client spend report for you.',
    meta: BYOK_SURFACES.compact,
    status: 'No AGI charge on this route',
    href: '/byok',
    hrefLabel: 'How BYOK works',
  },
  {
    sector: 'IT services · Unattended runs',
    title: 'A provider repeating the same checks across client estates',
    problem:
      'Overnight alert triage, certificate expiry sweeps, and ticket intake repeat across dozens of client environments, and doing them by hand makes coverage a function of headcount.',
    mechanics: [
      {
        label: 'Trigger sources',
        value:
          'agi --daemon reads ~/.agiworkforce/triggers.json and runs what it finds there: cron schedules, webhook endpoints, and filesystem watchers.',
      },
      {
        label: 'Tool scope',
        value:
          'An unattended session holds three tools: read_file, search_files, and list_directory. Anything mutating is denied outright, because no one is sitting at the prompt to refuse it.',
      },
      {
        label: 'Audit log',
        value:
          'Each firing writes one JSON record into ~/.agiworkforce/daemon-logs, restricted to its owner, with known secret patterns redacted out of the prompt and the response first.',
      },
      {
        label: 'Plan tier',
        value: `Run this on managed cloud instead and the gates change: AGI Work needs ${BILLING_PLAN_PRICING.pro.label} or above, and scheduled tasks are capped per plan at ${BASIC_SCHEDULES} on ${BILLING_PLAN_PRICING.basic.label} and ${PRO_SCHEDULES} on ${BILLING_PLAN_PRICING.pro.label}.`,
      },
    ],
    caveat:
      'A trigger can read and report; it cannot edit a file or run a shell command, so remediation still lands on an engineer. You also have to write the runbook each trigger follows, because AGI will not discover your clients’ processes on your behalf.',
    meta: `CLI · ${SURFACE_STATUS.cli}`,
    status: 'No AGI account required for this route',
    href: '/cli',
    hrefLabel: 'How the CLI runs unattended',
  },
];

export default function CustomersPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-customers-title"
          eyebrow="Customers"
          title="Only written permission puts a name on this page."
          lede='Nobody has given us that permission yet, so there are no logos here, no testimonials, and no anonymised "a leading bank". What stands in their place is three situations built entirely out of behaviour that has shipped, with the part AGI declines to do written next to the part it does.'
          ctas={[
            { href: '/login?redirectTo=%2F', label: 'Try AGI Web' },
            { href: '/pricing', label: 'See what a plan includes', variant: 'secondary' },
          ]}
        />

        <Section id="scenarios" labelledBy="agi-customers-scenarios-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Worked scenarios</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-customers-scenarios-title">
                A scenario that only lists benefits would be an advertisement.
              </h2>
              <Prose>
                None of these is a customer. Each is a configuration we have built, named down to
                the command that proves it: the surface it runs on, the mechanics underneath, the
                plan limit it meets, and the work it hands back to you. Follow the link under any of
                them and you can check the claim against the product yourself.
              </Prose>
            </div>

            {SCENARIOS.map((scenario) => (
              <Stack gap="base" key={scenario.title}>
                <Eyebrow>{scenario.sector}</Eyebrow>
                <h3 className="agi-ds-h3">{scenario.title}</h3>
                <Prose>{scenario.problem}</Prose>
                <Ledger caption={scenario.title} rows={scenario.mechanics} />
                <Prose>
                  <strong>What it does not do.</strong> {scenario.caveat}
                </Prose>
                <Prose size="sm">
                  {scenario.meta} · {scenario.status}
                </Prose>
                <ButtonRow>
                  <Button href={scenario.href} variant="secondary">
                    {scenario.hrefLabel}
                  </Button>
                </ButtonRow>
              </Stack>
            ))}
          </Stack>
        </Section>

        <Section id="names-policy" labelledBy="agi-customers-policy-title" rule ground="2">
          <Stack gap="loose">
            <Eyebrow>Our policy on names</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-customers-policy-title">
              A name appears here only after someone has put it in writing.
            </h2>
            <Prose>
              We publish a customer name only with written permission, and we do not fall back on
              anonymised descriptions specific enough to identify someone who never agreed to be
              identified. Until a customer says yes in writing, this page stays exactly as you are
              reading it.
            </Prose>
          </Stack>
        </Section>

        <Section id="customers-close" labelledBy="agi-customers-close-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Permission</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-customers-close-title">
                We will ask you before your name ever appears here.
              </h2>
              <Prose>
                {`AGI Web is ${SURFACE_STATUS.web.toLowerCase()}, and every other surface reports its own state on the download page rather than in a claim on this one. If AGI earns a place in how you work and you are willing to say so in writing, this page will finally carry something other than worked examples.`}
              </Prose>
              <Prose size="sm">Nothing on this page is a customer reference.</Prose>
            </div>
            <ButtonRow>
              <Button href="/contact-sales">Tell us we can use your name</Button>
            </ButtonRow>
          </Stack>
        </Section>

        <MarketingFooter />
      </main>
    </div>
  );
}
