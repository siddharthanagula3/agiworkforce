import type { Metadata } from 'next';

import { MARKETING } from '../../lib/marketing-constants';
import { EditorialPage } from '../../components/marketing/editorial/EditorialPage';
import { RuledSection } from '../../components/marketing/editorial/RuledSection';
import { Slug } from '../../components/marketing/editorial/Slug';
import { Specimen } from '../../components/marketing/editorial/Specimen';
import { OpsizMorph } from '../../components/marketing/editorial/OpsizMorph';
import { SurfaceIndex } from '../../components/marketing/editorial/SurfaceIndex';
import { DispatchSection } from '../../components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'About | AGI Workforce',
  description:
    'AGI Automation LLC. Austin, TX. We build a multi-provider AI agent platform across six surfaces.',
  keywords: [
    'AGI Automation LLC',
    'AGI Workforce',
    'AI automation company',
    'Austin TX startup',
    'AI agents',
    'multi-provider AI',
  ],
  alternates: {
    canonical: 'https://agiworkforce.com/about',
  },
  openGraph: {
    title: 'About | AGI Workforce',
    description:
      'AGI Automation LLC. Austin, TX. Multi-provider AI agent platform across six surfaces.',
    url: 'https://agiworkforce.com/about',
    siteName: 'AGI Workforce',
    type: 'website',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce - About',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About | AGI Workforce',
    description: 'AGI Automation LLC. Austin, TX. Multi-provider AI across six surfaces.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://agiworkforce.com/#organization',
      name: 'AGI Automation LLC',
      url: 'https://agiworkforce.com',
      logo: 'https://agiworkforce.com/logo.png',
      description:
        'AGI Automation LLC builds AGI Workforce, a multi-provider AI agent platform across six surfaces.',
      foundingDate: '2026',
      foundingLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Austin',
          addressRegion: 'TX',
          addressCountry: 'US',
        },
      },
      founder: {
        '@type': 'Person',
        '@id': 'https://agiworkforce.com/#founder',
        name: 'Siddhartha Nagula',
        jobTitle: 'Founder & CEO',
        worksFor: {
          '@id': 'https://agiworkforce.com/#organization',
        },
      },
      sameAs: [
        'https://www.linkedin.com/company/agi-automation-llc',
        'https://www.instagram.com/agiworkforce',
        'https://twitter.com/agiworkforce',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'contact@agiworkforce.com',
      },
    },
    {
      '@type': 'Person',
      '@id': 'https://agiworkforce.com/#founder',
      name: 'Siddhartha Nagula',
      jobTitle: 'Founder & CEO',
      description: 'Founder and CEO of AGI Automation LLC.',
      worksFor: {
        '@type': 'Organization',
        name: 'AGI Automation LLC',
      },
    },
    {
      '@type': 'WebPage',
      '@id': 'https://agiworkforce.com/about',
      url: 'https://agiworkforce.com/about',
      name: 'About - AGI Automation LLC',
      description: 'Learn about AGI Automation LLC, the company behind AGI Workforce.',
      isPartOf: { '@id': 'https://agiworkforce.com/#website' },
      about: { '@id': 'https://agiworkforce.com/#organization' },
    },
  ],
};

/* ── S1: Masthead colophon ──────────────────────────────────────── */
function AboutHero() {
  return (
    <RuledSection tier="paper" id="about-hero">
      <div className="py-20 md:py-28">
        <h1
          className="font-display font-[300] leading-[1.04]"
          style={{ fontSize: 'clamp(3rem, 7vw, 5rem)' }}
        >
          Multi-provider
        </h1>
        <h1
          className="font-display font-[800] italic leading-[1.04] mt-1 inline-block border-b-[3px] border-[var(--color-rule)]"
          style={{ fontSize: 'clamp(3rem, 7vw, 5rem)' }}
        >
          by design.
        </h1>

        <div className="mt-8 max-w-2xl">
          <Specimen columns={2}>
            <p>
              Anthropic locks you to Claude. OpenAI locks you to GPT. Google locks you to Gemini. We
              don&apos;t lock — we route.
            </p>
            <p>
              AGI Workforce is a multi-provider AI agent platform across six surfaces (CLI, Desktop,
              Web, Mobile, Chrome ext, VS Code ext). The CLI is the engine; the apps are surfaces
              over it.
            </p>
          </Specimen>
        </div>
      </div>
    </RuledSection>
  );
}

