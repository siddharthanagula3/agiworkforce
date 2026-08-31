import Link from 'next/link';
import { BILLING_PLAN_PRICING, MIN_PURCHASABLE_SEATS } from '@agiworkforce/types';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import type { TerminalLine } from '@/features/marketing/components/DeviceMockups';
import { BYOK_SURFACES, SURFACE_STATUS } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI for Business: who pays for what, and where the ceiling sits',
  description:
    'The cost side of an AGI rollout: Local and BYOK carry no charge from us, managed cloud is the only route we bill, and a run can be capped in dollars before it starts.',
  path: '/business',
});

const FREE_ROUTE_CHARGE = `$${BILLING_PLAN_PRICING['local-only'].monthlyPriceUsd}`;
const TEAM_PLAN = BILLING_PLAN_PRICING.team;

const SPEND_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi auth-status' },
  { kind: 'out', text: 'Provider           Type       Status       Expires' },
  { kind: 'dim', text: '------------------------------------------------------------' },
  { kind: 'out', text: 'anthropic          api_key    active       -' },
  { kind: 'out', text: 'openai             api_key    active       -' },
  { kind: 'cmd', text: 'agi --print "summarise q3 spend" --max-budget-usd 0.50' },
  { kind: 'ok', text: '  Budget cap reached: $0.5012 >= $0.5000. Stopping agent loop.' },
];

const SPEND_HUD = { tokensIn: 125067, tokensOut: 8400, cost: '$0.5012', ctx: '63%' };

export default function BusinessPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI for business"
          titleLines={['AGI bills you nothing until you buy managed capacity.']}
          em="bills you nothing"
          lede="Local runs on hardware you already own, and BYOK sends every request to a provider you already hold a contract with, so a pilot produces no invoice from us at all. Hosted compute is a separate purchase with a stated capacity, and spending past that capacity stays switched off until someone switches it on."
          ctas={[
            { href: '/contact-sales', label: 'Talk to sales' },
            { href: '/pricing#pricing-team-title', label: 'See seat pricing' },
          ]}
          modeRibbon={[]}
          visual={
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="BYOK"
              routeMode="byok"
              session={SPEND_SESSION}
              hud={SPEND_HUD}
            />
          }
        />

        <section className="agi-fl-section" aria-labelledby="agi-business-payer-title">
          <p className="agi-fl-eyebrow">Cost ownership</p>
          <h2 id="agi-business-payer-title" className="agi-fl-h2">
            Each route sends the bill somewhere different.
          </h2>
          {/* `.agi-ledger` has no overflow handling of its own — see the same
              fix in LedgerSection (LandingSections.tsx) and /docs/byok-env.
              This table's prose wraps at word boundaries today, but nothing
              stops a future edit from dropping in an unbreakable value and
              forcing it past the viewport silently. */}
          <div
            aria-label="Each route sends the bill somewhere different"
            role="region"
            tabIndex={0}
            style={{ overflowX: 'auto' }}
          >
            <table className="agi-ledger">
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
                    Your provider, on the rate card and contract you already hold. Keys stay in the{' '}
                    {BYOK_SURFACES.label} runtimes, so we never sit in the payment path.
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
                    ${TEAM_PLAN.monthlyPriceUsd} per seat each month on {TEAM_PLAN.label}, sold from{' '}
                    {MIN_PURCHASABLE_SEATS} seats. Individual plans and contract pricing are on the{' '}
                    <Link href="/pricing">pricing page</Link>.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-business-controls-title">
          <p className="agi-fl-eyebrow">Spend controls</p>
          <h2 id="agi-business-controls-title" className="agi-fl-h2">
            A ceiling you set is a ceiling the agent stops at.
          </h2>
          <p className="agi-fl-section-lede">
            The dollar cap in the frame above is a flag on the <Link href="/cli">AGI CLI</Link>,
            whose release status reads {SURFACE_STATUS.cli.toLowerCase()}. The plan limits and the
            overage switch below are live on the web account today.
          </p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">A dollar cap on the run</h3>
              <p className="agi-reason-p">
                Pass --max-budget-usd and the agent loop halts before it issues the next provider
                request, printing the cumulative spend against the cap. With --json-events it also
                emits a budget_exhausted record for a pipeline to fail the job on.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Overage stays switched off</h3>
              <p className="agi-reason-p">
                Continuing past a managed usage limit spends prepaid credits, and only once the
                account turns that on. Leave the switch alone and the limit simply holds — there is
                no balance to drain and no charge beyond the plan.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Capacity is written into the plan</h3>
              <p className="agi-reason-p">
                Every managed plan carries a fixed monthly, weekly and five-hour allowance, and the
                account shows how much of each window is used. Local and BYOK carry none of it,
                because neither route draws on managed compute.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-business-buying-title">
          <p className="agi-fl-eyebrow">Buying it</p>
          <h2 id="agi-business-buying-title" className="agi-fl-h2">
            This is what buying it actually involves.
          </h2>
          <dl className="agi-colophon">
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Seats</dt>
              <dd className="agi-colophon-val">
                {TEAM_PLAN.label} is billed per seat from a {MIN_PURCHASABLE_SEATS}-seat minimum.
                What those seats unlock — shared projects, membership, connector approvals — is
                written up on the <Link href="/teams">teams page</Link>.
              </dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Invoices</dt>
              <dd className="agi-colophon-val">
                Paid plans bill through Stripe. Billing settings list each invoice by date, amount
                and status, and link out to the hosted copy Stripe holds.
              </dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Credits</dt>
              <dd className="agi-colophon-val">
                Credit top-ups are prepaid, and the account ledger lists every purchase, deduction,
                refund and adjustment against them.
              </dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Free routes</dt>
              <dd className="agi-colophon-val">
                Local and BYOK need no plan and no seat count, so headcount on those routes changes
                nothing about what you owe us.
              </dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Enterprise</dt>
              <dd className="agi-colophon-val">
                Priced on a contract. Single sign-on, directory provisioning, audit export and
                retention are set out control by control, built and unbuilt alike, on the{' '}
                <Link href="/enterprise">enterprise page</Link>.
              </dd>
            </div>
          </dl>
        </section>

        <FinalCta
          eyebrow="Where to start"
          title="Point it at a key you already pay for."
          body="Install AGI Desktop, add a provider key, and the evaluation runs as long as it needs to on a bill that already exists. Nothing here requires a plan, a seat count, or a conversation with us first."
          ctas={[
            { href: '/download', label: 'Get AGI Desktop' },
            { href: '/byok', label: 'Read the BYOK billing posture' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
