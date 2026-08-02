/**
 * Canonical site-wide SEO constants.
 *
 * Single source of truth for the public origin, brand name, social handles,
 * and the Open Graph share image. Everything that emits metadata, structured
 * data, robots, or sitemap entries should read from here so a value is only
 * ever wrong in one place.
 */

/** Public production origin. No trailing slash. */
export const SITE_URL = (process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com').replace(
  /\/$/,
  '',
);

/** Brand name used for `og:site_name`, structured data, and titles. */
export const SITE_NAME = 'AGI';

/** Legal entity behind the product. */
export const SITE_LEGAL_NAME = 'AGI Automation LLC';

/** Twitter / X handle, including the leading `@`. */
export const TWITTER_HANDLE = '@agiworkforce';

/**
 * Open Graph / social share card. Rendered dynamically by `app/api/og/route.tsx`
 * (next/og) as a branded 1200x630 card — the standard OG aspect ratio that
 * Slack / X / iMessage / LinkedIn unfurl — replacing the old static
 * `public/app-preview.png` desktop screenshot. Dimensions are declared here
 * because the route is generated (crawlers can't infer them).
 */
export const OG_IMAGE = {
  url: '/api/og',
  width: 1200,
  height: 630,
  alt: 'AGI - one AI workspace across models and tools',
} as const;

/** Absolute URL for the share image (used where a full URL is required). */
export const OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE.url}`;

/** Public social profiles, surfaced in Organization structured data. */
export const SOCIAL_PROFILES = [
  'https://twitter.com/agiworkforce',
  'https://github.com/agiworkforce',
] as const;

/** Support contact email. */
export const SUPPORT_EMAIL = 'contact@agiworkforce.com';

/**
 * Paths kept out of every crawler's index: API surface, admin, auth flows, the
 * authenticated app itself (chat, settings, billing, projects, user,
 * customize), and the non-production QA harnesses.
 *
 * The app routes carry per-user state. The harness routes (`/dev/*`,
 * `/qa-artifacts`) render hand-authored, fabricated transcripts and must never
 * be indexed as if they were product output — SIX-24. Those two already
 * `notFound()` under `NODE_ENV === 'production'` via their segment layouts, so
 * these entries are belt-and-braces that also cover preview/staging domains.
 *
 * Lives here rather than in `app/robots.ts` so `sitemap.ts` and the SEO tests
 * can read the same list; `robots.ts` is a Next metadata route and should only
 * export its default.
 *
 * Keep in lockstep with sitemap.ts — nothing here may appear there.
 */
export const DISALLOW_APP = [
  '/api/',
  '/admin/',
  '/auth/',
  '/dashboard/',
  '/account/',
  '/chat',
  '/chat/schedules',
  '/settings',
  '/billing',
  '/chat/projects',
  '/user',
  '/chat/customize',
  '/dev/',
  '/qa-artifacts',
] as const;

/**
 * Build an absolute canonical URL for a public path.
 * `/` maps to the bare origin; every other path is appended verbatim.
 */
export function absoluteUrl(path: string): string {
  if (!path || path === '/') return SITE_URL;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
