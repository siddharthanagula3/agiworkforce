/**
 * Base URL for `/api/*` routes served by the Next.js app.
 *
 * STB-8: this used to be documented as "the API gateway (Express backend)"
 * while defaulting to the web app origin. That mismatch is what sent
 * gateway-only routes to the wrong host. Gateway-only routes must use
 * {@link GATEWAY_BASE_URL}; everything under `apps/web/app/api` uses this.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || 'https://agiworkforce.com';

export const WEB_APP_URL: string =
  (import.meta.env['VITE_WEB_APP_URL'] as string | undefined) || 'https://agiworkforce.com';

export const GATEWAY_BASE_URL: string =
  (import.meta.env['VITE_GATEWAY_BASE_URL'] as string | undefined) ||
  'https://api.agiworkforce.com';
