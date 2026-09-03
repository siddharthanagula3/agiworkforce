import { buildMetadata } from '@/lib/seo/metadata';
import { Eyebrow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { OfflineHeading, OfflineStatus } from './OfflineStatus';

export const metadata = buildMetadata({
  title: 'No connection',
  description: 'AGI Workforce cannot reach the network right now.',
  path: '/offline',
  robots: { index: false, follow: false },
});

export default function OfflinePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Section size="sm">
          <Stack gap="loose">
            <div>
              <Eyebrow>Connection</Eyebrow>
              <OfflineHeading />
            </div>
            <Prose>
              AGI Workforce cannot reach the network. Nothing you had open was lost, and unsent
              messages stay in the composer.
            </Prose>
            <OfflineStatus />
          </Stack>
        </Section>

        <Section size="sm" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2">If the connection looks fine.</h2>
            <Prose>
              A captive portal (hotel, airport, or office Wi-Fi that wants a sign-in first) looks
              identical to being offline. Open any other site to see whether it redirects you to a
              login page. A VPN or corporate proxy that blocks our domains produces the same result.
            </Prose>
          </Stack>
        </Section>
      </main>
    </div>
  );
}
