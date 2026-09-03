import { buildMetadata } from '@/lib/seo/metadata';
import type { CSSProperties } from 'react';
import { Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import { SessionExpiredActions } from './SessionExpiredActions';

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

export default function SessionExpiredPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Section size="sm">
          <div style={statementStyle}>
            <div>
              <Eyebrow>Signed out</Eyebrow>
              <h1 className="agi-ds-h1">Your session expired.</h1>
            </div>
            <Prose>
              Sign-ins last a limited time, so this happens on its own after a while. Nothing you
              saved was lost.
            </Prose>
            <Prose size="sm">
              A session ends when it reaches its lifetime, when you sign out on another device, or
              after a long stretch of inactivity. Signing in again issues a fresh one; you do not
              need to clear anything or reinstall. If you are sent back here immediately after
              signing in, allow third-party cookies for this site and try again.
            </Prose>
            <SessionExpiredActions />
          </div>
        </Section>
      </main>
    </div>
  );
}
