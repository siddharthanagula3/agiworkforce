import { buildMetadata } from '@/lib/seo/metadata';
import type { CSSProperties } from 'react';
import { Section } from '@/features/marketing/components/system';
import { sameOriginReturnPath } from './sameOriginReturnPath';
import { SessionRecovery } from './SessionRecovery';

export const metadata = buildMetadata({
  title: 'Session expired',
  description: 'Your sign-in has expired. Sign in again to pick up where you left off.',
  path: '/session-expired',
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

export default async function SessionExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Section size="sm">
          <div style={statementStyle}>
            <SessionRecovery returnPath={sameOriginReturnPath(redirectTo)} />
          </div>
        </Section>
      </main>
    </div>
  );
}
