import * as vscode from 'vscode';
import * as http from 'http';
import { randomUUID } from 'crypto';
import * as https from 'https';
import { URL } from 'url';
import { getModelMetrics } from '../features/model-picker/modelMetrics';
import { normalizeConfiguredModelId } from '../features/model-picker/modelConstants';
import { TierInfoSchema, type TierInfoResponse } from '../protocol/apiResponses';
import {
  effectivePlanTier,
  normalizeUsagePercentage,
  type AccountAuthState,
  type ManagedUsageBucket,
  type ManagedUsageBucketReading,
} from '@agiworkforce/types';
import { MeResponseSchema } from '@agiworkforce/cloud-contracts/me';
import { Config } from '../platform/config';
import { getExtensionUserAgent } from '../platform/version';

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CloudUtilityChatCompletionRequest {
  model: string;
  messages: LlmChatMessage[];
  stream: true;
  thinking_mode: boolean;
  effort: 'low' | 'medium' | 'high' | 'max';
}

interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

export class AgiWorkforceApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AgiWorkforceApiError';
  }
}

export class AgiWorkforcePaywallError extends Error {
  public readonly kind = 'paywall' as const;
  public readonly recoveryAction: 'upgrade' | 'manage_billing';

  constructor(
    public readonly feature: string,
    public readonly requiredTier: string,
    public readonly reason: string,
    public readonly code?: string,
  ) {
    super(`Upgrade to ${requiredTier} required for ${feature}: ${reason}`);
    this.name = 'AgiWorkforcePaywallError';
    this.recoveryAction = code === 'subscription_inactive' ? 'manage_billing' : 'upgrade';
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      retries <= 0 ||
      (err instanceof AgiWorkforceApiError && err.statusCode !== undefined && err.statusCode < 500)
    ) {
      throw err;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}

const SECRET_KEY = 'agiWorkforce.apiKey';
const ACCOUNT_TOKEN_KEY = 'agiWorkforce.accountToken';
const ACCOUNT_TOKEN_EXPIRES_AT_KEY = 'agiWorkforce.accountTokenExpiresAt';
const ACCOUNT_TOKEN_EXPIRED_KEY = 'agiWorkforce.accountTokenExpired';
const DEFAULT_ENDPOINT = 'https://agiworkforce.com/api/llm/v1';
const DEFAULT_GATEWAY_ORIGIN = 'https://api.agiworkforce.com';

export async function getApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(SECRET_KEY);
}

export async function setApiKey(secrets: vscode.SecretStorage, apiKey: string): Promise<void> {
  await secrets.store(SECRET_KEY, apiKey);
}

export async function clearApiKey(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(SECRET_KEY);
}

export async function getAccountToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  const state = await getAccountAuthState(secrets);
  if (state.status !== 'signed-in') return undefined;
  return secrets.get(ACCOUNT_TOKEN_KEY);
}

export async function setAccountToken(
  secrets: vscode.SecretStorage,
  token: string,
  expiresAt?: number,
): Promise<void> {
  await secrets.store(ACCOUNT_TOKEN_KEY, token);
  await secrets.delete(ACCOUNT_TOKEN_EXPIRED_KEY);
  if (expiresAt !== undefined) {
    await secrets.store(ACCOUNT_TOKEN_EXPIRES_AT_KEY, String(expiresAt));
  } else {
    await secrets.delete(ACCOUNT_TOKEN_EXPIRES_AT_KEY);
  }
}

export async function clearAccountToken(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(ACCOUNT_TOKEN_KEY);
  await secrets.delete(ACCOUNT_TOKEN_EXPIRES_AT_KEY);
  await secrets.delete(ACCOUNT_TOKEN_EXPIRED_KEY);
}

async function invalidateAccountToken(
  secrets: vscode.SecretStorage,
  observedToken: string,
): Promise<void> {
  const currentToken = await secrets.get(ACCOUNT_TOKEN_KEY);
  if (currentToken !== observedToken) return;
  await secrets.delete(ACCOUNT_TOKEN_KEY);
  await secrets.delete(ACCOUNT_TOKEN_EXPIRES_AT_KEY);
  await secrets.store(ACCOUNT_TOKEN_EXPIRED_KEY, '1');
}

