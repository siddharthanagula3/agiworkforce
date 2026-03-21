/**
 * Centralized API URL configuration.
 *
 * All API base URLs are derived from two environment variables:
 *  - VITE_API_BASE_URL  — the API gateway (Express backend)
 *  - VITE_WEB_APP_URL   — the public web app (Next.js)
 *
 * Every module that needs a base URL should import from here instead of
 * defining its own constant, so that overrides apply in one place.
 */

/** API gateway base URL (Express backend). */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || 'https://www.agiworkforce.com';

/** Public web app base URL (Next.js). */
export const WEB_APP_URL: string =
  (import.meta.env['VITE_WEB_APP_URL'] as string | undefined) ?? 'https://agiworkforce.com';
