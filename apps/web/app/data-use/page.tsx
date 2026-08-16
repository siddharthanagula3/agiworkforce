import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'How we use your data',
  description:
    'Plain-English answers to what actually happens to your conversations, files and account data — who can see them, whether they train anything, how long they are kept, and how to get them back or delete them.',
  path: '/data-use',
});

interface Question {
  q: string;
  a: React.ReactNode;
}

const QUESTIONS: Question[] = [
  {
    q: 'Do you train AI models on my conversations?',
    a: (
      <>
        <strong>No.</strong> AGI does not train AGI-owned models on your prompts, responses or
        files. That is a flat answer with one thing worth understanding behind it: in Managed Cloud
        we send your prompt to the model provider serving the model you picked, and what{' '}
        <em>they</em> do with it is governed by their terms, not ours. We are not making a promise
        on their behalf, and section 02 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} style={{ color: 'var(--agi-ink)' }}>
          privacy policy
        </Link>{' '}
        says so in those words.
      </>
    ),
  },
  {
    q: 'Who at AGI can read my chats?',
    a: (
      <>
        In Managed Cloud your conversations are stored by us, so the honest answer is not
        &ldquo;nobody&rdquo; &mdash; it is that access is limited to people who need it to operate
        or support the service, and that two layers of access control scope every request to the
        account that owns it. What those layers are, and where they stop, is section 01 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} style={{ color: 'var(--agi-ink)' }}>
          privacy policy
        </Link>{' '}
        and the measures table in the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.dpa} style={{ color: 'var(--agi-ink)' }}>
          DPA
        </Link>
        , which states the limit of each control next to the control.
      </>
    ),
  },
  {
    q: 'Does it depend on how I run it?',
    a: (
      <>
        <strong>More than anything else on this page.</strong> There are three modes and they give
        genuinely different answers. In <strong>Local</strong>, the conversation runs on your
        machine and we receive nothing. In <strong>BYOK</strong>, the request goes from your client
        straight to the provider on your own key and we are not in the path. In{' '}
        <strong>Managed Cloud</strong>, it goes through us and we store it. One caveat people get
        wrong: Local and BYOK are desktop, CLI and VS Code capabilities &mdash;{' '}
        <strong>the web app is cloud-only</strong>, so anything you do in a browser is Managed
        Cloud. The full comparison is section 00 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} style={{ color: 'var(--agi-ink)' }}>
          privacy policy
        </Link>
        .
      </>
    ),
  },
  {
    q: 'Do you sell my data?',
    a: (
      <>
        <strong>No.</strong> We do not sell personal data and we do not share it for cross-context
        behavioural advertising. We run no advertising and set no advertising cookies. The list of
        third parties that do receive data, and exactly what each one gets, is at{' '}
        <Link href={CANONICAL_POLICY_ROUTES.subprocessors} style={{ color: 'var(--agi-ink)' }}>
          /subprocessors
        </Link>{' '}
        &mdash; that page names its own past mistakes at the bottom, which is the fastest way to
        judge whether to believe it.
      </>
    ),
  },
  {
    q: 'How long do you keep things?',
    a: (
      <>
        It differs by the kind of data, and rather than round it off here, section 05 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} style={{ color: 'var(--agi-ink)' }}>
          privacy policy
        </Link>{' '}
        gives a row per category with the job that enforces it. Two things worth knowing before you
        read it: where no automatic expiry exists, it says so instead of quoting a number, and it
        has a table of what deliberately survives deleting your account.
      </>
    ),
  },
  {
    q: 'How do I get my data out, or delete all of it?',
    a: (
      <>
        Both are self-serve in account settings: export returns your data as a download, and
        deletion is scheduled 24 hours out and then performed. Two limits stated up front rather
        than discovered: you get no confirmation email, and there is no self-serve way to cancel
        inside that window. Everything else &mdash; access, correction, deleting an address we hold
        without an account &mdash; goes through{' '}
        <Link href={CANONICAL_POLICY_ROUTES.dataRights} style={{ color: 'var(--agi-ink)' }}>
          /privacy/requests
        </Link>
        , which works whether or not you have an account.
      </>
    ),
  },
  {
    q: 'What do I have to consent to, and can I take it back?',
    a: (
      <>
        Almost nothing. Running your account and the assistant does not run on consent &mdash; it
        runs on the agreement you made when you signed up, which is why there is no cookie wall
        here. Consent is asked for exactly three things: crash reporting, analytics, and email you
        asked us to send. All three are off until you turn them on, each is asked separately, and
        each can be withdrawn on its own at{' '}
        <Link href={CANONICAL_POLICY_ROUTES.dataRights} style={{ color: 'var(--agi-ink)' }}>
          /privacy/requests
        </Link>{' '}
        without affecting the others or your access to anything.
      </>
    ),
  },
  {
    q: 'Where is my data physically?',
    a: (
      <>
        <strong>The United States.</strong> We do not offer data residency in the EU, the UK or
        India, so using Managed Cloud means your data is transferred there. If residency is a
        requirement for you, we do not currently meet it, and you should know that before you sign
        up rather than during procurement. The transfer mechanisms are section 08 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} style={{ color: 'var(--agi-ink)' }}>
          privacy policy
        </Link>{' '}
        and section 06 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.dpa} style={{ color: 'var(--agi-ink)' }}>
          DPA
        </Link>
        .
      </>
    ),
  },
  {
    q: 'What happens to my data if I stop paying, or you shut down?',
    a: (
      <>
        Cancelling a subscription does not delete your account or your content &mdash; the account
        continues on the free tier and your data stays until you delete it. What we cannot promise
        is a shutdown commitment, because no code enforces one; the honest position is that export
        works today and you should use it if that risk matters to you. The billing mechanics
        themselves are on{' '}
        <Link href={CANONICAL_POLICY_ROUTES.refunds} style={{ color: 'var(--agi-ink)' }}>
          the refund policy
        </Link>
        .
      </>
    ),
  },
  {
    q: 'Are you GDPR or DPDP compliant?',
    a: (
      <>
        Those are not badges anyone issues, so a yes would be worth nothing. What we can give you is
        the working: a per-regime status ledger with dates and what would prove each line at{' '}
        <Link href={CANONICAL_POLICY_ROUTES.trust} style={{ color: 'var(--agi-ink)' }}>
          /trust
        </Link>
        , the India-specific notice at{' '}
        <Link href={CANONICAL_POLICY_ROUTES.indiaPrivacy} style={{ color: 'var(--agi-ink)' }}>
          /privacy/india
        </Link>
        , and a security page that lists what we have <em>not</em> done at{' '}
        <Link href={CANONICAL_POLICY_ROUTES.security} style={{ color: 'var(--agi-ink)' }}>
          /security
        </Link>
        . We hold no SOC 2 report and no ISO 27001 certificate, and we say so in the same places we
        say what we do have.
      </>
    ),
  },
];

