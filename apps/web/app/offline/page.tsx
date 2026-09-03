import { buildMetadata } from '@/lib/seo/metadata';
import type { CSSProperties } from 'react';
import { Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import { OfflineHeading, OfflineStatus } from './OfflineStatus';

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
            <Prose>
              AGI Workforce cannot reach the network. Nothing you had open was lost, and unsent
              messages stay in the composer.
            </Prose>
            <OfflineStatus />
            <Prose size="sm">
              A captive portal (hotel, airport, or office Wi-Fi that wants a sign-in first) looks
              identical to being offline. Open any other site to see whether it redirects you to a
              login page; a VPN or corporate proxy that blocks our domains produces the same result.
            </Prose>
          </div>
        </Section>
      </main>
    </div>
  );
}
