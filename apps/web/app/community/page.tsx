import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Community: where to find AGI',
  description: 'Where to find AGI: follow the changelog for what ships, email for everything else.',
  path: '/community',
});

export default function CommunityPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-community-title"
          eyebrow="Community"
          title="Where to find us."
          lede={`We do not run a Discord, a forum, or a Slack workspace yet. Follow the changelog for what ships, and email ${CONTACT_EMAIL} for everything else. A real human reads it.`}
          ctas={[
            { href: '/changelog', label: 'Follow the changelog' },
            { href: contactMailto(), label: 'Email us', variant: 'secondary' },
          ]}
        />

        <Section id="channels" labelledBy="agi-community-channels-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-community-channels-title">
              Two channels, all real.
            </h2>
            <LinkGrid
              items={[
                {
                  meta: 'Changelog',
                  title: 'Follow the changelog',
                  href: '/changelog',
                  body: (
                    <>
                      A dated archive of what shipped. The fastest way to track where the product is
                      going. We also post it on{' '}
                      <a
                        href="https://twitter.com/agiworkforce"
                        className="agi-ds-link"
                        style={{ backgroundSize: '100% 1px' }}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        X
                      </a>
                      , but we do not reply to support there.
                    </>
                  ),
                },
                {
                  meta: 'Email',
                  title: 'Email us',
                  href: contactMailto(),
                  body: `${CONTACT_EMAIL}. A real human reads it. Use it for billing, partnerships, press, and anything the changelog does not answer.`,
                  external: true,
                },
              ]}
            />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
