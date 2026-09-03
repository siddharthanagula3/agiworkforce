import { buildMetadata } from '@/lib/seo/metadata';
import type { CSSProperties } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import { CONTACT_EMAIL, LEGAL_ENTITY, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Not available in your region',
  description:
    'AGI Workforce is not currently offered in the European Economic Area. This page explains why and how to reach us.',
  path: '/region-unavailable',
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
              {LEGAL_ENTITY} does not currently offer AGI Workforce to people in the European
              Economic Area.
            </Prose>
            <Prose size="sm">
              Article 27 of the GDPR requires a company outside the EU that offers services to
              people in the EU to appoint a representative established in the Union. We have not
              appointed one, so rather than serve the EEA without meeting that obligation, we do not
              serve it at all. This is a deliberate decision, not an outage: if you reached this
              page while travelling, the service should work again from a non-EEA location. Your
              data and your rights over it are unaffected either way.
            </Prose>
            <ButtonRow>
              <Button href={contactMailto('privacy')}>Email {CONTACT_EMAIL}</Button>
            </ButtonRow>
          </div>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
