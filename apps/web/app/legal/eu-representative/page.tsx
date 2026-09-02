import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'EU representative',
  description:
    'AGI has not designated a representative in the European Union under GDPR Art. 27. This page states the current position and where to send privacy requests in the meantime.',
  path: '/legal/eu-representative',
});

export default function EuRepresentativePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-eu-rep-title"
          eyebrow="Legal"
          title="EU representative."
          lede={
            <>
              <strong>
                {LEGAL_ENTITY} has not designated a representative in the European Union under
                Article 27 GDPR.
              </strong>{' '}
              We would rather state that than defer it. Last updated:{' '}
              {POLICY_LAST_UPDATED.euRepresentative}.
            </>
          }
          ctas={[]}
        />

        <Section id="status" labelledBy="agi-eu-rep-status-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-eu-rep-status-title">
              Where this stands.
            </h2>
            <Prose>
              <strong>No representative is currently appointed.</strong> Article 27 requires a
              controller or processor outside the Union that offers goods or services to people in
              the Union, or monitors their behaviour, to designate a representative established in a
              member state. AGI Managed Cloud has been open to the public since 27 June 2026, so
              this obligation is live and unmet. It is recorded here rather than glossed over, and
              appointing a representative is being progressed. We are not attaching a date, because
              a date we cannot keep would be worse than the admission.
            </Prose>
          </Stack>
        </Section>

        <Section id="meantime" labelledBy="agi-eu-rep-meantime-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-eu-rep-meantime-title">
              What to do in the meantime.
            </h2>
            <Prose>
              The absence of a representative does not reduce your rights or our obligations. Send
              privacy requests (access, correction, deletion, portability, objection) directly to{' '}
              {LEGAL_ENTITY} at{' '}
              <a href={contactMailto(CONTACT_SUBJECTS.privacy)} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>{' '}
              with the subject line &ldquo;{CONTACT_SUBJECTS.privacy}&rdquo;, or by post to{' '}
              {LEGAL_ENTITY}, {NOTICE_ADDRESS}. We respond within 30 days. Export and account
              deletion are also self-serve in the product. See section 06 of the{' '}
              <Link href="/privacy" className="agi-ds-link">
                privacy policy
              </Link>
              .
            </Prose>
            <Prose>
              You retain the right to lodge a complaint with your national supervisory authority,
              and you may bring a claim against us directly. The transfer mechanism for EU personal
              data is set out in section 06 of the{' '}
              <Link href="/dpa" className="agi-ds-link">
                data processing addendum
              </Link>
              .
            </Prose>
            <ButtonRow>
              <Button href={contactMailto(CONTACT_SUBJECTS.privacy)}>Send a privacy request</Button>
              <Button href="/privacy" variant="secondary">
                Privacy policy
              </Button>
              <Button href="/dpa" variant="secondary">
                DPA
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
