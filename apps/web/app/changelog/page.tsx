import type { Metadata } from 'next';

import { CHANGELOG_FEED_LINKS } from '../release-notes/changelog-feed';
import { ReleaseNotesPage } from '../release-notes/ReleaseNotesPage';

export const metadata: Metadata = {
  title: 'Changelog',
  description: `A dated archive of what shipped and what is aligned to the public release.`,
  alternates: { canonical: '/release-notes', types: CHANGELOG_FEED_LINKS },
  openGraph: {
    title: 'Changelog',
    description: 'A dated archive of what shipped. Honest about what has not.',
    type: 'website',
    url: 'https://agiworkforce.com/release-notes',
  },
};

export default function ChangelogPage() {
  return <ReleaseNotesPage titleId="agi-changelog-title" />;
}