export async function getAccountAuthState(
  secrets: vscode.SecretStorage,
): Promise<AccountAuthState> {
  const token = await secrets.get(ACCOUNT_TOKEN_KEY);
  if (token === undefined || token === '') {
    return (await secrets.get(ACCOUNT_TOKEN_EXPIRED_KEY)) === '1'
      ? { status: 'expired' }
      : { status: 'signed-out' };
  }

  const rawExpiresAt = await secrets.get(ACCOUNT_TOKEN_EXPIRES_AT_KEY);
  if (rawExpiresAt === undefined || rawExpiresAt === '') {
    return { status: 'signed-in' };
  }
  const expiresAt = Number(rawExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await invalidateAccountToken(secrets, token);
    return { status: 'expired' };
  }
  return { status: 'signed-in', expiresAt };
}

type CloudCredential =
  | { kind: 'account'; token: string }
  | { kind: 'api-key'; token: string }
  | { kind: 'none'; accountStatus: 'signed-out' | 'expired' };

async function getCloudCredential(secrets: vscode.SecretStorage): Promise<CloudCredential> {
  const accountState = await getAccountAuthState(secrets);
  if (accountState.status === 'signed-in') {
    const accountToken = await secrets.get(ACCOUNT_TOKEN_KEY);
    if (accountToken !== undefined && accountToken !== '') {
      return { kind: 'account', token: accountToken };
    }
  }
  const apiKey = await getApiKey(secrets);
  if (apiKey !== undefined && apiKey !== '') return { kind: 'api-key', token: apiKey };
  return {
    kind: 'none',
    accountStatus: accountState.status === 'expired' ? 'expired' : 'signed-out',
  };
}

const ENDPOINT_ALLOWED_HOSTS = new Set([
  'agiworkforce.com',
  'api.agiworkforce.com',
  'staging.agiworkforce.com',
]);

export function validateEndpointUrl(raw: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }

  const isHttps = parsed.protocol === 'https:';
  // URL.hostname keeps the brackets on IPv6 literals, so '::1' would never match.
  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';

  if (!isHttps && !isLocalhost) {
    return undefined;
  }

  if (!isLocalhost && !ENDPOINT_ALLOWED_HOSTS.has(parsed.hostname)) {
    return undefined;
  }

  return raw.replace(/\/+$/, '');
}

function getGlobalConfig<T>(section: string, key: string, defaultValue: T): T {
  const config = vscode.workspace.getConfiguration(section);
  const inspected = config.inspect<T>(key);
  return inspected?.globalValue ?? inspected?.defaultValue ?? defaultValue;
}

function getCloudApiEndpoint(): string {
  const raw = getGlobalConfig('agiWorkforce', 'apiEndpoint', DEFAULT_ENDPOINT);
  return validateEndpointUrl(raw) ?? DEFAULT_ENDPOINT;
}

export function getCloudWebOrigin(): string {
  try {
    return new URL(getCloudApiEndpoint()).origin;
  } catch {
    return new URL(DEFAULT_ENDPOINT).origin;
  }
}

export function getCloudGatewayOrigin(): string {
  return DEFAULT_GATEWAY_ORIGIN;
}

function getModel(): string {
  return normalizeConfiguredModelId(
    getGlobalConfig<string | undefined>('agiWorkforce', 'model', undefined),
  );
}

export function buildCloudUtilityChatCompletionRequest(
  messages: LlmChatMessage[],
  overrideModel?: string,
): CloudUtilityChatCompletionRequest {
  return {
    model: overrideModel ?? getModel(),
    messages,
    stream: true,
    thinking_mode: Config.agentThinking(),
    effort: Config.agentEffort(),
  };
}

const PLAN_GATE_CODES = new Set([
  'developer_surface_plan_required',
  'managed_api_plan_required',
  'managed_chat_plan_required',
  'model_not_available',
  'plan_upgrade_required',
  'subscription_required',
  'subscription_inactive',
]);

