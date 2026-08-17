import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { GalleryClient } from '@/app/gallery/GalleryClient';

/**
 * /chat/artifacts · the Artifacts rail destination for signed-in users.
 *
 * Why this route exists alongside `/gallery`: the rail's Artifacts entry used to
 * point at `/gallery`, and `/gallery` renders the MARKETING chrome — the
 * Products/Pricing/Business/Docs header and the MarketingFooter — with no app
 * sidebar. Clicking the primary rail therefore threw the user out of the product
 * shell. `/gallery` could not simply be moved into the shell: it is a public,
 * unauthenticated route (`proxy.ts` deliberately omits it from
 * `isProtectedAppRoute`), it carries real SEO metadata and a `sitemap.ts` entry,
 * and its "Inspiration" tab is genuinely useful to a signed-out visitor.
 *
 * So the surface gets two mounts of ONE component: `/gallery` keeps the public
 * marketing page, and this route renders the same `GalleryClient` inside
 * `WebAppShell`. There is no forked copy — a change to the gallery lands on both.
 *
 * Auth: `/chat(.*)` is in `isProtectedAppRoute` and `app/chat/layout.tsx`
 * additionally requires a Clerk user plus current terms acceptance, so this
 * route is protected without touching the public route's matcher.
 */
export const metadata: Metadata = {
  title: 'Artifacts',
  description: 'Artifacts you have built in conversations.',
  // In-app mirror of a page that is already indexed at /gallery — the canonical
  // public URL. Indexing both would compete with it for the same content.
  robots: { index: false, follow: false },
  alternates: { canonical: '/gallery' },
};

export default function ChatArtifactsRoute() {
  return (
    <WebAppShell>
      <GalleryClient chrome="app" />
    </WebAppShell>
  );
}
