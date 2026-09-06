import Link from 'next/link';
import { BILLING_PLAN_PRICING, MIN_PURCHASABLE_SEATS } from '@agiworkforce/types';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { ConsoleWindow } from '@/features/marketing/components/FeatureScenes';
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
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { BYOK_SURFACES, SURFACE_STATUS } from '@/lib/marketing-constants';
import '@/features/marketing/components/pages/business/data-table.css';

export const metadata = buildMetadata({
  title: 'AGI for Business: who pays for what, and where the ceiling sits',
  description:
    'The cost side of an AGI rollout: Local and BYOK carry no charge from us, managed cloud is the only route we bill, and a run can be capped in dollars before it starts.',
  path: '/business',
});

const FREE_ROUTE_CHARGE = `$${BILLING_PLAN_PRICING['local-only'].monthlyPriceUsd}`;
const TEAM_PLAN = BILLING_PLAN_PRICING.team;

export default function BusinessPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-business-title"
          eyebrow="AGI for business"
          title="AGI bills you nothing until you buy managed capacity."
          lede="Local runs on hardware you already own, and BYOK sends every request to a provider you already hold a contract with, so a pilot produces no invoice from us at all. Hosted compute is a separate purchase with a stated capacity, and spending past that capacity stays switched off until someone switches it on."
          ctas={[
            { href: '/contact-sales', label: 'Talk to sales' },
            {
              href: '/pricing#pricing-team-title',
              label: 'See seat pricing',
              variant: 'secondary',
            },
          ]}
          visual={<ConsoleWindow view="usage" />}
        />

        <Section id="cost-ownership" labelledBy="agi-business-cost-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Cost ownership</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-business-cost-title">
                Each route sends the bill somewhere different.
              </h2>
            </div>
            <div
              aria-label="Each route sends the bill somewhere different"
              role="region"
              tabIndex={0}
              className="agi-ds-compare-table-wrap"
            >
              <table className="agi-ds-compare-table">
                <thead>
                  <tr>
                    <th scope="col">Route</th>
                    <th scope="col">Who invoices you</th>
                    <th scope="col">What AGI charges</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Local</td>
                    <td>
                      No one. The model runs on hardware you already own, at whatever that hardware
                      costs you to keep running.
                    </td>
                    <td>{FREE_ROUTE_CHARGE}</td>
                  </tr>
                  <tr>
                    <td>BYOK</td>
                    <td>
                      Your provider, on the rate card and contract you already hold. Keys stay in
                      the {BYOK_SURFACES.label} runtimes, so we never sit in the payment path.
                    </td>
                    <td>{FREE_ROUTE_CHARGE}</td>
                  </tr>
                  <tr>
                    <td>AGI managed cloud</td>
                    <td>
                      AGI, on the plan the account carries. This is the only route where the compute
                      lands on our invoice.
                    </td>
                    <td>
                      ${TEAM_PLAN.monthlyPriceUsd} per seat each month on {TEAM_PLAN.label}, sold
                      from {MIN_PURCHASABLE_SEATS} seats. Individual plans and contract pricing are
                      on the <Link href="/pricing">pricing page</Link>.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Stack>
        </Section>

        <Section id="spend-controls" labelledBy="agi-business-controls-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Spend controls</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-business-controls-title">
                A ceiling you set is a ceiling the agent stops at.
              </h2>
              <Prose>
                The dollar cap described below is a flag on the <Link href="/cli">AGI CLI</Link>,
                whose release status reads {SURFACE_STATUS.cli.toLowerCase()}. The plan limits and
                the overage switch below are live on the web account today.
              </Prose>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Run cap',
                  title: 'A dollar cap on the run',
                  body: 'Pass --max-budget-usd and the agent loop halts before it issues the next provider request, printing the cumulative spend against the cap. With --json-events it also emits a budget_exhausted record for a pipeline to fail the job on.',
                },
                {
                  meta: 'Overage',
                  title: 'Overage stays switched off',
                  body: 'Continuing past a managed usage limit spends prepaid credits, and only once the account turns that on. Leave the switch alone and the limit simply holds: there is no balance to drain and no charge beyond the plan.',
                },
                {
                  meta: 'Capacity',
                  title: 'Capacity is written into the plan',
                  body: 'Every managed plan carries a fixed monthly, weekly and five-hour allowance, and the account shows how much of each window is used. Local and BYOK carry none of it, because neither route draws on managed compute.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="buying-it" labelledBy="agi-business-buying-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Buying it</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-business-buying-title">
                This is what buying it actually involves.
              </h2>
            </div>
            <Ledger
              caption="How buying AGI works"
              rows={[
                {
                  label: 'Seats',
                  value: (
                    <>
                      {TEAM_PLAN.label} is billed per seat from a {MIN_PURCHASABLE_SEATS}-seat
                      minimum. What those seats unlock (shared projects, membership, connector
                      approvals) is written up on the <Link href="/teams">teams page</Link>.
                    </>
                  ),
                },
                {
                  label: 'Invoices',
                  value:
                    'Paid plans bill through Stripe. Billing settings list each invoice by date, amount and status, and link out to the hosted copy Stripe holds.',
                },
                {
                  label: 'Credits',
                  value:
                    'Credit top-ups are prepaid, and the account ledger lists every purchase, deduction, refund and adjustment against them.',
                },
                {
                  label: 'Free routes',
                  value:
                    'Local and BYOK need no plan and no seat count, so headcount on those routes changes nothing about what you owe us.',
                },
                {
                  label: 'Enterprise',
                  value: (
                    <>
                      Priced on a contract. Single sign-on, directory provisioning, audit export and
                      retention are set out control by control, built and unbuilt alike, on the{' '}
                      <Link href="/enterprise">enterprise page</Link>.
                    </>
                  ),
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="business-close" labelledBy="agi-business-close-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Where to start</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-business-close-title">
                Point it at a key you already pay for.
              </h2>
              <Prose>
                Install the CLI, add a provider key, and the evaluation runs as long as it needs to
                on a bill that already exists. Nothing here requires a plan, a seat count, or a
                conversation with us first.
              </Prose>
            </div>
            <ButtonRow>
              <Button href="/download">Get the CLI</Button>
              <Button href="/byok" variant="secondary">
                Read the BYOK billing posture
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <MarketingFooter />
      </main>
    </div>
  );
}