export function parseCloudCompletionError(statusCode: number, body: string): Error {
  let parsed: Record<string, unknown> | undefined;
  try {
    const candidate = JSON.parse(body) as unknown;
    if (candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)) {
      parsed = candidate as Record<string, unknown>;
    }
  } catch {
    // HTML/proxy responses fall through to a bounded generic message.
  }

  if (
    statusCode === 429 &&
    parsed?.['kind'] === 'paywall' &&
    typeof parsed['feature'] === 'string' &&
    typeof parsed['requiredTier'] === 'string' &&
    typeof parsed['reason'] === 'string'
  ) {
    return new AgiWorkforcePaywallError(
      parsed['feature'],
      parsed['requiredTier'],
      parsed['reason'],
    );
  }

  const nested =
    parsed?.['error'] !== null &&
    typeof parsed?.['error'] === 'object' &&
    !Array.isArray(parsed?.['error'])
      ? (parsed['error'] as Record<string, unknown>)
      : undefined;
  const code = typeof nested?.['code'] === 'string' ? nested['code'] : undefined;
  const message =
    typeof nested?.['message'] === 'string' && nested['message'].trim() !== ''
      ? nested['message'].trim()
      : typeof parsed?.['message'] === 'string' && parsed['message'].trim() !== ''
        ? parsed['message'].trim()
        : undefined;
  const requiredTier =
    typeof nested?.['requiredTier'] === 'string'
      ? nested['requiredTier']
      : typeof nested?.['required_tier'] === 'string'
        ? nested['required_tier']
        : undefined;

  if (statusCode === 403 && code !== undefined && PLAN_GATE_CODES.has(code)) {
    return new AgiWorkforcePaywallError(
      code.replace(/_(?:plan_)?required$/u, '') || 'managed_cloud',
      requiredTier ?? 'pro',
      message ??
        (code === 'subscription_inactive'
          ? 'Your AGI Cloud subscription needs billing attention.'
          : 'This AGI Cloud capability is unavailable on your current plan.'),
      code,
    );
  }

  return new AgiWorkforceApiError(
    message ??
      (statusCode === 429
        ? 'Too many requests right now. Please wait a moment and try again.'
        : `AGI Cloud request failed (HTTP ${statusCode}).`),
    statusCode,
    code ?? (statusCode === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR'),
  );
}

function httpsPostStream(
  urlString: string,
  headers: Record<string, string>,
  body: string,
  onChunk: (chunk: ChatCompletionChunk) => void,
  token: vscode.CancellationToken,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port !== '' ? parseInt(parsed.port, 10) : isHttps ? 443 : 80,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Accept: 'text/event-stream',
      },
    };

    const req = lib.request(options, (res) => {
      if ((res.statusCode ?? 0) >= 400) {
        const errorChunks: Buffer[] = [];
        res.on('data', (c: Buffer) => errorChunks.push(c));
        res.on('end', () => {
          cancelListener.dispose();
          const errBody = Buffer.concat(errorChunks).toString('utf8');
          reject(parseCloudCompletionError(res.statusCode ?? 500, errBody));
        });
        return;
      }

      let buffer = '';
      const MAX_SSE_BUFFER = 1_000_000;

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');

        if (buffer.length > MAX_SSE_BUFFER) {
          cancelListener.dispose();
          req.destroy();
          reject(
            new AgiWorkforceApiError('SSE buffer overflow (malformed stream)', 400, 'HTTP_ERROR'),
          );
          return;
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) {
            continue;
          }
          const data = trimmed.slice('data:'.length).trim();
          if (data === '[DONE]') {
            continue;
          }
          try {
            const parsed = JSON.parse(data) as ChatCompletionChunk;
            onChunk(parsed);
          } catch {
            // Malformed SSE line — skip
          }
        }
      });

      res.on('end', () => {
        cancelListener.dispose();
        resolve();
      });
      res.on('error', (err) => {
        cancelListener.dispose();
        reject(err);
      });
    });

    req.on('error', (err) => {
      cancelListener.dispose();
      reject(err);
    });

    const cancelListener = token.onCancellationRequested(() => {
      cancelListener.dispose();
      req.destroy(new Error('Request cancelled'));
      reject(new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED'));
    });

    req.write(body);
    req.end();
  });
}

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
}

