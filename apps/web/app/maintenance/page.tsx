import { buildMetadata } from '@/lib/seo/metadata';
import type { CSSProperties } from 'react';
import { Button, ButtonRow, Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Down for maintenance',
  description: 'AGI Workforce is briefly unavailable while we finish planned maintenance.',
  path: '/maintenance',
  robots: { index: false, follow: false },
});

const STATEMENT_MAX_WIDTH = '30rem';

const statementStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 'var(--agi-space-5)',
  maxWidth: STATEMENT_MAX_WIDTH,
  marginInline: 'auto',
};

export default function MaintenancePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Section size="sm">
          <div style={statementStyle}>
            <div>
              <Eyebrow>Maintenance</Eyebrow>
              <h1 className="agi-ds-h1">We&rsquo;ll be back shortly.</h1>
            </div>
            <Prose>
              AGI Workforce is briefly unavailable while we finish planned maintenance. This is
              deliberate, not an outage, and your data is untouched.
            </Prose>
            <Prose size="sm">
              Conversations, projects, and files are stored and unaffected. Anything that was
              running when maintenance started will either have finished or will resume; nothing is
              discarded because of this window. If something looks wrong after we return, write to{' '}
              <a className="agi-ds-link" href={contactMailto('Maintenance question')}>
                {CONTACT_EMAIL}
              </a>
              .
            </Prose>
            <ButtonRow>
              <Button href="/status">Check live status</Button>
            </ButtonRow>
          </div>
        </Section>
      </main>
    </div>
  );
}
