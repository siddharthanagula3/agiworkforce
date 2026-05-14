/**
 * Billing service — portal session fetch.
 *
 * Calls `/api/billing/portal-session` with the user's auth token and returns a
 * one-time Stripe Customer Portal URL.  The URL is validated by the caller
 * before being opened (HIGH-MOB-02 allowlist in lib/safeOpenURL.ts).
 */
import { api } from './api';

export interface PortalSessionResult {
  /** One-time Stripe Customer Portal URL (validated by caller before opening). */
  url: string;
}

/**
 * Fetch a one-time Stripe Customer Portal session URL from the backend.
 * Throws if the network call fails or the backend returns a non-200 status.
 */
export async function fetchPortalSessionUrl(): Promise<string> {
  const data = await api.post<PortalSessionResult>('/api/billing/portal-session');
  if (!data.url) {
    throw new Error('billing: portal-session response missing url field');
  }
  return data.url;
}
