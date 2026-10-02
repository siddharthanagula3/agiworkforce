import { ATOM_MEDIA_TYPE, changelogFeed } from '../../release-notes/changelog-feed';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(changelogFeed(), {
    status: 200,
    headers: {
      'Content-Type': `${ATOM_MEDIA_TYPE}; charset=utf-8`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
