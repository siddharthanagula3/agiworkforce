export const SITE_URL = (process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com').replace(
  /\/$/,
  '',
);

export const SITE_NAME = 'AGI';

export const SITE_LEGAL_NAME = 'AGI Automation LLC';

export const TWITTER_HANDLE = '@agiworkforce';

export const OG_IMAGE = {
  url: '/api/og',
  width: 1200,
  height: 630,
  alt: 'AGI - one AI workspace across models and tools',
} as const;

export const OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE.url}`;

export const SOCIAL_PROFILES = [
  'https://twitter.com/agiworkforce',
  'https://github.com/agiworkforce',
] as const;

export const SUPPORT_EMAIL = 'contact@agiworkforce.com';

export const DISALLOW_APP = [
  '/api/',
  '/admin/',
  '/auth/',
  '/dashboard/',
  '/account/',
  '/chat',
  '/chat/schedules',
  '/code',
  '/settings',
  '/billing',
  '/chat/projects',
  '/user',
  '/chat/customize',
  '/dev/',
  '/qa-artifacts',
] as const;

export function absoluteUrl(path: string): string {
  if (!path || path === '/') return SITE_URL;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
