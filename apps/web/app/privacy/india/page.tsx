import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PolicyContents } from '@shared/components/legal/PolicyContents';
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
import { CONSENT_PURPOSES } from '@/lib/consent-purposes';

export const metadata = buildMetadata({
  title: 'India: DPDP notice',
  description:
    'The notice required by the Digital Personal Data Protection Act, 2023: what personal data AGI processes, for which purposes, who it goes to, how to exercise your rights as a Data Principal, and the grievance contact.',
  path: '/privacy/india',
});

const SECTIONS = [
  '00 · Who is responsible',
  '01 · The mode decides what we hold',
  '02 · What we process, and for which purpose',
  '03 · The consent we ask for, one purpose at a time',
  '04 · Who else receives it',
  '05 · How long we keep it',
  '06 · Where it goes, and out of India',
  '07 · Your rights, and what actually happens',
  '08 · Grievance redressal',
  '09 · Children, stated honestly',
  '10 · Security and breach',
  '11 · Language, and changes',
] as const;

const MODES: readonly LedgerRow[] = [
  {
    label: 'Local',
    value: (
      <>
        Where it goes: to a model runtime on your own machine. Nothing is transmitted to us and
        nothing is silently routed to BYOK or Managed Cloud.
        <br />
        What we hold: nothing about the conversation. It lives in SQLite on your disk, where this
        notice has nothing to describe.
      </>
    ),
  },
  {
    label: 'BYOK',
    value: (
      <>
        Where it goes: from your client straight to the provider you targeted, on your own API key.
        We are not in that request path.
        <br />
        What we hold: your account and settings. Not the prompt traffic. Your key is encrypted on
        your device and the master password is not recoverable by us.
      </>
    ),
  },
  {
    label: 'Managed Cloud',
    value: (
      <>
        Where it goes: through our gateway to the provider serving the model you selected.
        <br />
        What we hold: conversations, files, projects, memories, schedules and settings, so they sync
        across your devices.
      </>
    ),
  },
];

const PROCESSING: readonly LedgerRow[] = [
  {
    label: 'Email address, account identifier, authentication metadata',
    value:
      'Purpose: creating and securing your account. Held by our identity provider; we do not store your password. Basis: your request, the account cannot exist without it.',
  },
  {
    label: 'Billing identifiers, plan, invoice metadata',
    value:
      'Purpose: taking payment and managing your subscription. Card details go to Stripe directly and never reach us. Basis: performing the paid service you signed up for.',
  },
  {
    label: 'Conversations, files, projects, memories (Managed Cloud only)',
    value:
      'Purpose: running the assistant and syncing your work across your devices. Basis: providing the Managed Cloud service you chose to use. Local and BYOK do not produce this data for us.',
  },
  {
    label: 'Error reports and performance traces (Sentry)',
    value:
      'Purpose: diagnosing crashes. Content-scrubbed, but a stable user id is retained so a crash can be tied to a session, so they are pseudonymous, not anonymous. Basis: your consent. Off until you turn it on.',
  },
  {
    label: 'Aggregated page views (Google Analytics 4)',
    value:
      'Purpose: understanding which parts of the product get used. Basis: your consent, recorded per purpose. The gate fails closed: if your choice cannot be read, analytics stays off.',
  },
  {
    label: 'Email address given on the early-access list',
    value:
      'Purpose: telling you when enterprise features open. Optionally, product updates: a separate box you can leave unticked or withdraw on its own. Basis: your consent, recorded before the address is stored.',
  },
  {
    label: 'Server logs and an append-only security audit log',
    value:
      'Purpose: debugging, preventing abuse, and investigating security incidents. Bearer tokens are redacted. Basis: keeping the service secure and available.',
  },
];

function consentRows(): LedgerRow[] {
  return CONSENT_PURPOSES.map((purpose) => ({
    label: purpose.label,
    value: (
      <>
        {purpose.description}
        <br />
        <span style={{ color: 'var(--agi-ink-2)' }}>
          {purpose.necessaryForRequest
            ? 'Required for the thing you asked for'
            : 'Optional, declining costs you nothing'}
        </span>
      </>
    ),
  }));
}

