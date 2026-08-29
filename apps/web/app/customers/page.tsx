import { buildMetadata } from '@/lib/seo/metadata';
import { getModels } from '@agiworkforce/types';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame, type TerminalLine } from '@/features/marketing/components/ProductFrame';
import type { TerminalWindowProps } from '@/features/marketing/components/DeviceMockups';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { BILLING_PLAN_PRICING, BILLING_PLAN_PRODUCT_LIMITS } from '@agiworkforce/types';
import {
  BYOK_SURFACES,
  DESKTOP_LOCAL_RUNTIMES,
  SURFACE_STATUS,
} from '../../lib/marketing-constants';

const WORKED_EXAMPLE_MODEL =
  getModels({ modelTypes: ['chat'] }).find((model) => model.capabilities.thinking)?.id ?? '';

export const metadata = buildMetadata({
  title: 'Customers',
  description:
    'We print no customer name without written permission, so this page carries none. It works through three situations instead, each naming the surface it runs on, the mechanics behind it, the plan limit it meets, and the work it leaves to you.',
  path: '/customers',
});

const LOCAL_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi models status' },
  { kind: 'out', text: 'Local model servers' },
  { kind: 'out', text: 'ollama  running  http://localhost:11434' },
  { kind: 'out', text: '  models:' },
  { kind: 'out', text: '    - qwen2.5-coder:14b' },
  { kind: 'cmd', text: 'agi exec --provider ollama "who logs a raw tenant id?"' },
  { kind: 'out', text: 'src/ledger.rs logs it twice unredacted: the retry' },
  { kind: 'out', text: 'branch and the error mapper.' },
  { kind: 'ok', text: 'cost: Tokens: 3120 in / 640 out (no cost — local model)' },
];

const RATE_CARD_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: `agi --cost --model ${WORKED_EXAMPLE_MODEL}` },
  { kind: 'out', text: `Model '${WORKED_EXAMPLE_MODEL}' pricing:` },
  { kind: 'out', text: '  Base:' },
  { kind: 'out', text: '    Input:       $3.00/1M tokens' },
  { kind: 'out', text: '    Output:      $15.00/1M tokens' },
  { kind: 'out', text: '    Cache read:  $0.3000/1M tokens' },
  { kind: 'out', text: '    Cache write: $3.75/1M tokens' },
];

const DAEMON_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi --daemon' },
  { kind: 'ok', text: 'daemon: Starting with 3 trigger(s), max_parallel=4' },
  { kind: 'out', text: '  triage [cron] "Summarise overnight alerts"' },
  { kind: 'out', text: '  certs [cron] "List certs expiring in 30 days"' },
  { kind: 'out', text: '  intake [webhook] "Triage the ticket in this payload"' },
  { kind: 'dim', text: 'daemon: Webhook server listening on http://127.0.0.1:7891' },
  { kind: 'ok', text: "daemon: Trigger 'triage' completed in 41.3s [success]" },
];

const BASIC_SCHEDULES = BILLING_PLAN_PRODUCT_LIMITS.basic.maxScheduledTasks;
const PRO_SCHEDULES = BILLING_PLAN_PRODUCT_LIMITS.pro.maxScheduledTasks;

interface Scenario {
  sector: string;
  title: string;
  problem: string;
  mechanics: string[];
  caveat: string;
  meta: string;
  status: string;
  href: string;
  hrefLabel: string;
  frame: {
    title: string;
    badge: string;
    routeMode: 'local' | 'byok' | 'managed';
    session: readonly TerminalLine[];
    hud: TerminalWindowProps['hud'];
  };
}

