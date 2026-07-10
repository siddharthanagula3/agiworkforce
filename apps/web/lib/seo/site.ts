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
 * The real dimensions of `public/app-preview.png` are 1024x665.
 * Next.js does NOT infer these; asserting 1200x630 (the old default) tells
 * crawlers to expect an image that does not exist, which some validators and
 * link unfurlers treat as a broken card. Keep these in lockstep with the file.
 */
export const OG_IMAGE = {
  url: '/app-preview.png',
  width: 1024,
  height: 665,
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
 * Build an absolute canonical URL for a public path.
 * `/` maps to the bare origin; every other path is appended verbatim.
 */
export function absoluteUrl(path: string): string {
  if (!path || path === '/') return SITE_URL;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
