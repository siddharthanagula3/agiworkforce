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
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
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

const SELF_SERVE: readonly LedgerRow[] = [
  {
    label: 'Export your data',
    value:
      'Signed in, export from your account settings at any time. It is rate limited and each export is recorded in the security audit log. It does not yet cover every category the schema holds. That gap is tracked, and until it closes, use the access request below if something is missing.',
  },
  {
    label: 'Delete your account',
    value:
      'Request it from account settings. Erasure is scheduled 24 hours out and then performed by a daily job, which also deletes your identity at our authentication provider. You get no confirmation email, but cancellation is self-serve: sign back in and cancel from Settings > Account any time inside that window.',
  },
  {
    label: 'Turn analytics off',
    value: (
      <>
        The cookie preferences dialog, reachable from{' '}
        <Link href={CANONICAL_POLICY_ROUTES.cookies} className="agi-ds-link">
          /cookies
        </Link>
        . Analytics is off until you turn it on, and the gate fails closed.
      </>
    ),
  },
];

export default function DataRightsPage() {
  return (
    <div data-design="agi" className="agi-ds-page" data-legal-review="pending-counsel">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-data-rights-title"
          eyebrow="Your data · rights and consent"
          title="Exercise your rights."
          lede={
            <>
              Everything on this page is a control, not a description of one. What is self-serve is
              self-serve; what needs a human says so and tells you exactly what happens when you
              press the button. Last updated: {POLICY_LAST_UPDATED.dataRights}. The notice that
              explains what we collect and why is at{' '}
              <Link href={CANONICAL_POLICY_ROUTES.indiaPrivacy} className="agi-ds-link">
                /privacy/india
              </Link>{' '}
              for India, and{' '}
              <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-ds-link">
                /privacy
              </Link>{' '}
              generally.
            </>
          }
          ctas={[]}
        />

        <Section id="s-01" labelledBy="agi-data-rights-consent-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-data-rights-consent-title">
                01 &middot; Consent recorded against your account.
              </h2>
              <Prose>
                Withdrawing has to be as easy as giving, so it is one click here: no email, no
                ticket, no waiting on us. Each change is appended to your consent record with the
                revision of the notice that was on screen.
              </Prose>
            </div>
            <ConsentCentre />
          </Stack>
        </Section>

        <Section id="s-02" labelledBy="agi-data-rights-self-serve-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-data-rights-self-serve-title">
              02 &middot; What is already self-serve.
            </h2>
            <Ledger caption="Self-serve controls" rows={SELF_SERVE} />
          </Stack>
        </Section>

        <Section id="s-03" labelledBy="agi-data-rights-request-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-data-rights-request-title">
                03 &middot; Everything else: make a request.
              </h2>
              <Prose>
                Access, correction, erasure without an account, withdrawal of consent given without
                an account, nomination, and grievances. You do not need an account to use this: your
                rights do not depend on having one.
              </Prose>
            </div>
            <RightsRequestForm />
          </Stack>
        </Section>

        <Section id="s-04" labelledBy="agi-data-rights-grievance-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-data-rights-grievance-title">
              04 &middot; Grievance contact.
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
                {GRIEVANCE_RESPONSE_TARGET_DAYS} days, our commitment, not a statutory deadline we
                are quoting. If our response does not resolve it, data principals in India may
                complain to the Data Protection Board of India.
              </Prose>
            </Stack>
            <ButtonRow>
              <Button href={CANONICAL_POLICY_ROUTES.indiaPrivacy} variant="secondary">
                India: DPDP notice
              </Button>
              <Button href={CANONICAL_POLICY_ROUTES.privacy} variant="secondary">
                Privacy policy
              </Button>
              <Button href={CANONICAL_POLICY_ROUTES.cookies} variant="secondary">
                Cookies
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
