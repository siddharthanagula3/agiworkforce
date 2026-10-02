import type { Metadata } from 'next';

import { CHANGELOG_FEED_LINKS } from './changelog-feed';
import { ReleaseNotesPage } from './ReleaseNotesPage';

export const metadata: Metadata = {
  title: 'Release notes',
  description:
    'A dated archive of what shipped, which surfaces it reached, and whether it is GA, beta or alpha.',
  alternates: { canonical: '/release-notes', types: CHANGELOG_FEED_LINKS },
  openGraph: {
    title: 'Release notes',
    description: 'A dated archive of what shipped. Honest about what has not.',
    type: 'website',
    url: 'https://agiworkforce.com/release-notes',
  },
};

export default function Page() {
  return <ReleaseNotesPage titleId="agi-release-notes-title" />;
}
