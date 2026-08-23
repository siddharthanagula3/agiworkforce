import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { AgiMark } from '@shared/components/agi/AgiMark';
import {
  CONTACT_EMAIL,
  FOUNDER_NAME,
  FOUNDER_ROLE,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  PRODUCT_NAME,
  contactMailto,
} from '../../lib/legal-constants';

export const metadata = buildMetadata({
  title: `${FOUNDER_NAME} — ${FOUNDER_ROLE}`,
  description: `${FOUNDER_NAME} is ${FOUNDER_ROLE} of ${LEGAL_ENTITY}, the company behind ${PRODUCT_NAME}.`,
  path: '/founder',
});

// Only what can be checked. No headcount, funding, or advisory-board theatre —
// the press page already refuses to claim those, and this page would be the
// obvious place for them to creep back in.
const FACTS: { k: string; v: string }[] = [
  { k: 'Name', v: FOUNDER_NAME },
  { k: 'Role', v: `${FOUNDER_ROLE}, ${LEGAL_ENTITY}` },
  { k: 'Product', v: `${PRODUCT_NAME} — agiworkforce.com` },
  { k: 'Company', v: `${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}` },
  { k: 'Ownership', v: 'Independent and privately held. No outside funding announced.' },
  { k: 'Contact', v: CONTACT_EMAIL },
];

export default function FounderPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-founder-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">The founder</p>
          {/* agi-fl-h1 is set at 5.2rem with a 16ch measure, so it holds a name
              and not a sentence. The role belongs in the lede beneath it. */}
          <h1 id="agi-founder-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Siddhartha</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">Nagula.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            <strong>
              {FOUNDER_ROLE} of {LEGAL_ENTITY}
            </strong>
            , the company behind {PRODUCT_NAME}. It is built and led by one person. That is stated
            here rather than implied away with a plural &ldquo;we&rdquo;, because it is the thing
            most likely to matter to someone deciding whether to depend on this product.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <ul className="agi-fl-mode-ribbon" aria-label="At a glance">
              <li>Founder &amp; CEO</li>
              <li>{LEGAL_ENTITY}</li>
              <li>Independent · privately held</li>
            </ul>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-founder-conviction-title">
          <p className="agi-fl-eyebrow">The conviction</p>
          <div className="agi-about-founder">
            <div className="agi-about-founder-mark" aria-hidden="true">
              <AgiMark size={40} />
            </div>
            <div className="agi-about-founder-copy">
              <h2 id="agi-founder-conviction-title" className="agi-fl-h2">
                <em className="agi-fl-h1-em">&ldquo;You should own the choice of model.&rdquo;</em>
              </h2>
              <p className="agi-fl-section-lede">
                The person doing the work should decide where it runs and which model answers — not
                a vendor holding the only key. Local Mode never phones home, BYOK keeps your keys on
                your own machine, and managed cloud is a choice you make rather than the only door.
                Every design decision in {PRODUCT_NAME} follows from that.
              </p>
              <p className="agi-about-founder-name">
                <span>{FOUNDER_NAME}</span>
                <span className="agi-about-founder-role">
                  {FOUNDER_ROLE}, {LEGAL_ENTITY}
                </span>
              </p>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-founder-facts-title">
          <p className="agi-fl-eyebrow">The facts</p>
          <h2 id="agi-founder-facts-title" className="agi-fl-h2">
            Checkable, and nothing else.
          </h2>
          <dl className="agi-colophon">
            {FACTS.map((fact) => (
              <div key={fact.k} className="agi-colophon-row">
                <dt className="agi-colophon-key">{fact.k}</dt>
                <dd className="agi-colophon-val">{fact.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-founder-contact-title">
          <p className="agi-fl-eyebrow">Reaching me</p>
          <h2 id="agi-founder-contact-title" className="agi-fl-h2">
            The inbox is read by a person.
          </h2>
          <p className="agi-fl-section-lede">
            Product feedback, bugs, partnership questions and press all arrive at the same address,
            and it is me reading them. If you are already in the product, the feedback control under
            the composer is faster — it carries the context with it.
          </p>
          <p className="agi-fl-section-lede">
            <a className="agi-fl-link" href={contactMailto()}>
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="agi-fl-section-lede">
            More on the company at <Link href="/about">About</Link>, the assets and boilerplate at{' '}
            <Link href="/press">Press</Link>, and what is deliberately not claimed at{' '}
            <Link href="/trust">Trust</Link>.
          </p>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
