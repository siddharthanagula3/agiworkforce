import type { Metadata } from 'next';
import type React from 'react';

import { EditorialPage } from '../../components/marketing/editorial/EditorialPage';
import { RuledSection } from '../../components/marketing/editorial/RuledSection';
import { Slug } from '../../components/marketing/editorial/Slug';
import { Specimen } from '../../components/marketing/editorial/Specimen';
import { MonoButton } from '../../components/marketing/editorial/MonoButton';
import { OpsizMorph } from '../../components/marketing/editorial/OpsizMorph';
import { StampComingSoon } from '../../components/marketing/editorial/StampComingSoon';
import { DispatchSection } from '../../components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'Rates | AGI Workforce',
  description:
    'Honest pricing. No tier theatre. Local + BYOK free forever. Hobby $10/mo, or $5/mo billed annually. Pro and Max waitlisted.',
  alternates: {
    canonical: 'https://agiworkforce.com/pricing',
  },
  openGraph: {
    title: 'Rates | AGI Workforce',
    description:
      'Honest pricing. No tier theatre. Local + BYOK free forever. Hobby $10/mo, or $5/mo billed annually.',
    url: 'https://agiworkforce.com/pricing',
    siteName: 'AGI Workforce',
    type: 'website',
  },
};

/* ── S1: Masthead ───────────────────────────────────────────────── */
function RatesHero() {
  return (
    <RuledSection tier="paper" id="rates-hero">
      <div className="py-20 md:py-28">
        <h1
          className="font-display font-[300] leading-[1.04]"
          style={{ fontSize: 'clamp(3rem, 7vw, 5rem)' }}
        >
          Honest pricing.
        </h1>
        <h1
          className="font-display font-[800] italic leading-[1.04] mt-1 inline-block border-b-[3px] border-[var(--color-rule)]"
          style={{ fontSize: 'clamp(3rem, 7vw, 5rem)' }}
        >
          No tier theatre.
        </h1>

        <div className="mt-8 max-w-prose">
          <Specimen columns={2}>
            <p className="font-body text-[1.0625rem] leading-[1.65] text-[var(--color-ink)]">
              Local-only and BYOK are free forever. Hobby is the only paid tier we ship at launch —
              managed cloud at $10/mo, or $5/mo if you pay annually. Pro and Max open after our
              security audit closes; you can join the waitlist below.
            </p>
          </Specimen>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <MonoButton variant="primary" href="/download" prefix="./">
            install
          </MonoButton>
          <MonoButton variant="ghost" href="#rate-card">
            read the rate card →
          </MonoButton>
        </div>
      </div>
    </RuledSection>
  );
}

/* ── S2: Rate Card ──────────────────────────────────────────────── */
function RateCard() {
  return (
    <RuledSection tier="paper" id="rate-card" slug={<Slug index="01" kicker="RATES" />}>
      <div className="py-16 md:py-24">
        <OpsizMorph as="h2" className="text-[var(--color-ink)] text-3xl md:text-5xl mb-10">
          Seven tiers. <em>Two are free.</em>
        </OpsizMorph>

        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full font-mono text-sm border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--color-rule)]">
                <th className="text-left py-3 pr-4 text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-quiet)] font-normal w-32">
                  &nbsp;
                </th>
                {['LOCAL', 'BYOK', 'HOBBY', 'PRO', 'PRO+', 'MAX', 'ENTERPRISE'].map((tier) => (
                  <th
                    key={tier}
                    className="text-left py-3 px-3 text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-quiet)] font-normal border-l border-[var(--color-rule-soft)]"
                  >
                    {tier}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-rule-soft)]">
              <RateRow
                label="Price"
                values={[
                  'Free',
                  'Free',
                  <span key="h" className="leading-tight inline-block">
                    $10/mo
                    <span className="block text-[10px] tracking-[0.06em] text-[var(--color-fg-quiet)]">
                      $5/mo billed yearly
                    </span>
                  </span>,
                  '$29.99/mo',
                  '$49.99/mo',
                  '$299.99/mo',
                  'Contact sales',
                ]}
              />
              <RateRow
                label="At launch"
                values={[
                  <ShippedMark key="l" />,
                  <ShippedMark key="b" />,
                  <ShippedMark key="h" />,
                  <span key="p" className="text-[var(--color-fg-muted)]">
                    ✗ waitlist
                  </span>,
                  <span key="pp" className="text-[var(--color-fg-muted)]">
                    ✗ waitlist
                  </span>,
                  <span key="m" className="text-[var(--color-fg-muted)]">
                    ✗ waitlist
                  </span>,
                  <ShippedMark key="e" />,
                ]}
              />
              <RateRow
                label="Storage"
                values={[
                  'SQLite local',
                  'Local or Supabase',
                  'Supabase us-east-2',
                  'Supabase us-east-2',
                  'Supabase us-east-2',
                  'Supabase us-east-2',
                  'Supabase + custom region',
                ]}
              />
              <RateRow
                label="LLM"
                values={[
                  'Ollama / LMStudio',
                  'Provider directly (BYOK)',
                  'Managed cloud',
                  'Managed cloud',
                  'Managed + flagship 15K/day',
                  'Managed + flagship 1M/mo',
                  'BYOK or managed',
                ]}
              />
              <RateRow
                label="Sync"
                values={[
                  'None',
                  'Cross-device (cloud mode)',
                  'Cross-device',
                  'Cross-device',
                  'Cross-device',
                  'Cross-device',
                  'Cross-device + custom retention',
                ]}
              />
              <RateRow
                label="Auth"
                values={[
                  'None',
                  'Supabase OAuth (cloud mode)',
                  'Supabase OAuth',
                  'Supabase OAuth',
                  'Supabase OAuth',
                  'Supabase OAuth',
                  'SSO (SAML/OIDC), SCIM',
                ]}
              />
              <RateRow
                label="Dispatch"
                values={['✗', '✓ (cloud mode)', '✓', '✓', '✓', '✓', '✓ + audit log']}
              />
              <RateRow
                label="Support"
                values={[
                  'Community',
                  'Community',
                  'Email 48h',
                  'Priority email 24h',
                  'Priority email 12h',
                  'Priority email 8h',
                  'Dedicated 4h SLA',
                ]}
              />
              <tr className="border-b border-[var(--color-rule)]">
                <td className="py-3 pr-4 text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-quiet)] font-normal align-top">
                  Status
                </td>
                {[
                  <StampComingSoon key="l" variant="shipped" />,
                  <StampComingSoon key="b" variant="shipped" />,
                  <StampComingSoon key="h" variant="shipped" />,
                  <StampComingSoon key="p" variant="waitlist" />,
                  <StampComingSoon key="pp" variant="waitlist" />,
                  <StampComingSoon key="m" variant="waitlist" />,
                  <span key="e" className="font-mono text-[10px] text-[var(--color-fg-muted)]">
                    Contact sales
                  </span>,
                ].map((cell, i) => (
                  <td
                    key={i}
                    className="py-3 px-3 border-l border-[var(--color-rule-soft)] align-middle"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-8 font-display italic text-lg text-[var(--color-ink)] max-w-prose">
          Pro, Pro+ and Max are on waitlist. Hobby is open. Enterprise is bespoke.
        </p>
      </div>
    </RuledSection>
  );
}

function RateRow({ label, values }: { label: string; values: (string | React.ReactNode)[] }) {
  return (
    <tr>
      <td className="py-3 pr-4 text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-quiet)] font-normal align-top">
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className="py-3 px-3 text-[var(--color-ink)] border-l border-[var(--color-rule-soft)] align-top"
        >
          {v}
        </td>
      ))}
    </tr>
  );
}

