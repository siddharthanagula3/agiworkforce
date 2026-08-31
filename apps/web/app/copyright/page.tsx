import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';

/**
 * Copyright and IP complaint policy.
 *
 * The product accepts user uploads, generates media, and publishes artifacts at
 * shareable URLs, so it needs a stated notice-and-takedown route — but had no
 * `/copyright` or `/dmca` page and no footer link. `CONTACT_SUBJECTS.ipComplaint`
 * already existed as a routing subject with nothing pointing at it.
 *
 * Every claim here is checkable against the repo: the mailbox and subject
 * routing come from `lib/legal-constants.ts`, and the removal mechanics
 * describe what the share/publish routes actually do.
 */

export const metadata = buildMetadata({
  title: 'Copyright and IP complaints',
  description:
    'How to report content that infringes your copyright or trademark, what a complete notice must contain, how to counter-notify, and what happens to repeat infringers.',
  path: '/copyright',
});

const NOTICE_REQUIREMENTS: { k: string; v: string }[] = [
  {
    k: 'Identify yourself',
    v: 'Your full name, mailing address, telephone number, and email address. If you are acting for a rights holder, say who they are and what authorizes you to act.',
  },
  {
    k: 'Identify the work',
    v: 'Describe the copyrighted work or trademark you say is infringed. A registration number helps but is not required.',
  },
  {
    k: 'Identify the material',
    v: 'Give the exact URL of the shared conversation, published artifact, or file. A description alone is usually not enough to locate it — the same words appear in many conversations.',
  },
  {
    k: 'Two statements',
    v: 'State that you have a good-faith belief the use is not authorized by the rights holder, its agent, or the law; and that the information in your notice is accurate. Include a statement, under penalty of perjury, that you are authorized to act for the rights holder.',
  },
  {
    k: 'Sign it',
    v: 'A physical or electronic signature. Typing your full name at the end of the email counts.',
  },
];

const WHAT_HAPPENS: { k: string; v: string }[] = [
  {
    k: 'We disable the link',
    v: 'A shared conversation link and a published artifact are both revocable server-side. Disabling one stops it resolving for everyone immediately; it does not delete the author’s own copy of the underlying conversation.',
  },
  {
    k: 'We tell the user',
    v: 'The account that published the material is notified, with a copy of the notice, so they can counter-notify. We do not disclose your contact details beyond what the notice itself contains.',
  },
  {
    k: 'They can counter-notify',
    v: 'If the user believes the removal was a mistake or a misidentification, they may send a counter-notice with their contact details, a statement under penalty of perjury to that effect, and consent to jurisdiction. We may restore the material unless you tell us you have filed an action.',
  },
  {
    k: 'Repeat infringers lose access',
    v: 'Accounts that accumulate substantiated notices are suspended and then terminated, on the same enforcement ladder as any other acceptable-use violation.',
  },
];

export default function CopyrightPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Copyright and IP complaints.</h1>
          <p className="agi-page-lede">
            You can publish a conversation or an artifact at a shareable URL, and you can upload
            files for the agent to read.{' '}
            <strong>
              That means this product can host material someone else owns, so it needs a real
              notice-and-takedown route.
            </strong>{' '}
            This page is that route. It sits alongside the{' '}
            <Link href="/terms" style={{ color: 'var(--agi-ink)' }}>
              Terms of Service
            </Link>{' '}
            and the{' '}
            <Link href="/acceptable-use" style={{ color: 'var(--agi-ink)' }}>
              Acceptable use policy
            </Link>
            . Last updated: {POLICY_LAST_UPDATED.copyright}.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">How to send a notice</p>
          <p className="agi-page-lede">
            Use the{' '}
            <Link href="/copyright/report" style={{ color: 'var(--agi-ink)' }}>
              notice form
            </Link>
            . It checks that the URL you report still resolves to something published here, gives
            you a reference, and puts the notice in front of the person who can disable the link.
            Every public share and published artifact page links straight to it.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            If you would rather email, write to{' '}
            <a
              href={contactMailto(CONTACT_SUBJECTS.ipComplaint)}
              style={{ color: 'var(--agi-ink)' }}
            >
              our contact mailbox
            </a>{' '}
            with the subject line &ldquo;{CONTACT_SUBJECTS.ipComplaint}&rdquo;. Subject-line routing
            is how every policy mailbox on this site works; a notice sent without it still arrives,
            but is slower to reach the right person.
          </p>
          <table className="agi-ledger">
            <tbody>
              {NOTICE_REQUIREMENTS.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '30%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            An incomplete notice is not ignored, but it may be slower to action: without a URL we
            often cannot identify the material at all.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">What happens next</p>
          <table className="agi-ledger">
            <tbody>
              {WHAT_HAPPENS.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '30%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Model output</p>
          <p className="agi-page-lede">
            Generated text, images, and audio can resemble existing work. If you believe a
            generation reproduces something you own, send a notice the same way and include the
            prompt or the shared link: we need to be able to reproduce what you saw. Where the
            output came from a third-party model provider, their terms also apply; those providers
            are listed on{' '}
            <Link href="/subprocessors" style={{ color: 'var(--agi-ink)' }}>
              /subprocessors
            </Link>
            , and the licence terms attached to each model are on{' '}
            <Link href="/model-licenses" style={{ color: 'var(--agi-ink)' }}>
              /model-licenses
            </Link>
            .
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Misuse of this process</p>
          <p className="agi-page-lede">
            Knowingly filing a false notice, or a false counter-notice, carries liability for
            damages and costs. We keep a record of notices and counter-notices.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            {LEGAL_ENTITY}, {NOTICE_ADDRESS}. Material changes to this policy are recorded on{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>
            .
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/terms" className="agi-cta-ghost">
              Terms &rarr;
            </Link>
            <Link href="/acceptable-use" className="agi-cta-ghost">
              Acceptable use &rarr;
            </Link>
            <Link href="/model-licenses" className="agi-cta-ghost">
              Model licences &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
