import { buildMetadata } from '@/lib/seo/metadata';
import { Eyebrow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { CONTACT_EMAIL, LEGAL_ENTITY, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Not available in your region',
  description:
    'AGI Workforce is not currently offered in the European Economic Area. This page explains why and how to reach us.',
  path: '/region-unavailable',
});

export default function RegionUnavailablePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Section size="sm">
          <Stack gap="loose">
            <div>
              <Eyebrow>Availability</Eyebrow>
              <h1 className="agi-ds-h1">Not available in your region.</h1>
            </div>
            <Prose>
              {LEGAL_ENTITY} does not currently offer AGI Workforce to people in the European
              Economic Area.
            </Prose>
          </Stack>
        </Section>

        <Section size="sm" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2">Why.</h2>
            <Prose>
              Article 27 of the GDPR requires a company outside the EU that offers services to
              people in the EU to appoint a representative established in the Union. We have not
              appointed one. Rather than serve the EEA without meeting that obligation, we do not
              serve it at all.
            </Prose>
            <Prose>
              This is a deliberate decision, not an outage, and it is not a judgement about you. If
              you reached this page while travelling, the service should work again from a non-EEA
              location.
            </Prose>
          </Stack>
        </Section>

        <Section size="sm" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2">If you already have an account.</h2>
            <Prose>
              Your data is unaffected by this block, and your rights over it are unchanged. To
              export or delete your data, or to raise a privacy request, write to{' '}
              <a className="agi-ds-link" href={contactMailto('privacy')}>
                {CONTACT_EMAIL}
              </a>{' '}
              and we will act on it wherever you are.
            </Prose>
          </Stack>
        </Section>
      </main>
    </div>
  );
}