function ShippedMark() {
  return <span className="text-[var(--color-stamp-ok)]">✓</span>;
}

/* ── S3: Local vs BYOK ──────────────────────────────────────────── */
function LocalVsByok() {
  return (
    <RuledSection tier="paper" slug={<Slug index="02" kicker="LOCAL VS BYOK" />}>
      <div className="py-16 md:py-24">
        <h2
          className="font-display font-bold text-3xl md:text-4xl text-[var(--color-ink)] mb-8"
          style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)' }}
        >
          Two ways to start free.
        </h2>

        <Specimen columns={2} dropCap>
          <p>
            <strong>Local-only</strong> runs everything on your laptop. SQLite for conversations.
            Ollama or LM Studio for models. No internet required. No Supabase. No cross-device sync,
            no Dispatch, no auth — but also no leakage. Free forever, with zero rate limits and zero
            per-token cost.
          </p>
          <p>
            <strong>BYOK</strong> uses your own provider keys (Anthropic, OpenAI, Google, etc.). You
            pay them directly; we add zero markup. Conversations sync to Supabase across your
            devices in cloud mode. Dispatch works. Keys are AES-256-GCM encrypted at rest. Free
            forever as long as you bring keys.
          </p>
        </Specimen>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full font-mono text-sm border-collapse max-w-2xl">
            <thead>
              <tr className="border-b border-[var(--color-rule)]">
                <th className="text-left py-3 pr-8 text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-quiet)] font-normal">
                  When you need
                </th>
                <th className="text-left py-3 text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-quiet)] font-normal">
                  Pick
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-rule-soft)]">
              {[
                ['Offline, no internet, full privacy', 'Local'],
                ['Cross-device sync, mobile dispatch', 'BYOK'],
                ['Best frontier models (GPT-5, Claude 4)', 'BYOK'],
                ['Zero per-token cost', 'Local'],
                ['One thread across devices', 'BYOK'],
              ].map(([need, pick]) => (
                <tr key={need}>
                  <td className="py-3 pr-8 text-[var(--color-ink)]">{need}</td>
                  <td className="py-3 font-semibold text-[var(--color-amber-text)]">{pick}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </RuledSection>
  );
}

/* ── S4: Audit posture ──────────────────────────────────────────── */
function AuditPosture() {
  return (
    <RuledSection tier="paper" slug={<Slug index="03" kicker="AUDIT" />}>
      <div className="py-16 md:py-24">
        <h2
          className="font-display font-bold text-[var(--color-ink)] mb-8"
          style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)' }}
        >
          Why Pro and Max are waitlisted.
        </h2>

        <Specimen columns={2}>
          <p>
            We ran an internal red-team audit on 2026-05-03 and closed P0 13 of 14 and P1 20 of 25.
            The remaining items are documented openly. Pro and Max unlock when those close.
          </p>
          <p>
            The remaining P0 (CLI-5) is auth.json plaintext storage on disk, mitigated today by
            0o600 file permissions. The remaining P1s are scoped: DESK-5 (Vite env vars in process
            env), DESK-8 (in-RAM remembered choices), WEB-5 (CSRF for Bearer auth), WEB-11 (CSP
            unsafe-inline style).
          </p>
        </Specimen>

        <p className="mt-8 font-display italic text-lg text-[var(--color-ink)] max-w-prose">
          We&apos;d rather waitlist Pro than ship a tier with known security debt.
        </p>
      </div>
    </RuledSection>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function PricingPage() {
  return (
    <EditorialPage tier="mixed">
      <RatesHero />
      <RateCard />
      <LocalVsByok />
      <AuditPosture />
      <DispatchSection slugIndex="04" slugKicker="DISPATCH" />
    </EditorialPage>
  );
}
