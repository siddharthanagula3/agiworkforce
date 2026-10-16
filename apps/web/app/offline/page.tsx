import { buildMetadata } from '@/lib/seo/metadata';
import type { CSSProperties } from 'react';
import { Eyebrow, Section } from '@/features/marketing/components/system';
import {
  OfflineCaptivePortalHint,
  OfflineHeading,
  OfflineStatus,
  OfflineSummary,
} from './OfflineStatus';

export const metadata = buildMetadata({
  title: 'No connection',
  description: 'AGI Workforce cannot reach the network right now.',
  path: '/offline',
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

export default function OfflinePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Section size="sm">
          <div style={statementStyle}>
            <div>
              <Eyebrow>Connection</Eyebrow>
              <OfflineHeading />
            </div>
            <OfflineSummary />
            <OfflineStatus />
            <OfflineCaptivePortalHint />
          </div>
        </Section>
      </main>
    </div>
  );
}
