import 'server-only';

import { z } from 'zod';

import type { SlackAppCredentials } from './slack-config';

const SLACK_API_ORIGIN = 'https://slack.com';
const SLACK_REQUEST_TIMEOUT_MS = 10_000;
const SLACK_METHOD_RE = /^[a-z]+(?:\.[a-zA-Z]+)+$/;
const MAX_RATE_LIMIT_WAIT_SECONDS = 10;

export class SlackApiError extends Error {
  constructor(
    readonly method: string,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(`Slack ${method} failed: ${code}`);
    this.name = 'SlackApiError';
  }
}

export function isSlackTokenRevoked(error: unknown): boolean {
  return (
    error instanceof SlackApiError &&
    ['account_inactive', 'invalid_auth', 'not_authed', 'token_revoked', 'token_expired'].includes(
      error.code,
    )
  );
}

type SlackParam = string | number | boolean | readonly unknown[] | Record<string, unknown>;

type SlackAuth = { token: string } | { credentials: SlackAppCredentials };

function slackApiUrl(method: string): string {
  if (!SLACK_METHOD_RE.test(method)) throw new Error(`Not a Slack Web API method: ${method}`);
  const url = new URL(`/api/${method}`, SLACK_API_ORIGIN);
  if (url.origin !== SLACK_API_ORIGIN) throw new Error('Slack API calls may only target slack.com');
  return url.toString();
}

function authorization(auth: SlackAuth): string {
  if ('token' in auth) return `Bearer ${auth.token}`;
  const { clientId, clientSecret } = auth.credentials;
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function callSlack(
  method: string,
  auth: SlackAuth,
  params: Record<string, SlackParam | undefined>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const response = await fetch(slackApiUrl(method), {
    method: 'POST',
    headers: {
      authorization: authorization(auth),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(SLACK_REQUEST_TIMEOUT_MS),
  });
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new SlackApiError(
      method,
      'ratelimited',
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null,
    );
  }
  if (!response.ok) throw new SlackApiError(method, `http_${response.status}`);
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload || payload['ok'] !== true) {
    const code = typeof payload?.['error'] === 'string' ? payload['error'] : 'invalid_response';
    throw new SlackApiError(method, code);
  }
  return payload;
}

async function callSlackOnce(
  method: string,
  auth: SlackAuth,
  params: Record<string, SlackParam | undefined>,
): Promise<Record<string, unknown>> {
  try {
    return await callSlack(method, auth, params);
  } catch (error) {
    if (
      !(error instanceof SlackApiError) ||
      error.code !== 'ratelimited' ||
      error.retryAfterSeconds === null ||
      error.retryAfterSeconds > MAX_RATE_LIMIT_WAIT_SECONDS
    ) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, (error.retryAfterSeconds ?? 1) * 1_000));
    return callSlack(method, auth, params);
  }
}

const OAuthAccessSchema = z.object({
  access_token: z.string().startsWith('xoxb-'),
  token_type: z.literal('bot'),
  scope: z.string(),
  bot_user_id: z.string().min(1),
  app_id: z.string().min(1),
  team: z
    .object({ id: z.string().min(1), name: z.string().min(1) })
    .nullable()
    .optional(),
  enterprise: z
    .object({ id: z.string().min(1), name: z.string() })
    .nullable()
    .optional(),
  authed_user: z.object({ id: z.string().min(1) }).optional(),
  is_enterprise_install: z.boolean().optional(),
});

export interface SlackOAuthAccess {
  botToken: string;
  botUserId: string;
  appId: string;
  scopes: string[];
  teamId: string | null;
  teamName: string | null;
  enterpriseId: string | null;
  enterpriseInstall: boolean;
  authedUserId: string | null;
}

export async function exchangeSlackOAuthCode(input: {
  credentials: SlackAppCredentials;
  code: string;
  redirectUri: string;
}): Promise<SlackOAuthAccess> {
  const payload = await callSlack(
    'oauth.v2.access',
    { credentials: input.credentials },
    { code: input.code, redirect_uri: input.redirectUri },
  );
  const parsed = OAuthAccessSchema.safeParse(payload);
  if (!parsed.success) throw new SlackApiError('oauth.v2.access', 'unexpected_response');
  const access = parsed.data;
  return {
    botToken: access.access_token,
    botUserId: access.bot_user_id,
    appId: access.app_id,
    scopes: access.scope
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean),
    teamId: access.team?.id ?? null,
    teamName: access.team?.name ?? null,
    enterpriseId: access.enterprise?.id ?? null,
    enterpriseInstall: access.is_enterprise_install === true,
    authedUserId: access.authed_user?.id ?? null,
  };
}

export async function revokeSlackToken(token: string): Promise<void> {
  await callSlack('auth.revoke', { token }, {});
}

export interface SlackPostedMessage {
  channel: string;
  ts: string;
}