const SCENARIOS: Scenario[] = [
  {
    sector: 'Engineering · Local mode',
    title: 'A team whose source cannot reach a third party',
    problem:
      'An NDA forbids sending this repository to an external model provider, which disqualifies most AI coding tools on the question of where inference happens, long before anyone gets to judge how well they answer.',
    mechanics: [
      `Desktop keeps one server URL per runtime — ${DESKTOP_LOCAL_RUNTIMES.label} — and fills its model picker from whatever that server answers with.`,
      'agi models status names every local server it can reach and the models sitting on each. A base URL that is not loopback never gets a request built for it.',
      'No AGI account takes part, and a finished run prints “no cost — local model” because there was nothing to bill.',
      `The ${BILLING_PLAN_PRICING['local-only'].label} plan tier is priced at zero and puts no cap on work you run against your own hardware.`,
    ],
    caveat:
      'AGI supplies neither the hardware nor the weights, and a model you host will lose to a frontier hosted model on the hardest problems. That is capability traded for containment, and it is a trade you have to want.',
    meta: `Desktop · ${SURFACE_STATUS.desktop}`,
    status: `CLI · ${SURFACE_STATUS.cli}`,
    href: '/local',
    hrefLabel: 'How Local mode works',
    frame: {
      title: 'agi · zsh',
      badge: 'ollama',
      routeMode: 'local',
      session: LOCAL_SESSION,
      hud: { tokensIn: 3120, tokensOut: 640, cost: '$0.0000', ctx: '9%' },
    },
  },
  {
    sector: 'Consulting · BYOK',
    title: 'A firm that charges model spend back to a client',
    problem:
      'Every engagement has to carry its own AI cost, and the firm will not put a platform vendor between itself and the invoice it has to justify line by line to the client paying it.',
    mechanics: [
      'Each surface writes the key into its own platform credential store, so one engagement’s key stays on the one machine that engagement runs from.',
      'Requests reach the provider endpoint directly, so the usage lands on the firm’s own provider account and shows up on the firm’s own invoice.',
      'The command above prints the same catalog rate card the CLI estimates from, so the arithmetic behind a cost line is inspectable before a run starts.',
      '--max-budget-usd ends a run once estimated spend passes a ceiling you set, which keeps a runaway loop off a client’s bill.',
      `The ${BILLING_PLAN_PRICING.byok.label} plan tier is priced at zero, which leaves the provider invoice as the only bill in the arrangement.`,
    ],
    caveat:
      'Per-client attribution comes out of your provider’s own billing tooling, one key or project per engagement. The number the CLI prints is an estimate from a local rate table; AGI never sees your invoice and writes no per-client spend report for you.',
    meta: BYOK_SURFACES.compact,
    status: 'No AGI charge on this route',
    href: '/byok',
    hrefLabel: 'How BYOK works',
    frame: {
      title: 'agi · rates',
      badge: 'BYOK',
      routeMode: 'byok',
      session: RATE_CARD_SESSION,
      hud: { tokensIn: 18420, tokensOut: 5310, cost: 'provider billed', ctx: '12%' },
    },
  },
  {
    sector: 'IT services · Unattended runs',
    title: 'A provider repeating the same checks across client estates',
    problem:
      'Overnight alert triage, certificate expiry sweeps, and ticket intake repeat across dozens of client environments, and doing them by hand makes coverage a function of headcount.',
    mechanics: [
      'agi --daemon reads ~/.agiworkforce/triggers.json and runs what it finds there: cron schedules, webhook endpoints, and filesystem watchers.',
      'An unattended session holds three tools — read_file, search_files, and list_directory. Anything mutating is denied outright, because no one is sitting at the prompt to refuse it.',
      'Each firing writes one JSON record into ~/.agiworkforce/daemon-logs, restricted to its owner, with known secret patterns redacted out of the prompt and the response first.',
      `Run this on managed cloud instead and the gates change: AGI Work needs ${BILLING_PLAN_PRICING.pro.label} or above, and scheduled tasks are capped per plan at ${BASIC_SCHEDULES} on ${BILLING_PLAN_PRICING.basic.label} and ${PRO_SCHEDULES} on ${BILLING_PLAN_PRICING.pro.label}.`,
    ],
    caveat:
      'A trigger can read and report; it cannot edit a file or run a shell command, so remediation still lands on an engineer. You also have to write the runbook each trigger follows, because AGI will not discover your clients’ processes on your behalf.',
    meta: `CLI · ${SURFACE_STATUS.cli}`,
    status: SURFACE_STATUS.cli,
    href: '/cli',
    hrefLabel: 'How the CLI runs unattended',
    frame: {
      title: 'agi · daemon',
      badge: 'unattended',
      routeMode: 'local',
      session: DAEMON_SESSION,
      hud: false,
    },
  },
];