/* ── S2: Mission ────────────────────────────────────────────────── */
function Mission() {
  return (
    <RuledSection tier="paper" slug={<Slug index="01" kicker="MISSION" />}>
      <div className="py-16 md:py-24">
        <OpsizMorph as="h2" className="text-[var(--color-ink)] mb-8 text-3xl md:text-5xl">
          One thread. {MARKETING.providers.display} providers. <em>Yours.</em>
        </OpsizMorph>

        <Specimen columns={3} dropCap>
          <p>
            AGI capabilities are not arriving as a single model from a single vendor. They&apos;re
            emerging across providers, each with different strengths.
          </p>
          <p>
            Switching between them — mid-conversation, with full context preserved — is the
            practical reality of working with frontier AI in 2026. The infrastructure to do this
            cleanly didn&apos;t exist, so we built it.
          </p>
          <p>
            Our bet: the user, not the vendor, owns the keys, the data, and the choice of model. We
            shipped local LLM mode on day one for that reason.
          </p>
        </Specimen>
      </div>
    </RuledSection>
  );
}

/* ── S3: Operator's Colophon ────────────────────────────────────── */
function OperatorsColophon() {
  const rows: { label: string; value: string }[] = [
    { label: 'Legal entity', value: 'AGI Automation LLC' },
    { label: 'Headquarters', value: 'Austin, Texas, USA' },
    { label: 'Founded', value: '2026' },
    { label: 'License', value: 'Proprietary' },
    { label: 'Region', value: 'us-east-2 (Supabase)' },
    { label: 'Set in', value: 'Newsreader & JetBrains Mono' },
    { label: 'Engine', value: 'Pure Rust CLI · 195 .rs files · 2,161 tests' },
    { label: 'Surfaces', value: '6 (CLI, Desktop, Web, Mobile, Chrome ext, VS Code ext)' },
    { label: 'Providers', value: '12 (10+ as a count includes BYO endpoints)' },
    { label: 'Audit posture', value: 'P0 13/14 closed · P1 20/25 closed (2026-05-03)' },
    { label: 'Compliance', value: 'SOC2 in progress · GDPR DPA available · No HIPAA cert' },
    { label: 'Data policy', value: 'We do not train on your data.' },
  ];

  return (
    <RuledSection tier="graphite" slug={<Slug index="02" kicker="COLOPHON" />}>
      <div className="py-16 md:py-24">
        <h2
          className="font-display italic font-bold text-[var(--color-cream-on-graphite)] mb-12"
          style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)' }}
        >
          Built by AGI Automation LLC.
        </h2>

        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 font-mono text-sm">
          {rows.map(({ label, value }) => (
            <div key={label} className="border-b border-[var(--color-rule-soft)] pb-4">
              <dt className="text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-quiet)] mb-1">
                {label}
              </dt>
              <dd className="font-display italic text-[1.125rem] text-[var(--color-cream-on-graphite)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 font-display italic text-lg text-[var(--color-cream-on-graphite)]">
          The CLI is the product. The apps are surfaces over it.
        </p>
      </div>
    </RuledSection>
  );
}

/* ── S4: Surfaces ───────────────────────────────────────────────── */
function Surfaces() {
  return (
    <RuledSection tier="graphite" slug={<Slug index="03" kicker="SURFACES" />}>
      <div className="px-0">
        <SurfaceIndex />
      </div>
    </RuledSection>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <EditorialPage tier="mixed">
        <AboutHero />
        <Mission />
        <OperatorsColophon />
        <Surfaces />
        <DispatchSection slugIndex="04" slugKicker="DISPATCH" />
      </EditorialPage>
    </>
  );
}
