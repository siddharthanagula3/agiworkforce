import { buildMetadata } from '@/lib/seo/metadata';

import { CHANGELOG_FEED_LINKS } from './changelog-feed';

export const RELEASE_NOTES_METADATA = buildMetadata({
  title: 'Release notes',
  description:
    'A dated archive of what shipped, which surfaces it reached, and whether it is GA, beta or alpha.',
  path: '/release-notes',
  feeds: CHANGELOG_FEED_LINKS,
});