export default function DataUsePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Plain English</p>
          <h1 className="agi-page-h1">How we use your data.</h1>
          <p className="agi-page-lede">
            The privacy policy is the document that governs. It is also long, because it has to be
            complete.{' '}
            <strong>
              This page answers the questions people actually arrive with, and links to the part of
              the policy that governs each answer.
            </strong>{' '}
            Where the two ever disagree, the{' '}
            <Link href={CANONICAL_POLICY_ROUTES.privacy} style={{ color: 'var(--agi-ink)' }}>
              privacy policy
            </Link>{' '}
            wins &mdash; this page is a guide to it, not a replacement for it. Last updated:{' '}
            {POLICY_LAST_UPDATED.dataUse}.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">The questions, in the order people ask them</p>
          <ul className="agi-reasons">
            {QUESTIONS.map((item) => (
              <li className="agi-reason" key={item.q}>
                <h3 className="agi-reason-h">{item.q}</h3>
                <p className="agi-reason-p">{item.a}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Why this page cannot drift</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            A friendly summary of a legal document is a liability the moment the document changes
            and the summary does not &mdash; you end up with two published answers and no way to
            tell which is current. So this page deliberately states no retention window, no
            recipient name and no commitment of its own. Every concrete fact above is a link into
            the policy that owns it. If you are editing this page and find yourself typing a number,
            link to the section instead.
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-cta-ghost">
              Privacy policy &rarr;
            </Link>
            <Link href={CANONICAL_POLICY_ROUTES.dataRights} className="agi-cta-ghost">
              Exercise your rights &rarr;
            </Link>
            <Link href={CANONICAL_POLICY_ROUTES.subprocessors} className="agi-cta-ghost">
              Who receives data &rarr;
            </Link>
            <Link href={CANONICAL_POLICY_ROUTES.trust} className="agi-cta-ghost">
              Compliance status &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
