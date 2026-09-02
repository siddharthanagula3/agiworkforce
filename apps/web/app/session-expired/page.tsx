import { buildMetadata } from '@/lib/seo/metadata';
import { Eyebrow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { SessionExpiredActions } from './SessionExpiredActions';

export const metadata = buildMetadata({
  title: 'Session expired',
  description: 'Your sign-in has expired. Sign in again to pick up where you left off.',
  path: '/session-expired',
  robots: { index: false, follow: false },
});

export default function SessionExpiredPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Section size="sm">
          <Stack gap="loose">
            <div>
              <Eyebrow>Signed out</Eyebrow>
              <h1 className="agi-ds-h1">Your session expired.</h1>
            </div>
            <Prose>
              Sign-ins last a limited time, so this happens on its own after a while. Nothing you
              saved was lost.
            </Prose>
            <SessionExpiredActions />
          </Stack>
        </Section>

        <Section size="sm" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2">Why this happens.</h2>
            <Prose>
              A session ends when it reaches its lifetime, when you sign out on another device, or
              after a long stretch of inactivity. Signing in again issues a fresh one; you do not
              need to clear anything or reinstall.
            </Prose>
            <Prose>
              If you are sent back here immediately after signing in, third-party cookies are
              usually the cause. Allow cookies for this site, then try again.
            </Prose>
          </Stack>
        </Section>
      </main>
    </div>
  );
}
