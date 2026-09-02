import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'Writing: engineering notes, not content marketing',
  description:
    'We post when we have something to say. Engineering deep-dives, security postures, design notes.',
  path: '/blog',
});

export default function BlogPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-blog-title"
          eyebrow="Writing"
          title="We post when we have something to say."
          lede="Engineering deep-dives, security postures, and design notes, not content marketing. Posts will appear here when they exist."
          ctas={[]}
        />

        <Section id="until-then" labelledBy="agi-blog-until-title" rule>
          <Stack>
            <h2 className="agi-ds-h2" id="agi-blog-until-title">
              Until then.
            </h2>
            <Prose>
              Read the <Link href="/changelog">changelog</Link> for what shipped, the{' '}
              <Link href="/about">about page</Link> for who we are, and the{' '}
              <Link href="/security">security page</Link> for the operational posture.
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
