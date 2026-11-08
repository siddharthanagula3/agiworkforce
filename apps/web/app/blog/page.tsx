import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Ledger, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/Shared';
import { RELEASES, releasePath } from '@/lib/changelog-entries';
import { BLOG_DESCRIPTION, BLOG_POSTS } from '@/lib/blog-posts';
import '@/features/marketing/components/pages/company/company.css';

const RELEASE_NOTES_PATH = '/release-notes';
const LATEST_ANNOUNCEMENT_COUNT = 3;
const LATEST_ANNOUNCEMENTS = RELEASES.slice(0, LATEST_ANNOUNCEMENT_COUNT);

export const metadata = buildMetadata({
  title: 'Guides to AI models, plans and workflows',
  description: BLOG_DESCRIPTION,
  path: '/blog',
  robots: { index: true, follow: true },
});

export default function BlogPage() {
  return (
    <div data-design="agi" className="agi-ds-page agi-co">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-blog-title"
          eyebrow="Writing"
          title="Choosing an AI workspace."
          lede="Check what a plan includes, which models and tools fit your work, and when keeping an official app makes sense."
          ctas={[{ href: RELEASE_NOTES_PATH, label: 'Read the release notes' }]}
        />

        <Section id="guides" labelledBy="agi-blog-guides-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-blog-guides-title">
              Buying guides
            </h2>
            {BLOG_POSTS.map((post) => (
              <Stack key={post.path}>
                <h3 className="agi-ds-h3">
                  <Link href={post.path} className="agi-ds-link">
                    {post.title}
                  </Link>
                </h3>
                <Prose>{post.summary}</Prose>
              </Stack>
            ))}
          </Stack>
        </Section>

        <Section id="announcements" labelledBy="agi-blog-announcements-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-blog-announcements-title">
              The latest announcements.
            </h2>
            <Ledger
              caption="Latest announcements"
              rows={LATEST_ANNOUNCEMENTS.map((release) => ({
                label: release.date,
                value: (
                  <Link href={releasePath(release)} className="agi-ds-link">
                    {release.headline}
                  </Link>
                ),
              }))}
            />
            <Prose>
              The <Link href={RELEASE_NOTES_PATH}>release notes</Link> hold the full archive, with
              the surfaces each release reached.
            </Prose>
          </Stack>
        </Section>

        <Section id="elsewhere" labelledBy="agi-blog-elsewhere-title" rule ground="2">
          <Stack>
            <h2 className="agi-ds-h2" id="agi-blog-elsewhere-title">
              Elsewhere on this site.
            </h2>
            <Prose>
              The <Link href="/about">about page</Link> says who we are, and the{' '}
              <Link href="/security">security page</Link> sets out the operational posture.
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