const RETENTION: readonly LedgerRow[] = [
  {
    label: 'Account and its content',
    value:
      'Kept while your account is active. Permanently erased 24 hours after a deletion request, by a daily scheduled job that also deletes your identity at our authentication provider.',
  },
  {
    label: 'Conversations (Managed Cloud)',
    value:
      'Kept until you delete them or delete your account. There is no automatic expiry on ordinary conversations today, and we will not describe one until it runs.',
  },
  { label: 'Temporary chats', value: 'About 30 days, hard-deleted by a daily job.' },
  {
    label: 'Deleted files',
    value: '30 days in the recently-deleted bin, then the underlying objects are removed.',
  },
  {
    label: 'Security audit log',
    value:
      '90 days as a policy. The routine that enforces it is run by an administrator, not on a schedule, so treat it as the policy rather than an automatic guarantee.',
  },
  {
    label: 'Consent records',
    value:
      'Kept for as long as the account exists, including withdrawn consents, because a record that consent was once held is the evidence this Act asks us to be able to produce. Erased with the account.',
  },
  {
    label: 'Early-access list email addresses',
    value: (
      <>
        <strong>No maximum age is enforced today.</strong> The address is removed on request via the
        grievance contact below. We will not publish a window until a job deletes them.
      </>
    ),
  },
  {
    label: 'Server logs and backups',
    value:
      'Vendor-governed. We do not operate a process that reaches into vendor snapshots to remove individual records, and we will not claim a number we do not set.',
  },
];

const RIGHTS: readonly LedgerRow[] = [
  {
    label: 'Access: a summary of your data and who it has been shared with',
    value: (
      <>
        Signed in, export your data from the account export endpoint at any time. It is rate limited
        and each export is recorded in the security audit log. The list of recipients is section 04
        and{' '}
        <Link href={CANONICAL_POLICY_ROUTES.subprocessors} className="agi-ds-link">
          /subprocessors
        </Link>
        ; the export does not enumerate them per record.
      </>
    ),
  },
  {
    label: 'Correction, completion and updating',
    value:
      'Profile and settings are editable in the product. For anything you cannot edit yourself, use the request form below and say what is wrong; we correct it.',
  },
  {
    label: 'Erasure',
    value:
      'Request account deletion in the product. Erasure is scheduled 24 hours later and then performed. Two limits, stated plainly: you get no confirmation email, because the only email this product sends is support-escalation and scheduled-task notification: there is no account-lifecycle email path; and there is no self-serve way to cancel a scheduled deletion, so inside that 24-hour window you must reach us.',
  },
  {
    label: 'Withdraw consent',
    value: (
      <>
        <Link href={CANONICAL_POLICY_ROUTES.dataRights} className="agi-ds-link">
          /privacy/requests
        </Link>
        , per purpose, immediately, without contacting anyone.
      </>
    ),
  },
  {
    label: 'Grievance redressal',
    value:
      'Section 08. Use it before approaching the Data Protection Board: the Act expects you to have exhausted our route first.',
  },
  {
    label: 'Nominate someone to exercise your rights if you die or become incapacitated',
    value: (
      <>
        <strong>Not self-serve.</strong> There is no nomination field in the product today. Send the
        nomination to the grievance contact in section 08 and we will record it against your account
        manually. This is an open item, not a finished feature.
      </>
    ),
  },
];

