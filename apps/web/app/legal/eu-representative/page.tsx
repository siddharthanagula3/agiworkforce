import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'EU Representative',
  description:
    'AGI has not designated a representative in the European Union under GDPR Art. 27. This page states the current position and where to send privacy requests in the meantime.',
  path: '/legal/eu-representative',
});

/*
 * GDPR ART. 27 — CURRENT POSITION
 *
 * This page previously said the representative would be published "before the
 * public launch". That condition has already occurred: Managed Cloud has been
 * open to the public by default since 2026-06-27 (lib/managed-compute-gate.ts).
 * A page that defers an obligation to an event that has passed reads worse than
 * an admission, and /mobile/legal already stated the accurate position — that no
 * representative has been designated. Both now say the same thing.
 *
 * When a representative IS appointed, replace the callout with the name, address
 * and contact instructions, and update /mobile/legal and /privacy section 07 in
 * the same change.
 */

export default function EuRepresentativePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Legal</p>
          <h1 className="agi-page-h1">EU Representative.</h1>
          <p className="agi-page-lede">
            <strong>
              {LEGAL_ENTITY} has not designated a representative in the European Union under Article
              27 GDPR.
            </strong>{' '}
            We would rather state that than defer it. Last updated:{' '}
            {POLICY_LAST_UPDATED.euRepresentative}.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Where this stands</p>
          <div className="agi-callout">
            <h2 className="agi-callout-h">No representative is currently appointed.</h2>
            <p className="agi-callout-p">
              Article 27 requires a controller or processor outside the Union that offers goods or
              services to people in the Union, or monitors their behaviour, to designate a
              representative established in a member state. AGI Managed Cloud has been open to the
              public since 27 June 2026, so this obligation is live and unmet. It is recorded here
              rather than glossed over, and appointing a representative is being progressed. We are
              not attaching a date, because a date we cannot keep would be worse than the admission.
            </p>
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">What to do in the meantime</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            The absence of a representative does not reduce your rights or our obligations. Send
            privacy requests &mdash; access, correction, deletion, portability, objection &mdash;
            directly to {LEGAL_ENTITY} at{' '}
            <a href={contactMailto(CONTACT_SUBJECTS.privacy)} style={{ color: 'var(--agi-ink)' }}>
              {CONTACT_EMAIL}
            </a>{' '}
            with the subject line &ldquo;{CONTACT_SUBJECTS.privacy}&rdquo;, or by post to{' '}
            {LEGAL_ENTITY}, {NOTICE_ADDRESS}. We respond within 30 days. Export and account deletion
            are also self-serve in the product &mdash; see section 06 of the{' '}
            <Link href="/privacy" style={{ color: 'var(--agi-ink)' }}>
              privacy policy
            </Link>
            .
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            You retain the right to lodge a complaint with your national supervisory authority, and
            you may bring a claim against us directly. The transfer mechanism for EU personal data
            is set out in section 06 of the{' '}
            <Link href="/dpa" style={{ color: 'var(--agi-ink)' }}>
              data processing addendum
            </Link>
            .
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <a href={contactMailto(CONTACT_SUBJECTS.privacy)} className="agi-cta-primary">
              Send a privacy request
            </a>
            <Link href="/privacy" className="agi-cta-ghost">
              Privacy policy &rarr;
            </Link>
            <Link href="/dpa" className="agi-cta-ghost">
              DPA &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
