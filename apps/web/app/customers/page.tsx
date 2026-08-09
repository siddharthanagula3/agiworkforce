import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';

export const metadata = buildMetadata({
  title: 'Customers',
  description:
    'No logos and no testimonials — we have none cleared to publish. Instead: three worked scenarios showing which surface, which trust boundary, and which plan tier each one needs.',
  path: '/customers',
});

/**
 * WHY THIS PAGE HAS NO LOGOS.
 *
 * There is no named, permission-cleared customer to show, and inventing one —
 * or implying one with vague "teams like yours" copy — is the single fastest
 * way to lose an enterprise procurement review. The page is therefore designed
 * so it does not NEED social proof: it substitutes depth a reader can verify
 * for names they would have to take on faith.
 *
 * Every scenario below states its plan gate honestly, including the ones that
 * cost money. Claiming a Pro-gated capability is free would repeat exactly the
 * "frontier access on Free" error a prior audit caught.
 *   - Managed Cloud on CLI / VS Code / Chrome requires the `developer_surfaces`
 *     capability = Pro and above (apps/web/lib/free-chat-surface-policy.ts,
 *     BILLING_PLAN_CAPABILITY_TIERS in packages/contracts/types).
 *   - Scheduled work (`agi_work`) is likewise Pro and above.
 *   - Local and BYOK are NOT plan-gated — that is the point of the first two
 *     scenarios, and it is the honest answer to "what can we trial for free".
 * No prices appear here; /pricing owns those.
 */
const SCENARIOS: {
  meta: string;
  title: string;
  problem: string;
  shape: { k: string; v: string }[];
  caveat: string;
  href: string;
  hrefLabel: string;
}[] = [
  {
    meta: 'Engineering',
    title: 'A team that cannot send code to a third party',
    problem:
      'Source code is under an NDA that forbids sending it to an external model provider. Most AI coding tools are therefore unusable — not because of quality, but because of where inference happens.',
    shape: [
      { k: 'Surface', v: 'AGI CLI and AGI Desktop' },
      { k: 'Trust boundary', v: 'Local — models run on the developer’s own hardware' },
      { k: 'Models', v: 'Local runtimes: Ollama, LM Studio, llama.cpp, vLLM' },
      { k: 'Plan gate', v: 'None. Local mode is not plan-gated and needs no account.' },
      { k: 'Network', v: 'Works offline. Nothing leaves the machine.' },
    ],
    caveat:
      'You supply the hardware and the model weights, and a local model will not match a frontier hosted model on the hardest problems. The trade is capability for containment — make it deliberately.',
    href: '/local',
    hrefLabel: 'How Local mode works',
  },
  {
    meta: 'Consulting',
    title: 'A firm billing model spend to specific clients',
    problem:
      'Each client engagement has to carry its own AI cost, and the firm does not want a platform vendor sitting between it and the provider invoice it has to justify.',
    shape: [
      { k: 'Surface', v: 'AGI Desktop and AGI CLI' },
      { k: 'Trust boundary', v: 'BYOK — the firm’s own provider keys' },
      {
        k: 'Billing',
        v: 'The provider bills the firm directly. AGI adds no markup and no metering.',
      },
      { k: 'Key handling', v: 'Keys are stored encrypted on the machine, not on our servers.' },
      { k: 'Plan gate', v: 'None for BYOK on Desktop and CLI.' },
    ],
    caveat:
      'Per-client cost attribution comes from your provider’s own billing tooling — separate keys or projects per client. AGI does not currently produce a per-client spend report for you.',
    href: '/byok',
    hrefLabel: 'How BYOK works',
  },
  {
    meta: 'IT services',
    title: 'A provider automating recurring client work',
    problem:
      'The same triage, runbook, and reporting tasks repeat across many client environments, and running them by hand does not scale with headcount.',
    shape: [
      { k: 'Surface', v: 'AGI Desktop, with the CLI for scripted runs' },
      { k: 'Trust boundary', v: 'Any — Local, BYOK, or managed cloud, chosen per client policy' },
      {
        k: 'Capability',
        v: 'Scheduled work (AGI Work), plus MCP connectors behind tool approvals',
      },
      { k: 'Plan gate', v: 'Scheduled work is a paid capability — Pro tier and above.' },
      {
        k: 'Control',
        v: 'File edits and shell commands prompt for approval unless you raise autonomy.',
      },
    ],
    caveat:
      'This is the scenario that needs a paid plan, and it needs you to define the runbooks. AGI executes and reports; it does not discover your clients’ processes for you.',
    href: '/agi-work',
    hrefLabel: 'How scheduled work works',
  },
];

export default function CustomersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-customers-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Customers</p>
          <h1 id="agi-customers-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">No logos.</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">Worked examples instead.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            We have no customer stories cleared to publish, so there are none on this page — no
            logos, no testimonials, no anonymous &ldquo;a leading bank&rdquo;.{' '}
            <strong>
              What follows instead is three concrete situations, each stating the surface, the trust
              boundary, the plan tier it needs, and what it still leaves you to do.
            </strong>{' '}
            You can check every claim in them against the product.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <div className="agi-fl-cta-row">
              <Link href="/login?redirectTo=%2F" className="agi-fl-cta agi-fl-cta--primary">
                Try AGI Web
              </Link>
              <Link href="/contact-sales" className="agi-fl-cta agi-fl-cta--secondary">
                Talk to Sales
              </Link>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-customers-scenarios-title">
          <p className="agi-fl-eyebrow">Worked scenarios</p>
          <h2 id="agi-customers-scenarios-title" className="agi-fl-h2">
            Three situations, in full.
          </h2>
          <p className="agi-fl-section-lede">
            Each one names what it costs you in effort and capability, not just what it gives you. A
            scenario that only lists benefits is an advertisement, not evidence.
          </p>

          <div className="agi-scenarios">
            {SCENARIOS.map((s) => (
              <article key={s.title} className="agi-scenario">
                <p className="agi-scenario-meta">{s.meta}</p>
                <h3 className="agi-scenario-title">{s.title}</h3>
                <p className="agi-scenario-problem">{s.problem}</p>
                <dl className="agi-scenario-shape">
                  {s.shape.map((row) => (
                    <div key={row.k} className="agi-scenario-row">
                      <dt>{row.k}</dt>
                      <dd>{row.v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="agi-scenario-caveat">
                  <span className="agi-scenario-caveat-tag">What it does not do</span>
                  {s.caveat}
                </p>
                <Link href={s.href} className="agi-scenario-link">
                  {s.hrefLabel} &rarr;
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-customers-policy-title">
          <p className="agi-fl-eyebrow">Our policy on names</p>
          <h2 id="agi-customers-policy-title" className="agi-fl-h2">
            When a customer does appear here.
          </h2>
          <p className="agi-fl-section-lede">
            We publish a customer name only with written permission, and we do not use anonymised
            descriptions that are specific enough to identify someone who did not agree to be
            identified. Until a customer has said yes in writing, this page stays exactly as it is.
          </p>
        </section>

        <FinalCta
          eyebrow="Use it"
          title="Be the case study we ask to publish."
          body="AGI Web runs in the browser now, and Desktop and the CLI are released for Local and BYOK work. If it earns a place in your stack, we will ask your permission before your name ever appears here."
          ctas={[
            { href: '/login?redirectTo=%2F', label: 'Try AGI Web' },
            { href: '/download', label: 'Get AGI Desktop' },
            { href: '/contact-sales', label: 'Talk to Sales' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