export async function streamChatCompletion(
  secrets: vscode.SecretStorage,
  messages: LlmChatMessage[],
  callbacks: StreamCallbacks,
  cancellationToken: vscode.CancellationToken,
  overrideModel?: string,
): Promise<void> {
  const credential = await getCloudCredential(secrets);
  if (credential.kind === 'none') {
    throw new AgiWorkforceApiError(
      credential.accountStatus === 'expired'
        ? 'Your AGI Cloud session expired. Sign in again to continue.'
        : 'Sign in to AGI Cloud to use cloud-backed editor utilities.',
      401,
      'ACCOUNT_AUTH_REQUIRED',
    );
  }

  const endpoint = getCloudApiEndpoint();
  const requestBody = buildCloudUtilityChatCompletionRequest(messages, overrideModel);
  const model = requestBody.model;

  const bodyStr = JSON.stringify(requestBody);

  const idempotencyKey = `agi.vscode.chat.${randomUUID()}`;

  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${credential.token}`,
    'User-Agent': getExtensionUserAgent(),
    'X-Client': 'vscode-extension',
    'X-AGI-Surface': 'vscode',
    'Idempotency-Key': idempotencyKey,
  };

  const requestStartTime = Date.now();

  if (cancellationToken.isCancellationRequested) {
    throw new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED');
  }
  try {
    await withRetry(() =>
      httpsPostStream(
        `${endpoint}/chat/completions`,
        authHeaders,
        bodyStr,
        (chunk) => {
          const content = chunk.choices[0]?.delta?.content;
          if (content !== undefined && content !== '') {
            callbacks.onToken(content);
          }
        },
        cancellationToken,
      ),
    );
  } catch (error) {
    if (error instanceof AgiWorkforceApiError && error.statusCode === 401) {
      if (credential.kind === 'account') {
        await invalidateAccountToken(secrets, credential.token);
        throw new AgiWorkforceApiError(
          'Your AGI Cloud session expired or was revoked. Sign in again to continue.',
          401,
          'ACCOUNT_AUTH_REQUIRED',
        );
      }
      throw new AgiWorkforceApiError(
        'The saved AGI API key was rejected. Check or replace the key.',
        401,
        'INVALID_API_KEY',
      );
    }
    throw error;
  }
  if (!cancellationToken.isCancellationRequested) {
    callbacks.onDone();
    getModelMetrics().recordRequest(model, Date.now() - requestStartTime);
  }
}

export async function chatCompletion(
  secrets: vscode.SecretStorage,
  messages: LlmChatMessage[],
  cancellationToken: vscode.CancellationToken,
  overrideModel?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (value: string): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const safeReject = (err: unknown): void => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    const tokens: string[] = [];
    streamChatCompletion(
      secrets,
      messages,
      {
        onToken: (t) => tokens.push(t),
        onDone: () => safeResolve(tokens.join('')),
      },
      cancellationToken,
      overrideModel,
    ).catch(safeReject);
  });
}

export interface TierInfo {
  tier: string;
  accountPlanTier?: string;
  subscriptionStatus?: string;
  usagePercentage?: number;
  resetsAt?: string;
  hasUsageRemaining?: boolean;
  usageBuckets?: ManagedUsageBucketReading[];
  creditBalanceCents?: number;
  overageEnabled?: boolean;
}

export interface AccountIdentity {
  displayName: string;
  email: string | null;
  accountType: 'Personal account' | 'Organization account';
  planName: string;
  tier: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  subscriptionSource?: 'none' | 'stripe' | 'apple' | 'google' | 'manual';
}

function unixSecondsToIso(value: number | null): string | undefined {
  if (value === null || !Number.isFinite(value)) return undefined;
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parseAccountIdentityResponse(raw: unknown): AccountIdentity | undefined {
  const parsed = MeResponseSchema.safeParse(raw);
  if (!parsed.success) return undefined;

  const tier = parsed.data.plan.tier.trim().toLowerCase();
  const email = parsed.data.email?.trim() || null;
  const displayName =
    parsed.data.profile?.display_name?.trim() ||
    parsed.data.name.trim() ||
    email ||
    'AGI Cloud account';
  const planName =
    parsed.data.plan.display_name.trim() ||
    (tier ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)}` : 'Unknown');

  const currentPeriodEnd = unixSecondsToIso(parsed.data.plan.current_period_end);
  return {
    displayName,
    email,
    accountType:
      tier === 'team' || tier === 'enterprise' ? 'Organization account' : 'Personal account',
    planName,
    tier,
    subscriptionStatus: parsed.data.plan.status,
    ...(currentPeriodEnd === undefined ? {} : { currentPeriodEnd }),
    cancelAtPeriodEnd: parsed.data.plan.cancel_at_period_end === true,
    subscriptionSource: parsed.data.plan.subscription_source ?? 'none',
  };
}

function readUsageBuckets(summary: TierInfoResponse): ManagedUsageBucketReading[] {
  const windows: ReadonlyArray<{
    bucket: ManagedUsageBucket;
    usedPercentage: number | undefined;
    resetAt: string | null | undefined;
  }> = [
    {
      bucket: 'session',
      usedPercentage: summary.session_usage_percentage,
      resetAt: summary.session_reset_at,
    },
    {
      bucket: 'weekly',
      usedPercentage: summary.weekly_usage_percentage,
      resetAt: summary.weekly_reset_at,
    },
    {
      bucket: 'weeklyFlagship',
      usedPercentage: summary.flagship_weekly_usage_percentage,
      resetAt: summary.flagship_weekly_reset_at,
    },
    {
      bucket: 'period',
      usedPercentage: summary.usage_percentage,
      resetAt: summary.usage_reset_at,
    },
  ];

  return windows
    .filter((window) => typeof window.usedPercentage === 'number')
    .map((window) => ({
      bucket: window.bucket,
      percentRemaining: 100 - normalizeUsagePercentage(window.usedPercentage),
      resetAt: window.resetAt ?? null,
    }));
}