export async function postSlackMessage(
  token: string,
  message: {
    channel: string;
    text: string;
    blocks?: readonly unknown[];
    threadTs?: string | null;
  },
): Promise<SlackPostedMessage> {
  const payload = await callSlackOnce(
    'chat.postMessage',
    { token },
    {
      channel: message.channel,
      text: message.text,
      blocks: message.blocks,
      thread_ts: message.threadTs ?? undefined,
      unfurl_links: false,
      unfurl_media: false,
    },
  );
  return {
    channel: typeof payload['channel'] === 'string' ? payload['channel'] : message.channel,
    ts: typeof payload['ts'] === 'string' ? payload['ts'] : '',
  };
}

export async function postSlackEphemeral(
  token: string,
  message: {
    channel: string;
    user: string;
    text: string;
    blocks?: readonly unknown[];
    threadTs?: string | null;
  },
): Promise<void> {
  await callSlackOnce(
    'chat.postEphemeral',
    { token },
    {
      channel: message.channel,
      user: message.user,
      text: message.text,
      blocks: message.blocks,
      thread_ts: message.threadTs ?? undefined,
    },
  );
}

export async function setSlackReaction(
  token: string,
  input: { channel: string; timestamp: string; name: string; present: boolean },
): Promise<void> {
  try {
    await callSlack(
      input.present ? 'reactions.add' : 'reactions.remove',
      { token },
      { channel: input.channel, timestamp: input.timestamp, name: input.name },
    );
  } catch (error) {
    if (
      error instanceof SlackApiError &&
      ['already_reacted', 'no_reaction', 'message_not_found'].includes(error.code)
    ) {
      return;
    }
    throw error;
  }
}

const SlackMessageSchema = z.object({
  ts: z.string(),
  thread_ts: z.string().optional(),
  user: z.string().optional(),
  bot_id: z.string().optional(),
  subtype: z.string().optional(),
  text: z.string().optional(),
  files: z.array(z.object({ name: z.string().optional() }).passthrough()).optional(),
  blocks: z.array(z.object({ type: z.string(), text: z.unknown() }).passthrough()).optional(),
});

export type SlackMessage = z.infer<typeof SlackMessageSchema>;

function readMessages(method: string, payload: Record<string, unknown>): SlackMessage[] {
  const parsed = z.array(SlackMessageSchema).safeParse(payload['messages'] ?? []);
  if (!parsed.success) throw new SlackApiError(method, 'unexpected_response');
  return parsed.data;
}

function nextCursor(payload: Record<string, unknown>): string | null {
  const metadata = payload['response_metadata'];
  if (!metadata || typeof metadata !== 'object') return null;
  const cursor = (metadata as Record<string, unknown>)['next_cursor'];
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
}

export async function readSlackThread(
  token: string,
  input: { channel: string; threadTs: string; before: string; keep: number; maxPages: number },
): Promise<SlackMessage[]> {
  let cursor: string | null = null;
  let kept: SlackMessage[] = [];
  for (let page = 0; page < input.maxPages; page += 1) {
    const payload = await callSlack(
      'conversations.replies',
      { token },
      {
        channel: input.channel,
        ts: input.threadTs,
        latest: input.before,
        inclusive: false,
        limit: 200,
        cursor: cursor ?? undefined,
      },
    );
    kept = [...kept, ...readMessages('conversations.replies', payload)].slice(-input.keep);
    cursor = nextCursor(payload);
    if (!cursor) break;
  }
  return kept;
}

export async function readSlackHistory(
  token: string,
  input: { channel: string; before: string; oldest?: string; limit: number },
): Promise<SlackMessage[]> {
  const payload = await callSlack(
    'conversations.history',
    { token },
    {
      channel: input.channel,
      latest: input.before,
      oldest: input.oldest,
      inclusive: false,
      limit: input.limit,
    },
  );
  return readMessages('conversations.history', payload).reverse();
}

const SlackUserSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  real_name: z.string().optional(),
  tz: z.string().optional(),
  deleted: z.boolean().optional(),
  is_bot: z.boolean().optional(),
  profile: z
    .object({ display_name: z.string().optional(), real_name: z.string().optional() })
    .passthrough()
    .optional(),
});

export interface SlackUserProfile {
  id: string;
  displayName: string;
  timeZone: string | null;
}

export async function readSlackUser(token: string, userId: string): Promise<SlackUserProfile> {
  const payload = await callSlack('users.info', { token }, { user: userId });
  const parsed = SlackUserSchema.safeParse(payload['user']);
  if (!parsed.success) throw new SlackApiError('users.info', 'unexpected_response');
  const user = parsed.data;
  const displayName =
    user.profile?.display_name?.trim() ||
    user.profile?.real_name?.trim() ||
    user.real_name?.trim() ||
    user.name?.trim() ||
    user.id;
  return { id: user.id, displayName, timeZone: user.tz?.trim() || null };
}
