import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { CATALOG_AS_OF, MARKETING, SURFACE_STATUS } from '../../lib/marketing-constants';
import {
  CONTACT_EMAIL,
  GOVERNING_LAW,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  NOTICE_ADDRESS,
  contactMailto,
} from '../../lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Press',
  description: `Press fact sheet for AGI: what it is, who builds it, which surfaces have shipped, and what we do not claim. Product facts as of ${CATALOG_AS_OF}.`,
  path: '/press',
});

/**
 * PRESS FACT SHEET — every row must be literally true and checkable.
 *
 * This page exists to be quoted verbatim, so it is held to a stricter standard
 * than the rest of the marketing site. Two structural rules:
 *
 * 1. NO UNDATED MUTABLE FACTS. The previous version asserted launch status,
 *    surface list and pricing posture with no "as of" date. That is the exact
 *    failure that produced a hardcoded launch date going stale across ~25 pages
 *    (see the incident recorded in `marketing-constants.ts`). Anything that can
 *    change carries `CATALOG_AS_OF` or a version.
 *
 * 2. BUILT ≠ RELEASED. The previous row read "Product surfaces: Desktop · Web ·
 *    Mobile · CLI · Chrome ext · VS Code ext", which a journalist would fairly
 *    read as six shipping products. Three of them have no published release at
 *    all. Availability is therefore split into two rows that cannot be conflated.
 */
const PRODUCT_FACTS: { k: string; v: string }[] = [
  {
    k: 'What it is',
    v: 'An AI assistant and agent platform: chat, code, research, files, projects, artifacts, tools and connectors, memory, and scheduled work.',
  },
  {
    k: 'Available now',
    // Versions come from SURFACE_STATUS, which is sourced
    // from the release tags themselves, so this row cannot drift from them.
    v: `AGI Web, in any browser · AGI Desktop, ${SURFACE_STATUS.desktop.toLowerCase()}, with installability verified per platform · AGI CLI, ${SURFACE_STATUS.cli.toLowerCase()}, macOS, Linux and Windows`,
  },
  {
    k: 'Built, not yet released',
    v: 'AGI Mobile (iOS, Android) · AGI for VS Code · AGI for Chrome. All three exist in the repository with release workflows, and none has a published release. They are not installable from any store today.',
  },
  {
    k: 'Where inference runs',
    v: 'Three separate routes the user picks between: Local (models on the user’s own hardware, works offline), BYOK (the user’s own provider key, traffic goes directly to that provider), and AGI managed cloud (hosted and metered by AGI). Work does not move between routes without an explicit, labeled action.',
  },
  {
    k: 'Managed cloud status',
    v: 'Public alpha, open by default since 2026-06-27. No waitlist and no invite. It is not generally available.',
  },
  {
    k: 'Model catalog',
    v: `${MARKETING.models.count} models across ${MARKETING.providers.count} provider integrations, as of ${CATALOG_AS_OF}. The catalog is a versioned, dated file in the repository rather than a marketing figure.`,
  },
  {
    k: 'Model access by plan',
    v: 'Tiered and enforced in shared code, not uniform: an economy roster, further models added on Pro, and frontier models on Max. A plan cannot reach a model above its tier, so lower plans do not get frontier access.',
  },
  {
    k: 'Pricing posture',
    v: 'Local and BYOK cost nothing to AGI — users pay their provider directly, or nothing at all when running locally. Managed cloud is metered. Team is priced per seat, with current checkout availability shown on Pricing; Enterprise is sales-assisted.',
  },
];

const COMPANY_FACTS: { k: string; v: string }[] = [
  { k: 'Legal entity', v: `${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}` },
  { k: 'Notice address', v: NOTICE_ADDRESS },
  // Derived, not retyped: the notice address and governing law are the two
  // facts a journalist is most likely to get wrong, and both already have a
  // single source in `legal-constants.ts` after /terms, /privacy and
  // /mobile/legal were found publishing two different addresses.
  { k: 'Governing law', v: GOVERNING_LAW.replace(/^the /, '') },
  { k: 'Founder', v: 'Siddhartha Nagula' },
  { k: 'Ownership', v: 'Independent and privately held. No outside funding is announced.' },
  { k: 'Press contact', v: CONTACT_EMAIL },
];

/**
 * Stating the absence is stronger than leaving a silence a reporter fills with
 * a question — and it is the only honest answer while these things are true.
 */
const NOT_CLAIMED: string[] = [
  'No security certifications. SOC 2 and ISO 27001 are planned with no audit report and no date; HIPAA workflows are not offered. The trust page carries the qualified status.',
  'No named customers, logos, or testimonials, and no case studies. We publish those only with written permission, and we have none cleared to publish.',
  'No usage, revenue, headcount, or funding figures.',
  'No uptime or availability record. The SLA page states planned targets, not measured history.',
  'No general availability claim for managed cloud. It is a public alpha.',
];