export default function CustomersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="Customers"
          titleLines={['Only written permission puts a name on this page.']}
          em="written permission"
          lede="Nobody has given us that permission yet, so there are no logos here, no testimonials, and no anonymised “a leading bank”. What stands in their place is three situations built entirely out of behaviour that has shipped, with the part AGI declines to do written next to the part it does."
          ctas={[
            { href: '/login?redirectTo=%2F', label: 'Try AGI Web' },
            { href: '/pricing', label: 'See what a plan includes' },
          ]}
          modeRibbon={[]}
        />

        <section className="agi-fl-section" aria-labelledby="agi-customers-scenarios-title">
          <p className="agi-fl-eyebrow">Worked scenarios</p>
          <h2 id="agi-customers-scenarios-title" className="agi-fl-h2">
            A scenario that only lists benefits would be an advertisement.
          </h2>
          <p className="agi-fl-section-lede">
            None of these is a customer. Each is a configuration we have built, named down to the
            command that proves it: the surface it runs on, the mechanics underneath, the plan limit
            it meets, and the work it hands back to you. Follow the link under any of them and you
            can check the claim against the product yourself.
          </p>

          <ol className="agi-fl-surface-list">
            {SCENARIOS.map((scenario) => (
              <li key={scenario.title} className="agi-fl-surface-row">
                <div className="agi-fl-surface-copy">
                  <p className="agi-fl-eyebrow">{scenario.sector}</p>
                  <h3 className="agi-fl-surface-name">{scenario.title}</h3>
                  <p className="agi-fl-surface-body">{scenario.problem}</p>
                  <ul className="agi-fl-trust-points">
                    {scenario.mechanics.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <p className="agi-fl-surface-body">
                    <strong>What it does not do.</strong> {scenario.caveat}
                  </p>
                  <p className="agi-fl-surface-meta">
                    <span>{scenario.meta}</span>
                    <span className="agi-fl-surface-status">{scenario.status}</span>
                  </p>
                  <div className="agi-fl-cta-row agi-fl-cta-row--sm">
                    <Link href={scenario.href} className="agi-fl-cta agi-fl-cta--ghost">
                      {scenario.hrefLabel}
                    </Link>
                  </div>
                </div>
                <div className="agi-fl-surface-visual">
                  <ProductFrame
                    variant="terminal"
                    title={scenario.frame.title}
                    badge={scenario.frame.badge}
                    routeMode={scenario.frame.routeMode}
                    session={scenario.frame.session}
                    hud={scenario.frame.hud}
                  />
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-customers-policy-title">
          <p className="agi-fl-eyebrow">Our policy on names</p>
          <h2 id="agi-customers-policy-title" className="agi-fl-h2">
            A name appears here only after someone has put it in writing.
          </h2>
          <p className="agi-fl-section-lede">
            We publish a customer name only with written permission, and we do not fall back on
            anonymised descriptions specific enough to identify someone who never agreed to be
            identified. Until a customer says yes in writing, this page stays exactly as you are
            reading it.
          </p>
        </section>

        <FinalCta
          eyebrow="Permission"
          title="We will ask you before your name ever appears here."
          body={`AGI Web is ${SURFACE_STATUS.web.toLowerCase()}, and every other surface reports its own state on the download page rather than in a claim on this one. If AGI earns a place in how you work and you are willing to say so in writing, this page will finally carry something other than worked examples.`}
          ctas={[{ href: '/contact-sales', label: 'Tell us we can use your name' }]}
          stamp="Nothing on this page is a customer reference."
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