export function parseTierInfoResponse(raw: unknown): TierInfo | undefined {
  const parsed = TierInfoSchema.safeParse(raw);
  if (!parsed.success) return undefined;

  const effectiveTier = effectivePlanTier(parsed.data.plan_tier, parsed.data.subscription_status);
  const tierInfo: TierInfo = {
    tier: effectiveTier,
    subscriptionStatus: parsed.data.subscription_status,
  };
  if (effectiveTier !== parsed.data.plan_tier) {
    tierInfo.accountPlanTier = parsed.data.plan_tier;
  }
  if (typeof parsed.data.usage_percentage === 'number') {
    tierInfo.usagePercentage = parsed.data.usage_percentage;
  }
  if (typeof parsed.data.usage_reset_at === 'string') {
    tierInfo.resetsAt = parsed.data.usage_reset_at;
  }
  if (typeof parsed.data.has_usage_remaining === 'boolean') {
    tierInfo.hasUsageRemaining = parsed.data.has_usage_remaining;
  }
  const usageBuckets = readUsageBuckets(parsed.data);
  if (usageBuckets.length > 0) {
    tierInfo.usageBuckets = usageBuckets;
  }
  if (typeof parsed.data.credit_balance_cents === 'number') {
    tierInfo.creditBalanceCents = parsed.data.credit_balance_cents;
    tierInfo.overageEnabled = parsed.data.overage_enabled === true;
  }
  return tierInfo;
}

export async function fetchAccountIdentity(
  secrets: vscode.SecretStorage,
): Promise<AccountIdentity | undefined> {
  const accountToken = await getAccountToken(secrets);
  if (accountToken === undefined || accountToken === '') return undefined;

  const parsed = new URL('/api/me?surface=vscode', getCloudWebOrigin());
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port !== '' ? parseInt(parsed.port, 10) : isHttps ? 443 : 80,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accountToken}`,
        'User-Agent': getExtensionUserAgent(),
        'X-Client': 'vscode-extension',
        'X-AGI-Surface': 'vscode',
      },
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          if (res.statusCode === 401) void invalidateAccountToken(secrets, accountToken);
          resolve(undefined);
          return;
        }
        try {
          resolve(parseAccountIdentityResponse(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
        } catch {
          resolve(undefined);
        }
      });
      res.on('error', () => resolve(undefined));
    });

    req.on('error', () => resolve(undefined));
    req.setTimeout(5_000, () => {
      req.destroy();
      resolve(undefined);
    });
    req.end();
  });
}

export async function fetchTierInfo(secrets: vscode.SecretStorage): Promise<TierInfo | undefined> {
  const credential = await getCloudCredential(secrets);
  if (credential.kind === 'none') {
    return undefined;
  }

  const endpoint = getCloudApiEndpoint();
  const rootOrigin = endpoint.replace(/\/api\/llm\/v1$/, '').replace(/\/api\/llm$/, '');
  const url = `${rootOrigin}/api/usage`;

  return new Promise((resolve) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port !== '' ? parseInt(parsed.port, 10) : isHttps ? 443 : 80,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${credential.token}`,
        'User-Agent': getExtensionUserAgent(),
        'X-Client': 'vscode-extension',
        'X-AGI-Surface': 'vscode',
      },
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          if (res.statusCode === 401 && credential.kind === 'account') {
            void invalidateAccountToken(secrets, credential.token);
          }
          resolve(undefined);
          return;
        }
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const raw = JSON.parse(body);
          const tierInfo = parseTierInfoResponse(raw);
          if (tierInfo === undefined) {
            resolve(undefined);
            return;
          }
          resolve(tierInfo);
        } catch {
          resolve(undefined);
        }
      });
      res.on('error', () => resolve(undefined));
    });

    req.on('error', () => resolve(undefined));
    req.setTimeout(5_000, () => {
      req.destroy();
      resolve(undefined);
    });
    req.end();
  });
}