export default function IndiaDpdpNoticePage() {
  return (
    <div data-design="agi" className="agi-ds-page" data-legal-review="pending-counsel">
      <Header />
      <main id="main-content">
        <Section id="hero" size="sm">
          <Stack gap="loose">
            <div>
              <p className="agi-ds-eyebrow">India · Digital Personal Data Protection Act, 2023</p>
              <h1 className="agi-ds-h1" id="agi-india-title">
                Notice to Data Principals in India.
              </h1>
            </div>
            <Prose size="lg">
              This is the itemised notice the DPDP Act requires us to give you before we process
              your personal data. It sits alongside the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
                main privacy policy
              </Link>
              , which describes the same processing in more detail;{' '}
              <strong>where the two differ on your rights in India, this page governs.</strong> Last
              updated: {POLICY_LAST_UPDATED.indiaPrivacy}. Managed Cloud is in public alpha.
            </Prose>
          </Stack>
        </Section>

        <Section id="contents" size="sm" rule>
          <PolicyContents sections={SECTIONS} />
        </Section>

        <Section id="s-00" labelledBy="agi-india-00-title" rule>
          <Stack gap="tight">
            <h2 className="agi-ds-h2" id="agi-india-00-title">
              00 &middot; Who is responsible.
            </h2>
            <Prose>
              {LEGAL_ENTITY}, {NOTICE_ADDRESS}, is the <strong>Data Fiduciary</strong> for the
              processing described here: it decides why and how your personal data is processed. You
              are the <strong>Data Principal</strong>. AGI has no establishment in India and no data
              centre in India; your data is hosted in the United States, which section 06 explains.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-01" labelledBy="agi-india-01-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-india-01-title">
                01 &middot; The mode decides what we hold.
              </h2>
              <Prose>
                Most of this notice depends on which mode you run, because Local, BYOK and Managed
                Cloud are separate trust boundaries and your data goes to genuinely different places
                in each. Read this first.
              </Prose>
            </div>
            <Ledger caption="Trust boundaries" rows={MODES} />
          </Stack>
        </Section>

        <Section id="s-02" labelledBy="agi-india-02-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-india-02-title">
                02 &middot; What we process, and for which purpose.
              </h2>
              <Prose>
                The Act requires the purpose to be specific and the data to be limited to what that
                purpose needs. Each row below is one purpose, not a category we might later reuse.
              </Prose>
            </div>
            <Ledger caption="Processing purposes" rows={PROCESSING} />
            <Prose size="sm">
              <strong>What we do not do with it.</strong> AGI does not train AGI-owned models on
              your prompts, responses or files. We run no advertising, set no advertising cookies,
              and do not sell or share personal data for cross-context behavioural advertising.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-03" labelledBy="agi-india-03-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-india-03-title">
                03 &middot; The consent we ask for, one purpose at a time.
              </h2>
              <Prose>
                Consent under this Act has to be specific, unbundled, and given by a clear
                affirmative action. So every box is unticked when you meet it, an optional purpose
                never blocks a necessary one, and every decision (including the boxes you leave
                unticked) is recorded against the revision of this notice that was on screen. These
                are the purposes we ask about:
              </Prose>
            </div>
            <Ledger caption="Consent purposes" rows={consentRows()} />
            <Prose size="sm">
              Withdrawing is as easy as giving: change any of them at{' '}
              <Link href={CANONICAL_POLICY_ROUTES.dataRights} className="agi-ds-link">
                /privacy/requests
              </Link>
              , with no email and no support ticket. Withdrawal stops the future processing that
              depended on it; it does not undo processing that already lawfully happened, and it
              does not delete your account. That is a separate request on the same page.{' '}
              <strong>
                AGI is not registered with a Consent Manager under section 6(7), so consent is given
                to us directly rather than through one.
              </strong>
            </Prose>
          </Stack>
        </Section>

        <Section id="s-04" labelledBy="agi-india-04-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-india-04-title">
              04 &middot; Who else receives it.
            </h2>
            <Prose>
              The published list, with what each one receives and where it runs, is at{' '}
              <Link href={CANONICAL_POLICY_ROUTES.subprocessors} className="agi-ds-link">
                /subprocessors
              </Link>
              . In summary: an identity provider holds your login, Stripe holds your payments, our
              hosting and database vendors hold what you store in Managed Cloud, object storage
              holds your files, and error/analytics vendors receive only what section 02 describes
              and only with your consent.
            </Prose>
            <Prose size="sm">
              <strong>
                That published list is currently incomplete, and we would rather say so here than
                let you rely on it.
              </strong>{' '}
              A review completed on {POLICY_LAST_UPDATED.indiaPrivacy} found recipients that receive
              personal data and are not on it: an email provider used for support escalations and
              scheduled-task notifications, a video-generation provider that receives the prompt
              text you type, a geocoding service that receives location queries you make, and the
              Apple and Google store APIs that receive purchase identifiers on mobile. Correcting
              that page is a tracked open item. If your decision to use this service depends on the
              full recipient list, ask the grievance contact in section 08 before you sign up.
            </Prose>
            <Prose size="sm">
              <strong>Model providers.</strong> In Managed Cloud, the prompt and any attached
              content go to the provider serving the model you selected, and for routed models the
              request passes through OpenRouter. Those providers handle that content under their own
              terms and data-use policies; our no-training statement is about AGI-owned models and
              is not a promise on their behalf. In BYOK the request goes from your client straight
              to the provider on your key, governed by your own account with them. In Local, none of
              them are contacted.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-05" labelledBy="agi-india-05-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-india-05-title">
                05 &middot; How long we keep it.
              </h2>
              <Prose>
                The Act requires erasure once the purpose is no longer being served, unless
                retention is required by law. Every row below is a job or a mechanism that exists in
                the product, and the ones we do not control are named as such. The full schedule,
                including billing records, is section 05 of the{' '}
                <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
                  privacy policy
                </Link>
                .
              </Prose>
            </div>
            <Ledger caption="Retention" rows={RETENTION} />
          </Stack>
        </Section>

        <Section id="s-06" labelledBy="agi-india-06-title" rule>
          <Stack gap="tight">
            <h2 className="agi-ds-h2" id="agi-india-06-title">
              06 &middot; Where it goes, and out of India.
            </h2>
            <Prose>
              <strong>Your personal data is processed and stored in the United States.</strong> AGI
              does not offer data residency in India, so using this service means your personal data
              leaves India. The Act permits transfer outside India except to territories the Central
              Government restricts by notification; whether any notification affects the United
              States is a question of the live notification list on the date you read this, and we
              will not assert an answer to it here. If you need Indian data residency, we do not
              have it, and you should not sign up expecting it.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-07" labelledBy="agi-india-07-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-india-07-title">
              07 &middot; Your rights, and what actually happens.
            </h2>
            <Ledger caption="Your rights" rows={RIGHTS} />
            <Prose size="sm">
              The Act also places duties on you: do not impersonate someone else when giving your
              data, do not suppress material information when it is legally required, and do not
              file false or frivolous grievances.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-08" labelledBy="agi-india-08-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-india-08-title">
              08 &middot; Grievance redressal.
            </h2>
            <Stack gap="tight">
              <h3 className="agi-ds-h3">{GRIEVANCE_OFFICER_NAME}</h3>
              <Prose size="sm">
                Email{' '}
                <a href={contactMailto(CONTACT_SUBJECTS.dpdpGrievance)} className="agi-ds-link">
                  {CONTACT_EMAIL}
                </a>{' '}
                with the subject line &ldquo;{CONTACT_SUBJECTS.dpdpGrievance}&rdquo;, or post to{' '}
                {LEGAL_ENTITY}, {NOTICE_ADDRESS}. We aim to respond within{' '}
                {GRIEVANCE_RESPONSE_TARGET_DAYS} days.{' '}
                <strong>
                  That target is our commitment, not a statutory deadline we are quoting.
                </strong>
              </Prose>
            </Stack>
            <Prose size="sm">
              Subject-line routing is used because this is the one mailbox proven to receive mail; a
              dedicated grievance address is not provisioned, and we would rather publish a working
              inbox than a dedicated one that bounces. If our response does not resolve it, you may
              complain to the Data Protection Board of India.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-09" labelledBy="agi-india-09-title" rule ground="2">
          <Stack gap="tight">
            <h2 className="agi-ds-h2" id="agi-india-09-title">
              09 &middot; Children, stated honestly.
            </h2>
            <Prose>
              Under this Act a child is anyone under 18, and processing a child&rsquo;s data
              requires verifiable consent from a parent or guardian. AGI accounts are for people
              aged 18 and over, and the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.terms} className="agi-ds-link">
                terms
              </Link>{' '}
              permit 13- to 17-year-olds only under an account opened and supervised by a parent,
              guardian or school.{' '}
              <strong>
                We do not currently perform verifiable parental consent or age verification.
              </strong>{' '}
              That is a gap against this Act, we are naming it rather than implying otherwise, and
              it is tracked as an open item. We do not knowingly collect a child&rsquo;s personal
              data; if you believe we have, use the grievance contact above and we will delete it.
              We do not run behavioural advertising or tracking directed at children in any mode.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-10" labelledBy="agi-india-10-title" rule>
          <Stack gap="tight">
            <h2 className="agi-ds-h2" id="agi-india-10-title">
              10 &middot; Security and breach.
            </h2>
            <Prose>
              We are required to protect your data with reasonable security safeguards, and to
              notify the Data Protection Board and every affected Data Principal if there is a
              breach. Our operational posture is at{' '}
              <Link href={CANONICAL_POLICY_ROUTES.security} className="agi-ds-link">
                /security
              </Link>
              . The internal procedure for a breach (who declares it, what goes in the Board
              notification, and what you would receive) is written down and rehearsed against a
              72-hour clock. The email this product can send today is support-escalation and
              scheduled-task notification; there is no account-lifecycle mailing path, so a
              user-facing breach notice would be delivered in-product and at a public URL rather
              than by email. We would rather tell you that now than discover it during an incident.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-11" labelledBy="agi-india-11-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-india-11-title">
              11 &middot; Language, and changes.
            </h2>
            <Prose>
              This notice is published in English. The Act entitles you to it in any language in the
              Eighth Schedule to the Constitution; translations are not yet published, and that is
              an open item. The current version is always at this URL with the revision date at the
              top, and material changes are recorded on{' '}
              <Link href="/changelog" className="agi-ds-link">
                /changelog
              </Link>
              . No mailing path for policy changes exists in the product, so we do not promise
              emailed notice of a change.
            </Prose>
            <ButtonRow>
              <Button href={CANONICAL_POLICY_ROUTES.dataRights} variant="secondary">
                Exercise your rights
              </Button>
              <Button href={CANONICAL_POLICY_ROUTES.privacy} variant="secondary">
                Full privacy policy
              </Button>
              <Button href={CANONICAL_POLICY_ROUTES.subprocessors} variant="secondary">
                Subprocessors
              </Button>
              <Button href={CANONICAL_POLICY_ROUTES.security} variant="secondary">
                Security
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
