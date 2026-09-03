import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { NoteList } from '@/features/marketing/components/pages/company/shared';

export const metadata = buildMetadata({
  title: 'Writing: engineering notes, not content marketing',
  description:
    'We post when we have something to say. Engineering deep-dives, security postures, design notes.',
  path: '/blog',
});

const TOPICS = [
  {
    title: 'Engineering deep-dives',
    body: 'How a surface is actually built: the provider adapter contract, the egress separation behind Local and BYOK, and the decisions we would take back.',
  },
  {
    title: 'Security postures',
    body: 'What the trust boundary enforces, what it does not, and the gaps we name in SECURITY.md rather than leave for someone else to find.',
  },
  {
    title: 'Design notes',
    body: 'Why the interface reads the way it does, including the things we removed and the constraint that made the call.',
  },
];

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

        <Section id="topics" labelledBy="agi-blog-topics-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-blog-topics-title">
              What we write about.
            </h2>
            <NoteList items={TOPICS} />
          </Stack>
        </Section>

        <Section id="until-then" labelledBy="agi-blog-until-title" rule ground="2">
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