export default function PressPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-press-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Press</p>
          <h1 id="agi-press-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Facts you can</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">publish without checking.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Everything on this page is verified against the product source, and anything that can
            change is dated. Where we have nothing to show — customers, certifications, usage
            numbers — this page says so plainly instead of leaving a gap.
          </p>
          <p className="agi-fl-stamp-line">Product facts as of {CATALOG_AS_OF}.</p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <div className="agi-fl-cta-row">
              <a href={contactMailto('Press enquiry')} className="agi-fl-cta agi-fl-cta--primary">
                Email the Press Contact
              </a>
              <Link href="/trust" className="agi-fl-cta agi-fl-cta--secondary">
                See the Trust Posture
              </Link>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-press-boiler-title">
          <p className="agi-fl-eyebrow">Boilerplate</p>
          <h2 id="agi-press-boiler-title" className="agi-fl-h2">
            Two lengths, ready to paste.
          </h2>
          <p className="agi-fl-section-lede">
            Both are written to be accurate on their own, out of context. Please use them as-is
            rather than paraphrasing the status of a surface.
          </p>

          <div className="agi-press-boiler">
            <p className="agi-press-boiler-tag">Short</p>
            <blockquote className="agi-press-boiler-text">
              AGI is an AI assistant that works across the web, desktop, and terminal, and lets you
              choose whether each request runs on your own hardware, on your own provider key, or on
              AGI&rsquo;s hosted service.
            </blockquote>
          </div>

          <div className="agi-press-boiler">
            <p className="agi-press-boiler-tag">Long</p>
            <blockquote className="agi-press-boiler-text">
              AGI is an AI assistant and agent platform built by {LEGAL_ENTITY},{' '}
              {LEGAL_ENTITY_DESCRIPTOR}. It spans six surfaces — web, desktop, mobile, command line,
              VS Code, and Chrome — of which the web app, desktop app, and CLI have shipped. Its
              distinguishing design choice is that the user selects where inference happens: locally
              on their own hardware, through their own provider API key, or on AGI&rsquo;s managed
              cloud, which is in public alpha. Those three routes are separate trust boundaries, and
              work does not move between them without an explicit, labeled action.
            </blockquote>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-press-product-title">
          <p className="agi-fl-eyebrow">Product</p>
          <h2 id="agi-press-product-title" className="agi-fl-h2">
            The product, stated precisely.
          </h2>
          <p className="agi-fl-section-lede">
            &ldquo;Available now&rdquo; means there is a published release. &ldquo;Built, not yet
            released&rdquo; means the code exists and nothing has shipped — please do not describe
            those three as products readers can get.
          </p>
          <table className="agi-ledger">
            <tbody>
              {PRODUCT_FACTS.map((row) => (
                <tr key={row.k}>
                  <td>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-fl-avail-note">
            Pricing figures change and are deliberately not restated here — see{' '}
            <Link href="/pricing">the pricing page</Link> for current numbers.
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-press-company-title">
          <p className="agi-fl-eyebrow">Company</p>
          <h2 id="agi-press-company-title" className="agi-fl-h2">
            Who builds it.
          </h2>
          <table className="agi-ledger">
            <tbody>
              {COMPANY_FACTS.map((row) => (
                <tr key={row.k}>
                  <td>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-press-notclaimed-title">
          <p className="agi-fl-eyebrow">What we do not claim</p>
          <h2 id="agi-press-notclaimed-title" className="agi-fl-h2">
            The things we cannot back up.
          </h2>
          <p className="agi-fl-section-lede">
            If you are checking a claim made about AGI somewhere else, and it appears on this list,
            it did not come from us.
          </p>
          <ul className="agi-press-notclaimed">
            {NOT_CLAIMED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-press-assets-title">
          <p className="agi-fl-eyebrow">Brand assets</p>
          <h2 id="agi-press-assets-title" className="agi-fl-h2">
            Logo files.
          </h2>
          <p className="agi-fl-section-lede">
            The AGI mark, served directly from this site. Please use it unmodified — do not recolor,
            rotate, add effects, or place it on a busy background. The name is written
            &ldquo;AGI&rdquo;, and the company is {LEGAL_ENTITY}.
          </p>
          <ul className="agi-press-assets">
            <li>
              <a href="/logo-512.png" download>
                AGI mark — PNG, 512&times;512
              </a>
            </li>
            <li>
              <a href="/logo-192.png" download>
                AGI mark — PNG, 192&times;192
              </a>
            </li>
            <li>
              <a href="/og-image.svg" download>
                Social card — SVG
              </a>
            </li>
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-press-contact-title">
          <p className="agi-fl-eyebrow">Contact</p>
          <h2 id="agi-press-contact-title" className="agi-fl-h2">
            Interviews, demos, and fact-checks.
          </h2>
          <p className="agi-fl-section-lede">
            Email {CONTACT_EMAIL} with your outlet, deadline, and angle. If you are checking a
            specific number before you publish, say so in the subject line and we will confirm or
            correct it.
          </p>
          <div className="agi-fl-cta-row">
            <a href={contactMailto('Press enquiry')} className="agi-fl-cta agi-fl-cta--primary">
              Email the Press Contact
            </a>
            <Link href="/about" className="agi-fl-cta agi-fl-cta--ghost">
              Read About AGI
            </Link>
            <Link href="/trust" className="agi-fl-cta agi-fl-cta--ghost">
              See the Trust Posture
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
