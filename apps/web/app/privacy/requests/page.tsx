import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GRIEVANCE_OFFICER_NAME,
  GRIEVANCE_RESPONSE_TARGET_DAYS,
  LEGAL_ENTITY,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';

import { ConsentCentre } from './ConsentCentre';
import { RightsRequestForm } from './RightsRequestForm';

export const metadata = buildMetadata({
  title: 'Data rights and consent',
  description:
    'Exercise your access, correction, erasure, withdrawal and nomination rights, see the consent recorded against your account, and reach the grievance contact.',
  path: '/privacy/requests',
});

/*
 * DATA RIGHTS AND CONSENT
 *
 * LEGAL REVIEW REQUIRED before this page is relied on — see the header of
 * /privacy/india/page.tsx and DPDP_PROGRESS.md for the itemised list.
 *
 * THE RULE THIS PAGE IS HELD TO: describe only what the code does.
 *
 *  - The consent panel is real: it reads GET /api/consent and writes
 *    POST /api/consent, which append to `consent_records` (migration 0113).
 *    Withdrawal here takes effect on the ledger immediately.
 *  - The request form is real but modest: it writes a row to
 *    `data_rights_requests` (migration 0114) and returns a reference. It does
 *    NOT notify anyone. The copy says so, in those words, in the success state.
 *    An email provider exists in the repository
 *    (lib/support/handoff/resend-client.ts, used by support escalation and
 *    scheduled-task notifications) but nothing connects it to this queue.
 *  - "Export" and "delete my account" are NOT reimplemented here. They already
 *    exist in account settings, and a second half-wired button beside a working
 *    one is how a product ends up with two answers to the same question.
 *
 * DO NOT add copy claiming a response time that no process delivers. The number
 * published here is GRIEVANCE_RESPONSE_TARGET_DAYS, described as a commitment.
 */

export default function DataRightsPage() {
  return (
    <div data-design="agi" data-legal-review="pending-counsel">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Your data &middot; rights and consent</p>
          <h1 className="agi-page-h1">Exercise your rights.</h1>
          <p className="agi-page-lede">
            Everything on this page is a control, not a description of one. What is self-serve is
            self-serve; what needs a human says so and tells you exactly what happens when you press
            the button. Last updated: {POLICY_LAST_UPDATED.dataRights}. The notice that explains
            what we collect and why is at{' '}
            <Link href={CANONICAL_POLICY_ROUTES.indiaPrivacy} style={{ color: 'var(--agi-ink)' }}>
              /privacy/india
            </Link>{' '}
            for India, and{' '}
            <Link href={CANONICAL_POLICY_ROUTES.privacy} style={{ color: 'var(--agi-ink)' }}>
              /privacy
            </Link>{' '}
            generally.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">01 &middot; Consent recorded against your account</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Withdrawing has to be as easy as giving, so it is one click here &mdash; no email, no
            ticket, no waiting on us. Each change is appended to your consent record with the
            revision of the notice that was on screen.
          </p>
          <ConsentCentre />
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">02 &middot; What is already self-serve</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td style={{ width: '24%', verticalAlign: 'top' }}>Export your data</td>
                <td>
                  Signed in, export from your account settings at any time. It is rate limited and
                  each export is recorded in the security audit log. It does not yet cover every
                  category the schema holds &mdash; that gap is tracked, and until it closes, use
                  the access request below if something is missing.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Delete your account</td>
                <td>
                  Request it from account settings. Erasure is scheduled 24 hours out and then
                  performed by a daily job, which also deletes your identity at our authentication
                  provider. You get no confirmation email and there is no self-serve cancel, so
                  inside that window you must reach us.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Turn analytics off</td>
                <td>
                  The cookie preferences dialog, reachable from{' '}
                  <Link href={CANONICAL_POLICY_ROUTES.cookies} style={{ color: 'var(--agi-ink)' }}>
                    /cookies
                  </Link>
                  . Analytics is off until you turn it on, and the gate fails closed.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">03 &middot; Everything else &mdash; make a request</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Access, correction, erasure without an account, withdrawal of consent given without an
            account, nomination, and grievances. You do not need an account to use this &mdash; your
            rights do not depend on having one.
          </p>
          <RightsRequestForm />
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">04 &middot; Grievance contact</p>
          <div className="agi-callout">
            <h3 className="agi-callout-h">{GRIEVANCE_OFFICER_NAME}</h3>
            <p className="agi-callout-p">
              Email{' '}
              <a
                href={contactMailto(CONTACT_SUBJECTS.dpdpGrievance)}
                style={{ color: 'var(--agi-ink)' }}
              >
                {CONTACT_EMAIL}
              </a>{' '}
              with the subject line &ldquo;{CONTACT_SUBJECTS.dpdpGrievance}&rdquo;, or post to{' '}
              {LEGAL_ENTITY}, {NOTICE_ADDRESS}. We aim to respond within{' '}
              {GRIEVANCE_RESPONSE_TARGET_DAYS} days &mdash; our commitment, not a statutory deadline
              we are quoting. If our response does not resolve it, data principals in India may
              complain to the Data Protection Board of India.
            </p>
          </div>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href={CANONICAL_POLICY_ROUTES.indiaPrivacy} className="agi-cta-ghost">
              India &mdash; DPDP notice &rarr;
            </Link>
            <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-cta-ghost">
              Privacy policy &rarr;
            </Link>
            <Link href={CANONICAL_POLICY_ROUTES.cookies} className="agi-cta-ghost">
              Cookies &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
