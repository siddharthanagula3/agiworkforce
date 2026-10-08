import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  PUBLIC_WEB_LAUNCH_DATE,
  contactMailto,
} from '@/lib/legal-constants';
import { PolicyVersionsLink } from '@shared/components/legal/PolicyVersionsLink';

const PUBLIC_WEB_LAUNCH = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${PUBLIC_WEB_LAUNCH_DATE}T00:00:00Z`));

export const metadata = buildMetadata({
  title: 'Government and law-enforcement requests',
  description:
    'What legal process AGI Automation LLC requires before it discloses account data to a government, how it narrows a request, when it tells the account holder, how emergencies are handled, and where to send process.',
  path: CANONICAL_POLICY_ROUTES.governmentRequests,
});

const REQUEST_CONTENTS: readonly LedgerRow[] = [
  {
    label: 'Who is asking',
    value:
      'The agency, and the name, title, and official email address of the officer who is authorised to make the request.',
  },
  {
    label: 'Which account',
    value:
      'The email address on the account, or its User ID. A display name or a description of a person is not enough for us to find one account and no other.',
  },
  {
    label: 'Which records',
    value: 'The categories of records sought, stated specifically.',
  },
  {
    label: 'Which period',
    value: 'The dates the request covers.',
  },
  {
    label: 'By when',
    value: 'The date a response is due, if the document does not already say.',
  },
];

const EMERGENCY_CONTENTS: readonly LedgerRow[] = [
  {
    label: 'The emergency',
    value: 'What is happening, and who is at risk of death or serious physical injury.',
  },
  {
    label: 'Why now',
    value: 'Why there is no time to obtain and serve legal process.',
  },
  {
    label: 'What is needed',
    value:
      'The account, the records, and the period, and how those records would help prevent the harm.',
  },
  {
    label: 'Who is asking',
    value: 'Your name, title, agency, and a telephone number, sent from an official address.',
  },
];

export default function GovernmentRequestsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-government-requests-title"
          eyebrow="Legal"
          title="Government and law-enforcement requests."
          lede={
            <>
              {LEGAL_ENTITY} gives account data to a government only when valid legal process
              compels it, or in a real emergency.{' '}
              <strong>
                We give the least the process requires, and we have not published a transparency
                report yet.
              </strong>{' '}
              This page is for law enforcement and other government agencies. Last updated:{' '}
              {POLICY_LAST_UPDATED.governmentRequests}.{' '}
              <PolicyVersionsLink policy="governmentRequests" />
            </>
          }
          ctas={[]}
        />

        <Section id="scope" labelledBy="agi-government-requests-scope-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-government-requests-scope-title">
              Who this page is for.
            </h2>
            <Prose>
              This page covers requests from law enforcement and government agencies for data about
              people who use AGI. If you want a copy of your own data, you do not need legal
              process: use the export in Settings, or the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.dataRights} className="agi-ds-link">
                data rights page
              </Link>
              .
            </Prose>
            <Prose>
              {LEGAL_ENTITY} is {LEGAL_ENTITY_DESCRIPTOR}. Our hosting is in the United States, and
              United States law governs what we may disclose and when.
            </Prose>
          </Stack>
        </Section>

        <Section id="process" labelledBy="agi-government-requests-process-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-government-requests-process-title">
              What we require.
            </h2>
            <Prose>
              We require a subpoena, a court order, or a search warrant, issued under United States
              federal or state law, that compels {LEGAL_ENTITY} to produce the records. An informal
              request, a letter, or a request to a support channel is not legal process, and we do
              not disclose account data in answer to one.
            </Prose>
            <Prose>
              <strong>Content needs a warrant.</strong> For the content of conversations, files, and
              anything else a person wrote, uploaded, or generated, we require a search warrant or
              its equivalent. A subpoena on its own is not enough for content.
            </Prose>
            <Ledger caption="What a request must contain" rows={REQUEST_CONTENTS} />
            <Prose>
              <strong>We read every request before we answer it.</strong> We check that it is valid
              and that it reaches us lawfully. Where a request is vague, or asks for more than the
              matter needs, we ask for it to be narrowed or we object. We produce only the records
              the process names. This is the same commitment as section 04 of the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
                privacy policy
              </Link>
              : a disclosure compelled by valid legal process is narrowed to the minimum required.
            </Prose>
          </Stack>
        </Section>

        <Section id="outside-us" labelledBy="agi-government-requests-outside-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-government-requests-outside-title">
              Requests from outside the United States.
            </h2>
            <Prose>
              A government outside the United States should use a mutual legal assistance treaty, an
              agreement made under the United States CLOUD Act, or letters rogatory, so that the
              request reaches us as United States legal process. We answer a request made to us
              directly by a government outside the United States only where a law that binds us
              requires it.
            </Prose>
          </Stack>
        </Section>

        <Section
          id="emergency"
          labelledBy="agi-government-requests-emergency-title"
          rule
          ground="2"
        >
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-government-requests-emergency-title">
              Emergencies.
            </h2>
            <Prose>
              We may disclose data without legal process when we believe in good faith that there is
              an emergency involving danger of death or serious physical injury to a person, and
              that the data is needed to prevent it. We decide each request on its own facts, and we
              may ask for legal process afterwards.
            </Prose>
            <Ledger caption="What an emergency request must contain" rows={EMERGENCY_CONTENTS} />
            <Prose>
              Send it to{' '}
              <a href={contactMailto(CONTACT_SUBJECTS.emergencyDisclosure)} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>{' '}
              with the subject &ldquo;{CONTACT_SUBJECTS.emergencyDisclosure}&rdquo;.{' '}
              <strong>This mailbox is not covered around the clock.</strong> We do not claim 24/7
              coverage anywhere on this site, and an emergency request is read when a person next
              reads the mailbox. If someone is in immediate danger, do not wait for us.
            </Prose>
          </Stack>
        </Section>

        <Section id="preservation" labelledBy="agi-government-requests-preservation-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-government-requests-preservation-title">
              Preservation requests.
            </h2>
            <Prose>
              We act on a valid request to preserve an account&rsquo;s records while legal process
              is obtained. Send it the same way as legal process, with the same account details.
            </Prose>
            <Prose>
              <strong>What we can and cannot hold.</strong> Data that belongs to a workspace can be
              placed under a legal hold. A hold stops scheduled deletion and stops account erasure
              for the people it covers. We have not built a tool that places a hold on a personal
              account outside a workspace, so preserving one is a manual step. Data that a person
              has deleted and that our deletion job has already removed cannot be brought back. The
              retention periods are in section 05 of the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
                privacy policy
              </Link>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="notice" labelledBy="agi-government-requests-notice-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-government-requests-notice-title">
              Telling the account holder.
            </h2>
            <Prose>
              We tell the account holder before we disclose their data, by email to the address on
              the account, unless a law or a court order forbids it. We may also hold notice back in
              an emergency, where notice could put a person in danger, where a child is at risk, or
              where the account appears to have been taken over by someone else. Where notice was
              forbidden, we give it once the restriction ends.
            </Prose>
            <Prose>
              <strong>Workspace data.</strong> Where the records belong to a workspace, we ask the
              agency to go to the organisation that runs the workspace first, unless the law or the
              circumstances rule that out.
            </Prose>
          </Stack>
        </Section>

        <Section id="what-we-hold" labelledBy="agi-government-requests-hold-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-government-requests-hold-title">
              What we hold.
            </h2>
            <Prose>
              We can only produce what we hold. The{' '}
              <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
                privacy policy
              </Link>{' '}
              lists what is collected in each mode and how long each kind of record is kept. The web
              app runs on Managed Cloud, which is the mode where we hold conversations, files, and
              settings. Work done in Local mode goes to a model on the person&rsquo;s own device,
              and nothing about that request reaches us. A request made with the person&rsquo;s own
              provider key goes from their client to that provider, and we are not in that request
              path. We hold neither.
            </Prose>
          </Stack>
        </Section>

        <Section id="where" labelledBy="agi-government-requests-where-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-government-requests-where-title">
              Where to send legal process.
            </h2>
            <Prose>
              Serve legal process on our registered agent: {LEGAL_ENTITY}, {NOTICE_ADDRESS}. That is
              the registered agent&rsquo;s address, not an office of ours. Civil legal process goes
              to the same address.
            </Prose>
            <Prose>
              You may also email a copy to{' '}
              <a href={contactMailto(CONTACT_SUBJECTS.legalProcess)} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>{' '}
              with the subject &ldquo;{CONTACT_SUBJECTS.legalProcess}&rdquo;, from an official
              government address. An emailed copy lets us start work sooner. Receiving a copy by
              email does not waive any objection we may have, including to service or to
              jurisdiction.
            </Prose>
          </Stack>
        </Section>

        <Section id="transparency" labelledBy="agi-government-requests-transparency-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-government-requests-transparency-title">
              Transparency report.
            </h2>
            <Prose>
              <strong>No transparency report has been published yet.</strong> The first will cover
              the period from {PUBLIC_WEB_LAUNCH}, the public launch date, and will also count any
              request received before that date. It will count the requests we received and how many
              led to a disclosure. We are not attaching a publication date, because a date we cannot
              keep would be worse than saying so.
            </Prose>
            <Prose>
              Some United States national security requests come with a legal bar on saying they
              exist. The report will say as much about those as the law allows.
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
