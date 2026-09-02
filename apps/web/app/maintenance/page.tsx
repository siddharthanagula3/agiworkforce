import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Eyebrow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Down for maintenance',
  description: 'AGI Workforce is briefly unavailable while we finish planned maintenance.',
  path: '/maintenance',
  robots: { index: false, follow: false },
});

export default function MaintenancePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Section size="sm">
          <Stack gap="loose">
            <div>
              <Eyebrow>Maintenance</Eyebrow>
              <h1 className="agi-ds-h1">We&rsquo;ll be back shortly.</h1>
            </div>
            <Prose>
              AGI Workforce is briefly unavailable while we finish planned maintenance. This is
              deliberate, not an outage, and your data is untouched.
            </Prose>
          </Stack>
        </Section>

        <Section size="sm" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2">What is happening to your work.</h2>
            <Prose>
              Conversations, projects, and files are stored and unaffected. Anything that was
              running when maintenance started will either have finished or will resume; nothing is
              discarded because of this window.
            </Prose>
          </Stack>
        </Section>

        <Section size="sm" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2">Where to check.</h2>
            <Prose>
              Live service state and the current window are published on{' '}
              <Link className="agi-ds-link" href="/status">
                the status page
              </Link>
              , which is hosted separately so it stays reachable while the app is not. If something
              looks wrong after we return, write to{' '}
              <a className="agi-ds-link" href={contactMailto('Maintenance question')}>
                {CONTACT_EMAIL}
              </a>
              .
            </Prose>
          </Stack>
        </Section>
      </main>
    </div>
  );
}
