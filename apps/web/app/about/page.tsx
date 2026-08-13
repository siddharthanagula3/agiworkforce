import type { ReactNode } from 'react';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { CATALOG_AS_OF, MARKETING, POSITIONING } from '../../lib/marketing-constants';
import { LEGAL_ENTITY, LEGAL_ENTITY_DESCRIPTOR, NOTICE_ADDRESS } from '../../lib/legal-constants';

export const metadata = buildMetadata({
  title: 'About: Multi-provider by design',
  description:
    'AGI is built by AGI Automation LLC, an independent US company. Six surfaces over one contract layer, and a real choice of where inference runs: your hardware, your key, or our cloud.',
  path: '/about',
});

const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: 'The route is always visible.',
    body: 'Local, BYOK, and managed cloud are separate trust boundaries. A Local thread stays Local. Moving work anywhere else takes a label and your consent — never a silent hand-off.',
  },
  {
    title: 'Your keys, your bill, no markup.',
    body: 'Bring your own provider keys on Desktop, CLI, and VS Code. Traffic goes straight to your provider; the keys stay encrypted on your machine. We do not sit in the middle of your spend.',
  },
  {
    title: 'One workspace, six surfaces.',
    body: 'Web, Desktop, Mobile, CLI, Chrome, and VS Code. Each is native to its platform rather than a wrapped web view, and they share one contract layer: the same model catalog, the same trust-boundary rules, the same capability gates.',
  },
];

const COLOPHON: { key: string; val: ReactNode }[] = [
  { key: 'Company', val: `${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}` },
  { key: 'Notice address', val: NOTICE_ADDRESS },
  { key: 'Ownership', val: 'Independent and privately held. No outside funding announced.' },
  { key: 'License', val: 'Proprietary' },
  {
    key: 'Built with',
    val: 'Rust for the CLI and the desktop core · TypeScript and React across the app surfaces',
  },
  { key: 'Surfaces', val: 'Web · Desktop · Mobile · CLI · Chrome · VS Code' },
  {
    key: 'Model catalog',
    // Derived from models.json, dated by its own lastUpdated stamp. A dated,
    // inspectable catalog is the most credible thing to show a technical
    // reader — an undated "50+" is the least.
    val: `${MARKETING.models.count} models · ${MARKETING.providers.count} provider integrations, as of ${CATALOG_AS_OF}`,
  },
  { key: 'Trust modes', val: 'Local · BYOK · Managed cloud (public alpha)' },
  { key: 'Data policy', val: POSITIONING.trustBoundary },
  { key: 'Set in', val: 'Newsreader & Geist' },
  {
    key: 'Compliance',
    // Never state a bare "SOC 2 planned" without the qualification travelling
    // with it — an unqualified compliance line in a colophon is what ends up
    // screenshotted into a security questionnaire.
    val: (
      <>
        No certifications held. SOC 2 is planned with no audit report and no date.{' '}
        <Link href="/trust">See the full trust posture</Link>.
      </>
    ),
  },
];

export default function AboutPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-about-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">About AGI</p>
          <h1 id="agi-about-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Multi-provider,</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">by design.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            AGI is built by {LEGAL_ENTITY}, {LEGAL_ENTITY_DESCRIPTOR}. It is founder-led,
            independent, and privately held.{' '}
            <strong>
              It exists because being locked to one model lab is a bad position to be in.
            </strong>{' '}
            The bet: you, not the vendor, own the keys, the data, and the choice of model.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
              <li>Local · on-device</li>
              <li>BYOK · your keys</li>
              <li>Cloud · public alpha</li>
            </ul>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-about-mission-title">
          <p className="agi-fl-eyebrow">What we&rsquo;re building</p>
          <h2 id="agi-about-mission-title" className="agi-fl-h2">
            An AI workspace you can actually trust.
          </h2>
          <p className="agi-fl-section-lede">
            An AI application suite across six surfaces, with one difference that decides the rest:
            you choose whether a request runs on Local models, on your own provider keys, or on AGI
            managed cloud. That choice is architectural, not a setting bolted on late — these are
            the rules the product is built around.
          </p>
          <div className="agi-about-principles">
            {PRINCIPLES.map((p) => (
              <article key={p.title} className="agi-about-principle">
                <h3 className="agi-about-principle-title">{p.title}</h3>
                <p className="agi-about-principle-body">{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-about-founder-title">
          <p className="agi-fl-eyebrow">The founder</p>
          <div className="agi-about-founder">
            <div className="agi-about-founder-mark" aria-hidden="true">
              <AgiMark size={40} />
            </div>
            <div className="agi-about-founder-copy">
              <h2 id="agi-about-founder-title" className="agi-fl-h2">
                <em className="agi-fl-h1-em">&ldquo;You should own the choice of model.&rdquo;</em>
              </h2>
              <p className="agi-fl-section-lede">
                AGI is built on a single conviction: the person doing the work should decide where
                it runs and which model answers — not a vendor lock-in. Everything here follows from
                that, from Local Mode that never phones home to BYOK that keeps your keys on your
                machine.
              </p>
              <p className="agi-about-founder-name">
                <span>Siddhartha Nagula</span>
                <span className="agi-about-founder-role">Founder, AGI Automation LLC</span>
              </p>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-about-colophon-title">
          <p className="agi-fl-eyebrow">The colophon</p>
          <h2 id="agi-about-colophon-title" className="agi-fl-h2">
            The facts, plainly stated.
          </h2>
          <p className="agi-fl-section-lede">
            The entity, the licence, and how the product is put together. No founding mythology, no
            team-size or funding theatre — just what can be checked.
          </p>
          <dl className="agi-colophon">
            {COLOPHON.map((row) => (
              <div key={row.key} className="agi-colophon-row">
                <dt className="agi-colophon-key">{row.key}</dt>
                <dd className="agi-colophon-val">{row.val}</dd>
              </div>
            ))}
          </dl>
        </section>

        <FinalCta
          eyebrow="Judge it yourself"
          title="Judge the bet on its merits."
          body="Try AGI Web in the browser, or run Desktop and the CLI on your own hardware with local models and your own keys. Either way, you see where every request runs before it leaves your device."
          ctas={[
            { href: '/login?redirectTo=%2F', label: 'Try AGI Web' },
            { href: '/download', label: 'Get AGI Desktop' },
            { href: '/trust', label: 'See the Trust Posture' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
