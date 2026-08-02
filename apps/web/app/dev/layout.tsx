// apps/web/app/dev/layout.tsx
//
// SIX-24: production kill-switch for every `/dev/*` QA harness.
//
// The harnesses under this segment render hand-authored, fabricated transcripts
// (synthetic tool calls, invented web-search sources, seeded assistant
// messages). They exist so a human can eyeball inline rendering without a live
// provider turn, and they must never be reachable — or crawlable — on the
// production domain, where a fabricated transcript would read as real product
// output.
//
// This is a Server Component, so the guard runs before any harness page module
// is rendered and the response carries a real 404 status (a page that merely
// returns `null` still serves 200 OK and is indexable). Each harness keeps its
// own in-component guard as defence-in-depth.
//
// Paired with `/dev/` in `DISALLOW_APP` (app/robots.ts) so preview/staging
// deployments — where NODE_ENV is still `production` for the build but the
// domain is crawlable — stay out of every index.

import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export default function DevHarnessLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <>{children}</>;
}
