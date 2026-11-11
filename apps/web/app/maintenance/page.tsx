import { PRODUCT_BRAND } from '@agiworkforce/types';
import { buildMetadata } from '@/lib/seo/metadata';
import type { CSSProperties, ReactNode } from 'react';
import { Button, ButtonRow, Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';
import {
  formatMaintenanceEnd,
  formatMaintenanceStart,
  readMaintenanceSchedule,
} from '@/lib/server/service-notices';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'Planned maintenance',
  description: `Scheduled maintenance windows for ${PRODUCT_BRAND}.`,
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

function MaintenanceStatement({ headline, children }: { headline: string; children: ReactNode }) {
  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Section size="sm">
          <div style={statementStyle}>
            <div>
              <Eyebrow>Maintenance</Eyebrow>
              <h1 className="agi-ds-h1">{headline}</h1>
            </div>
            {children}
            <ButtonRow>
              <Button href="/status">Check live status</Button>
            </ButtonRow>
          </div>
        </Section>
      </main>
    </div>
  );
}

export default function MaintenancePage() {
  const schedule = readMaintenanceSchedule();

  if (!schedule) {
    return (
      <MaintenanceStatement headline="No maintenance is scheduled.">
        <Prose>
          There is no planned maintenance window right now. If something looks wrong, the live
          status page shows what we are seeing.
        </Prose>
      </MaintenanceStatement>
    );
  }

  if (schedule.phase === 'upcoming') {
    return (
      <MaintenanceStatement headline="Maintenance is coming up.">
        <Prose>
          Planned maintenance runs from {formatMaintenanceStart(schedule.window)} to{' '}
          {formatMaintenanceEnd(schedule.window)}. Nothing changes until it starts. New chats will
          be paused while it runs, and open chats may be interrupted.
        </Prose>
      </MaintenanceStatement>
    );
  }

  return (
    <MaintenanceStatement headline="We’ll be back shortly.">
      <Prose>
        {PRODUCT_BRAND} is unavailable for new chats while we finish planned maintenance, due to end
        at {formatMaintenanceEnd(schedule.window)}. This is deliberate, not an outage, and your data
        is untouched.
      </Prose>
      <Prose size="sm">
        Conversations, projects, and files are stored and unaffected. Anything that was running when
        maintenance started will either have finished or will resume; nothing is discarded because
        of this window. If something looks wrong after we return, write to{' '}
        <a className="agi-ds-link" href={contactMailto('Maintenance question')}>
          {CONTACT_EMAIL}
        </a>
        .
      </Prose>
    </MaintenanceStatement>
  );
}
