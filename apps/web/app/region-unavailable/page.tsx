import { buildMetadata } from '@/lib/seo/metadata';
import type { CSSProperties } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import {
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  contactMailto,
} from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Not available in your region',
  description:
    'The page a visitor sees when AGI Workforce refuses access from their region. It says what that means and where availability is published.',
  path: '/region-unavailable',
  robots: { index: false, follow: false },
});

const STATEMENT_MAX_WIDTH = '32rem';

const statementStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 'var(--agi-space-5)',
  maxWidth: STATEMENT_MAX_WIDTH,
  marginInline: 'auto',
};

export default function RegionUnavailablePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section size="sm">
          <div style={statementStyle}>
            <div>
              <Eyebrow>Availability</Eyebrow>
              <h1 className="agi-ds-h1">Not available in your region.</h1>
            </div>
            <Prose>
              You see this page when {LEGAL_ENTITY} refuses access to AGI Workforce from the region
              a request comes from. If you opened this address yourself, nothing has been refused.
            </Prose>
            <Prose size="sm">
              A refusal by region is a decision about where we offer the service, not an outage. If
              you reached this page while travelling, the service should work again from a place
              where it is offered. Where that is, and where it is not, is published on the supported
              countries page. A refusal here does not change your data or your rights over it.
            </Prose>
            <ButtonRow>
              <Button href={CANONICAL_POLICY_ROUTES.supportedCountries}>Supported countries</Button>
              <Button
                href={contactMailto(CONTACT_SUBJECTS.countryAvailability)}
                variant="secondary"
              >
                Email {CONTACT_EMAIL}
              </Button>
            </ButtonRow>
          </div>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
