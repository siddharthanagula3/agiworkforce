import { NEW_CHAT_PATH } from '@/features/chat/lib/new-chat-entry';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { SITE_URL } from '@/lib/seo/site';
import {
  AUTH_LOGIN_PATH,
  AUTH_SIGNUP_PATH,
  AUTH_LOGIN_COMPLETE_PATH,
  AUTH_SIGNUP_COMPLETE_PATH,
  AUTH_SSO_CALLBACK_PATH,
} from './authRoutes';

const completionLoops = new Set([
  AUTH_LOGIN_PATH,
  AUTH_SIGNUP_PATH,
  AUTH_LOGIN_COMPLETE_PATH,
  AUTH_SIGNUP_COMPLETE_PATH,
  AUTH_SSO_CALLBACK_PATH,
  '/session-expired',
  '/register',
  '/sign-up',
  '/sign-in',
  '/auth/login',
  '/forgot-password',
]);

export function postAuthDestination(requested?: string | null): string {
  const safe = getSafeRedirectUrl(requested, SITE_URL, NEW_CHAT_PATH);
  const url = new URL(safe, SITE_URL);
  if (completionLoops.has(url.pathname.replace(/\/+$/, ''))) return NEW_CHAT_PATH;
  return url.pathname === '/' ? NEW_CHAT_PATH + url.search + url.hash : safe;
}
