import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { NoteList } from '@/features/marketing/components/pages/company/shared';
import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'How we use your data',
  description:
    'Plain-English answers to what actually happens to your conversations, files and account data — who can see them, whether they train anything, how long they are kept, and how to get them back or delete them.',
  path: '/data-use',
});

const QUESTIONS = [
  {
    title: 'Do you train AI models on my conversations?',
    body: (
      <>
        <strong>No.</strong> AGI does not train AGI-owned models on your prompts, responses or
        files. That is a flat answer with one thing worth understanding behind it: in Managed Cloud
        we send your prompt to the model provider serving the model you picked, and what{' '}
        <em>they</em> do with it is governed by their terms, not ours. We are not making a promise
        on their behalf, and section 02 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
          privacy policy
        </Link>{' '}
        says so in those words.
      </>
    ),
  },
  {
    title: 'Who at AGI can read my chats?',
    body: (
      <>
        In Managed Cloud your conversations are stored by us, so the honest answer is not
        &ldquo;nobody&rdquo;: it is that access is limited to people who need it to operate or
        support the service, and that two layers of access control scope every request to the
        account that owns it. What those layers are, and where they stop, is section 01 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
          privacy policy
        </Link>{' '}
        and the measures table in the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.dpa} className="agi-ds-link">
          DPA
        </Link>
        , which states the limit of each control next to the control.
      </>
    ),
  },
  {
    title: 'Does it depend on how I run it?',
    body: (
      <>
        <strong>More than anything else on this page.</strong> There are three modes and they give
        genuinely different answers. In <strong>Local</strong>, the conversation runs on your
        machine and we receive nothing. In <strong>BYOK</strong>, the request goes from your client
        straight to the provider on your own key and we are not in the path. In{' '}
        <strong>Managed Cloud</strong>, it goes through us and we store it. One caveat people get
        wrong: Local and BYOK are desktop, CLI and VS Code capabilities:{' '}
        <strong>the web app is cloud-only</strong>, so anything you do in a browser is Managed
        Cloud. The full comparison is section 00 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
          privacy policy
        </Link>
        .
      </>
    ),
  },
  {
    title: 'Do you sell my data?',
    body: (
      <>
        <strong>No.</strong> We do not sell personal data and we do not share it for cross-context
        behavioural advertising. We run no advertising and set no advertising cookies. The list of
        third parties that do receive data, and exactly what each one gets, is at{' '}
        <Link href={CANONICAL_POLICY_ROUTES.subprocessors} className="agi-ds-link">
          /subprocessors
        </Link>
        . That page names its own past mistakes at the bottom, which is the fastest way to judge
        whether to believe it.
      </>
    ),
  },
  {
    title: 'How long do you keep things?',
    body: (
      <>
        It differs by the kind of data, and rather than round it off here, section 05 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
          privacy policy
        </Link>{' '}
        gives a row per category with the job that enforces it. Two things worth knowing before you
        read it: where no automatic expiry exists, it says so instead of quoting a number, and it
        has a table of what deliberately survives deleting your account.
      </>
    ),
  },
  {
    title: 'How do I get my data out, or delete all of it?',
    body: (
      <>
        Both are self-serve in account settings: export returns your data as a download, and
        deletion is scheduled 24 hours out and then performed. You get no confirmation email, but
        cancellation is self-serve too: sign back in and cancel from Settings &gt; Account any time
        before the 24 hours are up. Everything else (access, correction, deleting an address we hold
        without an account) goes through{' '}
        <Link href={CANONICAL_POLICY_ROUTES.dataRights} className="agi-ds-link">
          /privacy/requests
        </Link>
        , which works whether or not you have an account.
      </>
    ),
  },
  {
    title: 'What do I have to consent to, and can I take it back?',
    body: (
      <>
        Almost nothing. Running your account and the assistant does not run on consent: it runs on
        the agreement you made when you signed up, which is why there is no cookie wall here.
        Consent is asked for exactly three things: crash reporting, analytics, and email you asked
        us to send. All three are off until you turn them on, each is asked separately, and each can
        be withdrawn on its own at{' '}
        <Link href={CANONICAL_POLICY_ROUTES.dataRights} className="agi-ds-link">
          /privacy/requests
        </Link>{' '}
        without affecting the others or your access to anything.
      </>
    ),
  },
  {
    title: 'Where is my data physically?',
    body: (
      <>
        <strong>The United States.</strong> We do not offer data residency in the EU, the UK or
        India, so using Managed Cloud means your data is transferred there. If residency is a
        requirement for you, we do not currently meet it, and you should know that before you sign
        up rather than during procurement. The transfer mechanisms are section 08 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
          privacy policy
        </Link>{' '}
        and section 06 of the{' '}
        <Link href={CANONICAL_POLICY_ROUTES.dpa} className="agi-ds-link">
          DPA
        </Link>
        .
      </>
    ),
  },
  {
    title: 'What happens to my data if I stop paying, or you shut down?',
    body: (
      <>
        Cancelling a subscription does not delete your account or your content. The account
        continues on the free tier and your data stays until you delete it. What we cannot promise
        is a shutdown commitment, because no code enforces one; the honest position is that export
        works today and you should use it if that risk matters to you. The billing mechanics
        themselves are on{' '}
        <Link href={CANONICAL_POLICY_ROUTES.refunds} className="agi-ds-link">
          the refund policy
        </Link>
        .
      </>
    ),
  },
  {
    title: 'Are you GDPR or DPDP compliant?',
    body: (
      <>
        Those are not badges anyone issues, so a yes would be worth nothing. What we can give you is
        the working: a per-regime status ledger with dates and what would prove each line at{' '}
        <Link href={CANONICAL_POLICY_ROUTES.trust} className="agi-ds-link">
          /trust
        </Link>
        , the India-specific notice at{' '}
        <Link href={CANONICAL_POLICY_ROUTES.indiaPrivacy} className="agi-ds-link">
          /privacy/india
        </Link>
        , and a security page that lists what we have <em>not</em> done at{' '}
        <Link href={CANONICAL_POLICY_ROUTES.security} className="agi-ds-link">
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
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-data-use-title"
          eyebrow="Legal"
          title="How we use your data."
          lede={
            <>
              The privacy policy is the document that governs. It is also long, because it has to be
              complete.{' '}
              <strong>
                This page answers the questions people actually arrive with, and links to the part
                of the policy that governs each answer.
              </strong>{' '}
              Where the two ever disagree, the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
                privacy policy
              </Link>{' '}
              wins: this page is a guide to it, not a replacement for it. Last updated:{' '}
              {POLICY_LAST_UPDATED.dataUse}.
            </>
          }
          ctas={[]}
        />

        <Section id="questions" labelledBy="agi-data-use-questions-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-data-use-questions-title">
              The questions, in the order people ask them.
            </h2>
            <NoteList items={QUESTIONS} />
          </Stack>
        </Section>

        <Section id="why" labelledBy="agi-data-use-why-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-data-use-why-title">
              Why this page cannot drift.
            </h2>
            <Prose>
              A friendly summary of a legal document is a liability the moment the document changes
              and the summary does not: you end up with two published answers and no way to tell
              which is current. So this page deliberately states no retention window, no recipient
              name and no commitment of its own. Every concrete fact above is a link into the policy
              that owns it. If you are editing this page and find yourself typing a number, link to
              the section instead.
            </Prose>
            <ButtonRow>
              <Button href={CANONICAL_POLICY_ROUTES.privacy} variant="secondary">
                Privacy policy
              </Button>
              <Button href={CANONICAL_POLICY_ROUTES.dataRights} variant="secondary">
                Exercise your rights
              </Button>
              <Button href={CANONICAL_POLICY_ROUTES.subprocessors} variant="secondary">
                Who receives data
              </Button>
              <Button href={CANONICAL_POLICY_ROUTES.trust} variant="secondary">
                Compliance status
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
