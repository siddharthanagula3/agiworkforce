import 'server-only';

import { SETTINGS_DEEP_LINK_QUERY_KEY } from '@/features/settings/lib/web-settings-sections';
import { isConnectorTokenStorageAvailable } from '@/lib/custom-connector-crypto';
import { SLACK_SIGNING_SECRET_ENV } from '@/lib/triggers/trigger-signatures';

import {
  SLACK_SETTINGS_SECTION,
  SLACK_SETTINGS_STATUS_PARAM,
  type SlackInstallStatus,
} from './slack-contract';

export const SLACK_BOT_SCOPES = [
  'app_mentions:read',
  'channels:history',
  'chat:write',
  'groups:history',
  'im:history',
  'reactions:write',
  'users:read',
] as const;

export const SLACK_LINK_PATH = '/slack/link';
export const SLACK_OAUTH_CALLBACK_PATH = '/api/slack/oauth/callback';
export const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
export const SLACK_INSTALL_STATE_COOKIE = 'slack_install_state';

export const SLACK_LINK_TTL_SECONDS = 15 * 60;
export const SLACK_INSTALL_STATE_TTL_SECONDS = 10 * 60;
export const SLACK_APPROVAL_TTL_HOURS = 24;

export const SLACK_CONTEXT_LIMITS = {
  directMessages: 20,
  directMessageWindowHours: 12,
  threadMessages: 40,
  channelMessages: 10,
  maxChars: 24_000,
  maxMessageChars: 4_000,
  namedUsers: 12,
  replyPages: 5,
} as const;

export const SLACK_WORKING_REACTION = 'eyes';

const LOCAL_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

export interface SlackAppCredentials {
  clientId: string;
  clientSecret: string;
}

export function slackAppCredentials(): SlackAppCredentials | null {
  const clientId = process.env['SLACK_APP_CLIENT_ID']?.trim();
  const clientSecret = process.env['SLACK_APP_CLIENT_SECRET']?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function slackAppOrigin(): string | null {
  const configured = process.env['NEXT_PUBLIC_APP_URL']?.trim();
  if (!configured) return null;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return null;
  }
  if (url.protocol === 'https:') return url.origin;
  return url.protocol === 'http:' && LOCAL_DEV_HOSTNAMES.has(url.hostname) ? url.origin : null;
}

export function isSlackAppConfigured(): boolean {
  return Boolean(
    process.env[SLACK_SIGNING_SECRET_ENV]?.trim() &&
    slackAppCredentials() &&
    slackAppOrigin() &&
    isConnectorTokenStorageAvailable(),
  );
}

export function slackOAuthRedirectUri(origin: string): string {
  return new URL(SLACK_OAUTH_CALLBACK_PATH, origin).toString();
}

export function slackSettingsUrl(origin: string, status?: SlackInstallStatus): string {
  const url = new URL('/chat', origin);
  url.searchParams.set(SETTINGS_DEEP_LINK_QUERY_KEY, SLACK_SETTINGS_SECTION);
  if (status) url.searchParams.set(SLACK_SETTINGS_STATUS_PARAM, status);
  return url.toString();
}

export function slackLinkUrl(origin: string, token: string): string {
  const url = new URL(SLACK_LINK_PATH, origin);
  url.searchParams.set('token', token);
  return url.toString();
}
