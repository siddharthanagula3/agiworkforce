import type { Metadata } from 'next';

import { ReleaseNotesPage } from '../release-notes/ReleaseNotesPage';

export const metadata: Metadata = {
  title: 'Changelog',
  description: `A dated archive of what shipped and what is aligned to the public release.`,
  alternates: { canonical: '/release-notes' },
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
