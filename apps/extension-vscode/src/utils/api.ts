import {
  ServerSentEventDecoder,
  ServerSentEventFrameLimitError,
  splitJoinedServerSentEventData,
  SSE_DONE_DATA,
  type ServerSentEvent,
} from '@agiworkforce/client-runtime';
import * as vscode from 'vscode';
import * as http from 'http';
import { randomUUID } from 'crypto';
import * as https from 'https';
import { URL } from 'url';
import { getModelMetrics } from '../features/model-picker/modelMetrics';
import { cloudUtilityModel, LocalModelSelectedError } from '../core/cloudModelBoundary';
import {
  TierInfoSchema,
  TurnSettlementSchema,
  UsageHistorySchema,
  type TierInfoResponse,
  type UsageHistory,
} from '../protocol/apiResponses';
import { notifyAccountTierMayHaveChanged } from '../integrations/tierRevalidation';
import { planDisplayLabel } from '../features/account-auth/planLabel';
import {
  classifyManagedQuotaErrorCode,
  effectivePlanTier,
  isTeamPlanTier,
  normalizeUsagePercentage,
  type AccountAuthState,
  type ManagedQuotaBlockPresentation,
  type ManagedUsageBucket,
  type ManagedUsageBucketReading,
  type ManagedUsageCreditWindow,
  type ManagedUsageCredits,
  ErrorCode,
  PRODUCT_BRAND,
  PRODUCT_NAMES,
} from '@agiworkforce/types';
import { MeResponseSchema } from '@agiworkforce/cloud-contracts/me';
import {
  MINIMUM_API_VERSION_RESPONSE_HEADER,
  type EffectiveCapabilityDocumentWire,
} from '@agiworkforce/cloud-contracts';
import { Config, __CONFIG_DEFAULTS, type ExtensionAgentEffort } from '../platform/config';
import { platformRequestHeaders } from '../platform/platformHeaders';
import { t } from '../l10n';
import { accountRefusalKind, boundedRefusalText, parseRetryAfterMs } from './accountRefusal';

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CloudUtilityChatCompletionRequest {
  model: string;
  messages: LlmChatMessage[];
  stream: true;
  thinking_mode: boolean;
  effort: ExtensionAgentEffort;
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
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AgiWorkforceApiError';
  }
}

/**
 * The deployment no longer answers the API contract this build speaks. The
 * message is delivered rather than replaced, because a client that is told
 * nothing retries forever.
 */
export class AgiWorkforceClientUpdateRequiredError extends Error {
  public readonly kind = 'client-update-required' as const;

  constructor(
    public readonly serverMessage: string,
    public readonly minimumApiVersion: string | undefined,
  ) {
    super(serverMessage);
    this.name = 'AgiWorkforceClientUpdateRequiredError';
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
    super(
      `Upgrade to ${planDisplayLabel(requiredTier) ?? requiredTier} required for ${feature}: ${reason}`,
    );
    this.name = 'AgiWorkforcePaywallError';
    this.recoveryAction = code === 'subscription_inactive' ? 'manage_billing' : 'upgrade';
  }
}

export type ManagedQuotaRecoveryAction = 'top_up' | 'upgrade' | 'view_usage' | 'contact_support';

export interface ManagedQuotaRecovery {
  action: ManagedQuotaRecoveryAction;
  href: string;
}

const QUOTA_RECOVERY_ACTIONS: ReadonlySet<string> = new Set<ManagedQuotaRecoveryAction>([
  'top_up',
  'upgrade',
  'view_usage',
  'contact_support',
]);

function readQuotaRecovery(value: unknown): ManagedQuotaRecovery | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const action = record['action'];
  const href = record['href'];
  if (typeof action !== 'string' || !QUOTA_RECOVERY_ACTIONS.has(action)) return undefined;
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return undefined;
  return { action: action as ManagedQuotaRecoveryAction, href };
}

export class AgiWorkforceUsageLimitError extends AgiWorkforceApiError {
  public readonly kind = 'usage-limit' as const;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    public readonly block: ManagedQuotaBlockPresentation,
    public readonly recovery: ManagedQuotaRecovery | undefined,
  ) {
    super(message, statusCode, code);
    this.name = 'AgiWorkforceUsageLimitError';
  }
}

const MAX_RETRY_AFTER_MS = 30_000;

function cancelledRequestError(): AgiWorkforceApiError {
  return new AgiWorkforceApiError('Request was cancelled', undefined, 'CANCELLED');
}

function waitUnlessCancelled(
  waitMs: number,
  cancellation: vscode.CancellationToken,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (cancellation.isCancellationRequested) {
      reject(cancelledRequestError());
      return;
    }
    const timer = setTimeout(() => {
      listener.dispose();
      resolve();
    }, waitMs);
    const listener = cancellation.onCancellationRequested(() => {
      clearTimeout(timer);
      listener.dispose();
      reject(cancelledRequestError());
    });
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  canRetry: () => boolean,
  cancellation: vscode.CancellationToken,
  retries = 2,
  delayMs = 1000,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      retries <= 0 ||
      !canRetry() ||
      err instanceof AgiWorkforcePaywallError ||
      err instanceof AgiWorkforceClientUpdateRequiredError ||
      (err instanceof AgiWorkforceApiError &&
        (err.code === 'CANCELLED' || (err.statusCode !== undefined && err.statusCode < 500)))
    ) {
      throw err;
    }
    const stated = err instanceof AgiWorkforceApiError ? err.retryAfterMs : undefined;
    const waitMs = Math.max(delayMs, Math.min(stated ?? 0, MAX_RETRY_AFTER_MS));
    await waitUnlessCancelled(waitMs, cancellation);
    if (cancellation.isCancellationRequested) throw cancelledRequestError();
    return withRetry(fn, canRetry, cancellation, retries - 1, delayMs * 2);
  }
}

const SECRET_KEY = 'agiWorkforce.apiKey';
const ACCOUNT_TOKEN_KEY = 'agiWorkforce.accountToken';
const ACCOUNT_TOKEN_EXPIRES_AT_KEY = 'agiWorkforce.accountTokenExpiresAt';
const ACCOUNT_TOKEN_EXPIRED_KEY = 'agiWorkforce.accountTokenExpired';
const ACCOUNT_REFRESH_TOKEN_KEY = 'agiWorkforce.accountRefreshToken';
const DEFAULT_ENDPOINT = __CONFIG_DEFAULTS.apiEndpoint;

export async function getApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(SECRET_KEY);
}

export async function setApiKey(secrets: vscode.SecretStorage, apiKey: string): Promise<void> {
  await secrets.store(SECRET_KEY, apiKey);
}

export async function clearApiKey(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(SECRET_KEY);
}

export interface SharedAccountCredential {
  token: string;
  expiresAtMs?: number;
}

/**
 * The AGI CLI on this machine holds the account session that chat runs on. When
 * the editor has no session of its own, it borrows that one, so a single sign-in
 * in the terminal or in VS Code covers both, as one login cache does for Claude
 * Code and Codex. A refusal is remembered briefly so a signed-out editor does not
 * ask the CLI on every request.
 */
type SharedAccountCredentialSource = () => Promise<SharedAccountCredential | undefined>;

const SHARED_CREDENTIAL_REFUSAL_TTL_MS = 30_000;
let sharedAccountCredentialSource: SharedAccountCredentialSource | undefined;
let sharedCredentialRefusedAt: number | undefined;
let rejectedAccountToken: string | undefined;

export function shareAccountCredentialFrom(
  source: SharedAccountCredentialSource | undefined,
): void {
  sharedAccountCredentialSource = source;
  sharedCredentialRefusedAt = undefined;
}

export function forgetSharedCredentialRefusal(): void {
  sharedCredentialRefusedAt = undefined;
}

async function adoptSharedAccountCredential(
  secrets: vscode.SecretStorage,
): Promise<string | undefined> {
  if (sharedAccountCredentialSource === undefined) return undefined;
  if (
    sharedCredentialRefusedAt !== undefined &&
    Date.now() - sharedCredentialRefusedAt < SHARED_CREDENTIAL_REFUSAL_TTL_MS
  ) {
    return undefined;
  }
  const credential = await sharedAccountCredentialSource().catch(() => undefined);
  if (
    credential === undefined ||
    credential.token === rejectedAccountToken ||
    (credential.expiresAtMs !== undefined && credential.expiresAtMs <= Date.now())
  ) {
    sharedCredentialRefusedAt = Date.now();
    return undefined;
  }
  sharedCredentialRefusedAt = undefined;
  await setAccountToken(secrets, credential.token, credential.expiresAtMs);
  notifyAccountTierMayHaveChanged();
  return credential.token;
}

export async function getAccountToken(
  secrets: vscode.SecretStorage,
  options: { renew?: boolean } = {},
): Promise<string | undefined> {
  let state = await getAccountAuthState(secrets);
  if (state.status === 'expired' && options.renew !== false) {
    const renewal = await renewAccountSession(secrets);
    if (renewal === 'renewed' || renewal === 'superseded') {
      state = await getAccountAuthState(secrets);
    }
  }
  if (state.status === 'signed-in') return secrets.get(ACCOUNT_TOKEN_KEY);
  if (options.renew === false) return undefined;
  return adoptSharedAccountCredential(secrets);
}

interface AccountSessionCustody {
  generation: number;
  renewal: { generation: number; promise: Promise<AccountSessionRenewal> } | undefined;
  writes: Promise<void>;
}

const accountSessionCustody = new WeakMap<vscode.SecretStorage, AccountSessionCustody>();

function custodyOf(secrets: vscode.SecretStorage): AccountSessionCustody {
  let custody = accountSessionCustody.get(secrets);
  if (custody === undefined) {
    custody = { generation: 0, renewal: undefined, writes: Promise.resolve() };
    accountSessionCustody.set(secrets, custody);
  }
  return custody;
}

function runExclusive<T>(secrets: vscode.SecretStorage, task: () => Promise<T>): Promise<T> {
  const custody = custodyOf(secrets);
  const run = custody.writes.then(task, task);
  custody.writes = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function storeAccountSession(
  secrets: vscode.SecretStorage,
  token: string,
  expiresAt?: number,
  refreshToken?: string,
): Promise<void> {
  await secrets.store(ACCOUNT_TOKEN_KEY, token);
  await secrets.delete(ACCOUNT_TOKEN_EXPIRED_KEY);
  if (expiresAt !== undefined) {
    await secrets.store(ACCOUNT_TOKEN_EXPIRES_AT_KEY, String(expiresAt));
  } else {
    await secrets.delete(ACCOUNT_TOKEN_EXPIRES_AT_KEY);
  }
  // Always rewritten: a sign-in that returned no renewal credential must not
  // inherit the previous device session's, which belongs to another grant.
  if (refreshToken !== undefined && refreshToken !== '') {
    await secrets.store(ACCOUNT_REFRESH_TOKEN_KEY, refreshToken);
  } else {
    await secrets.delete(ACCOUNT_REFRESH_TOKEN_KEY);
  }
}

async function wipeAccountSession(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(ACCOUNT_TOKEN_KEY);
  await secrets.delete(ACCOUNT_TOKEN_EXPIRES_AT_KEY);
  await secrets.delete(ACCOUNT_TOKEN_EXPIRED_KEY);
  await secrets.delete(ACCOUNT_REFRESH_TOKEN_KEY);
}

export async function setAccountToken(
  secrets: vscode.SecretStorage,
  token: string,
  expiresAt?: number,
  refreshToken?: string,
): Promise<void> {
  heldAccountUnavailable = undefined;
  custodyOf(secrets).generation += 1;
  await runExclusive(secrets, () => storeAccountSession(secrets, token, expiresAt, refreshToken));
}

export async function getAccountRefreshToken(
  secrets: vscode.SecretStorage,
): Promise<string | undefined> {
  const stored = await secrets.get(ACCOUNT_REFRESH_TOKEN_KEY);
  return stored === undefined || stored === '' ? undefined : stored;
}

export async function clearAccountToken(secrets: vscode.SecretStorage): Promise<void> {
  heldAccountUnavailable = undefined;
  custodyOf(secrets).generation += 1;
  await runExclusive(secrets, () => wipeAccountSession(secrets));
}

/**
 * The renewal credential survives here on purpose: an access token that expired
 * or was rejected is exactly when the rotation below should run, silently.
 */
async function invalidateAccountToken(
  secrets: vscode.SecretStorage,
  observedToken: string,
): Promise<void> {
  await runExclusive(secrets, async () => {
    const currentToken = await secrets.get(ACCOUNT_TOKEN_KEY);
    if (currentToken !== observedToken) return;
    rejectedAccountToken = observedToken;
    await secrets.delete(ACCOUNT_TOKEN_KEY);
    await secrets.delete(ACCOUNT_TOKEN_EXPIRES_AT_KEY);
    await secrets.store(ACCOUNT_TOKEN_EXPIRED_KEY, '1');
  });
}

export type AccountSessionRenewal =
  'renewed' | 'unavailable' | 'revoked' | 'terms-required' | 'account-unavailable' | 'superseded';

/**
 * An account the server refused stays refused until the person signs in or out
 * again: retrying the rotation on every request would only repeat the refusal
 * and the warning.
 */
let heldAccountUnavailable: string | undefined;

/**
 * Rotates the device session in place so an expired editor never has to repeat
 * the device-code flow. deviceAuth is loaded here rather than imported at the
 * top because it owns the device endpoints and already imports this module.
 */
export function renewAccountSession(
  secrets: vscode.SecretStorage,
  rejectedToken?: string,
): Promise<AccountSessionRenewal> {
  const custody = custodyOf(secrets);
  const pending = custody.renewal;
  if (pending !== undefined && pending.generation === custody.generation) return pending.promise;

  const generation = custody.generation;
  const promise: Promise<AccountSessionRenewal> = rotateAccountSession(
    secrets,
    generation,
    rejectedToken,
  ).finally(() => {
    if (custody.renewal?.promise === promise) custody.renewal = undefined;
  });
  custody.renewal = { generation, promise };
  return promise;
}

async function rotateAccountSession(
  secrets: vscode.SecretStorage,
  generation: number,
  rejectedToken?: string,
): Promise<AccountSessionRenewal> {
  if (heldAccountUnavailable !== undefined) return 'account-unavailable';
  const owns = (): boolean => custodyOf(secrets).generation === generation;

  const state = await getAccountAuthState(secrets);
  const observedToken = await secrets.get(ACCOUNT_TOKEN_KEY);
  const stillRejected =
    rejectedToken !== undefined && state.status === 'signed-in' && observedToken === rejectedToken;
  if (state.status !== 'expired' && !stillRejected) return 'superseded';
  const refreshToken = await getAccountRefreshToken(secrets);
  if (refreshToken === undefined) return 'unavailable';

  const { refreshDeviceSession } = await import('../features/account-auth/deviceAuth');
  if (!owns()) return 'superseded';
  if (
    (await secrets.get(ACCOUNT_TOKEN_KEY)) !== observedToken ||
    (await getAccountRefreshToken(secrets)) !== refreshToken
  ) {
    return 'superseded';
  }
  const result = await refreshDeviceSession(getCloudWebOrigin(), refreshToken);

  if (result.kind === 'renewed') {
    const applied = await runExclusive(secrets, async () => {
      if (!owns()) return false;
      await storeAccountSession(secrets, result.token, result.expiresAt, result.refreshToken);
      heldAccountUnavailable = undefined;
      return true;
    });
    return applied ? 'renewed' : 'superseded';
  }
  if (result.kind === 'revoked') {
    const applied = await runExclusive(secrets, async () => {
      if (!owns() || (await getAccountRefreshToken(secrets)) !== refreshToken) return false;
      await wipeAccountSession(secrets);
      await secrets.store(ACCOUNT_TOKEN_EXPIRED_KEY, '1');
      return true;
    });
    if (!applied) return 'superseded';
    notifyAccountTierMayHaveChanged();
    return 'revoked';
  }
  if (result.kind === 'account-unavailable') {
    if (!owns()) return 'superseded';
    heldAccountUnavailable = result.message;
    void vscode.window.showWarningMessage(result.message, 'Sign in again').then((action) => {
      if (action === 'Sign in again') {
        void vscode.commands.executeCommand('agi-workforce.signIn');
      }
    });
    return 'account-unavailable';
  }
  if (!owns()) return 'superseded';
  return result.kind === 'terms-required' ? 'terms-required' : 'unavailable';
}

export type RejectedAccountTokenReview =
  | { kind: 'retry'; token: string }
  | { kind: 'rejected' }
  | { kind: 'unconfirmed' }
  | { kind: 'account-refused'; message: string };

const TERMS_ACCEPTANCE_REQUIRED_MESSAGE =
  'Accept the updated Terms of Service to keep using AGI Cloud. Sign in again to review them.';
const ACCOUNT_UNAVAILABLE_MESSAGE =
  'Your AGI Cloud account cannot be used right now. Sign in again to see why.';

/**
 * A single 401 from a data route does not prove the credential is gone. The
 * session is only dropped after the credential was renewed and the renewed one
 * was refused too, or when the renewal itself says the grant is revoked.
 */
export async function reviewRejectedAccountToken(
  secrets: vscode.SecretStorage,
  rejectedToken: string,
): Promise<RejectedAccountTokenReview> {
  if ((await getAccountRefreshToken(secrets)) === undefined) {
    return { kind: 'retry', token: rejectedToken };
  }
  const renewal = await renewAccountSession(secrets, rejectedToken);
  if (renewal === 'revoked') return { kind: 'rejected' };
  if (renewal === 'account-unavailable') {
    return {
      kind: 'account-refused',
      message: heldAccountUnavailable ?? ACCOUNT_UNAVAILABLE_MESSAGE,
    };
  }
  if (renewal === 'terms-required') {
    return { kind: 'account-refused', message: TERMS_ACCEPTANCE_REQUIRED_MESSAGE };
  }
  if (renewal === 'renewed' || renewal === 'superseded') {
    const current = await secrets.get(ACCOUNT_TOKEN_KEY);
    if (current === undefined || current === '') return { kind: 'rejected' };
    return current === rejectedToken ? { kind: 'unconfirmed' } : { kind: 'retry', token: current };
  }
  return { kind: 'unconfirmed' };
}

export async function confirmAccountTokenRejected(
  secrets: vscode.SecretStorage,
  token: string,
): Promise<void> {
  notifyAccountTierMayHaveChanged();
  await invalidateAccountToken(secrets, token);
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
  let accountState = await getAccountAuthState(secrets);
  if (accountState.status === 'expired') {
    const renewal = await renewAccountSession(secrets);
    if (renewal === 'renewed' || renewal === 'superseded') {
      accountState = await getAccountAuthState(secrets);
    }
  }
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
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]';

  if (!isHttps && !isLocalhost) {
    return undefined;
  }

  if (!isLocalhost && !ENDPOINT_ALLOWED_HOSTS.has(parsed.hostname)) {
    return undefined;
  }

  return raw.replace(/\/+$/, '');
}

function getCloudApiEndpoint(): string {
  return validateEndpointUrl(Config.apiEndpoint()) ?? DEFAULT_ENDPOINT;
}

export function getCloudWebOrigin(): string {
  try {
    return new URL(getCloudApiEndpoint()).origin;
  } catch {
    return new URL(DEFAULT_ENDPOINT).origin;
  }
}

function getModel(): string {
  const selected = cloudUtilityModel();
  if (selected.route === 'local') throw new LocalModelSelectedError(selected.model);
  return selected.model;
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

export const CLIENT_UPDATE_REQUIRED_STATUS = 426;
const CLIENT_UPDATE_REQUIRED_CODE = 'CLIENT_UPDATE_REQUIRED';

export function parseCloudCompletionError(
  statusCode: number,
  body: string,
  responseHeaders: Record<string, string | string[] | undefined> = {},
): Error {
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
    notifyAccountTierMayHaveChanged();
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
    (typeof nested?.['message'] === 'string' ? boundedRefusalText(nested['message']) : undefined) ??
    (typeof parsed?.['message'] === 'string' ? boundedRefusalText(parsed['message']) : undefined);
  const requiredTier =
    typeof nested?.['requiredTier'] === 'string'
      ? nested['requiredTier']
      : typeof nested?.['required_tier'] === 'string'
        ? nested['required_tier']
        : undefined;

  if (statusCode === CLIENT_UPDATE_REQUIRED_STATUS || code === CLIENT_UPDATE_REQUIRED_CODE) {
    const advertised = responseHeaders[MINIMUM_API_VERSION_RESPONSE_HEADER];
    return new AgiWorkforceClientUpdateRequiredError(
      message ??
        `This version of ${PRODUCT_NAMES.code} is older than ${PRODUCT_BRAND} now supports. Update the extension to continue.`,
      typeof advertised === 'string' ? advertised : advertised?.[0],
    );
  }

  const planGateCode = code?.toLowerCase();
  if (statusCode === 403 && planGateCode !== undefined && PLAN_GATE_CODES.has(planGateCode)) {
    notifyAccountTierMayHaveChanged();
    return new AgiWorkforcePaywallError(
      planGateCode.replace(/_(?:plan_)?required$/u, '') || 'managed_cloud',
      requiredTier ?? 'pro',
      message ??
        (planGateCode === 'subscription_inactive'
          ? 'Your AGI Cloud subscription needs billing attention.'
          : 'This AGI Cloud capability is unavailable on your current plan.'),
      planGateCode,
    );
  }

  if (statusCode === 401 || statusCode === 402) notifyAccountTierMayHaveChanged();

  const quotaBlock = classifyManagedQuotaErrorCode(code);
  if (code !== undefined && quotaBlock !== null && quotaBlock.kind !== 'rate_limit') {
    return new AgiWorkforceUsageLimitError(
      message ?? quotaBlock.reason,
      statusCode,
      code,
      quotaBlock,
      readQuotaRecovery(nested?.['recovery']),
    );
  }

  const retryAfter = responseHeaders['retry-after'];
  const retryAfterMs = parseRetryAfterMs(Array.isArray(retryAfter) ? retryAfter[0] : retryAfter);

  return new AgiWorkforceApiError(
    message ??
      (statusCode === 429
        ? 'Too many requests right now. Please wait a moment and try again.'
        : `AGI Cloud request failed (HTTP ${statusCode}).`),
    statusCode,
    code ?? (statusCode === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR'),
    retryAfterMs,
  );
}

function readStreamErrorFields(value: unknown): AgiWorkforceApiError | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as { message?: unknown; code?: unknown };
  const message =
    (typeof record.message === 'string' ? boundedRefusalText(record.message) : undefined) ??
    'AGI Cloud could not finish this response.';
  const code = typeof record.code === 'string' && record.code !== '' ? record.code : 'STREAM_ERROR';
  return new AgiWorkforceApiError(message, undefined, code);
}

function streamFailure(frame: unknown): AgiWorkforceApiError | undefined {
  if (typeof frame !== 'object' || frame === null) return undefined;
  const record = frame as {
    type?: unknown;
    error?: unknown;
    choices?: Array<{ delta?: { x_stream_error?: unknown }; finish_reason?: unknown }>;
  };
  const topLevel = readStreamErrorFields(record.type === 'error' ? record : record.error);
  if (topLevel !== undefined) return topLevel;
  const choice = Array.isArray(record.choices) ? record.choices[0] : undefined;
  const inBand = readStreamErrorFields(choice?.delta?.x_stream_error);
  if (inBand !== undefined) return inBand;
  return choice?.finish_reason === 'error'
    ? new AgiWorkforceApiError(
        'AGI Cloud could not finish this response.',
        undefined,
        'STREAM_ERROR',
      )
    : undefined;
}

function httpsPostStream(
  urlString: string,
  headers: Record<string, string>,
  body: string,
  onChunk: (chunk: ChatCompletionChunk) => void,
  token: vscode.CancellationToken,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (token.isCancellationRequested) {
      reject(cancelledRequestError());
      return;
    }
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
          reject(parseCloudCompletionError(res.statusCode ?? 500, errBody, res.headers));
        });
        return;
      }

      const text = new TextDecoder();
      const frames = new ServerSentEventDecoder();
      let finished = false;
      let failure: AgiWorkforceApiError | undefined;
      const deliver = (events: readonly ServerSentEvent[]) => {
        for (const event of events) {
          for (const data of splitJoinedServerSentEventData(event.data)) {
            if (failure !== undefined) return;
            if (data === SSE_DONE_DATA) {
              finished = true;
              continue;
            }
            let frame: unknown;
            try {
              frame = JSON.parse(data);
            } catch {
              continue;
            }
            failure = streamFailure(frame);
            if (failure !== undefined) {
              cancelListener.dispose();
              req.destroy();
              reject(failure);
              return;
            }
            const chunk = frame as ChatCompletionChunk;
            if (typeof chunk.choices?.[0]?.finish_reason === 'string') finished = true;
            onChunk(chunk);
          }
        }
      };

      res.on('data', (chunk: Buffer) => {
        try {
          deliver(frames.push(text.decode(chunk, { stream: true })));
        } catch (error) {
          if (!(error instanceof ServerSentEventFrameLimitError)) throw error;
          cancelListener.dispose();
          req.destroy();
          reject(
            new AgiWorkforceApiError('SSE buffer overflow (malformed stream)', 400, 'HTTP_ERROR'),
          );
        }
      });

      res.on('end', () => {
        cancelListener.dispose();
        deliver(frames.push(text.decode()));
        deliver(frames.finish({ acceptUnterminatedFrame: true }).events);
        if (failure !== undefined) return;
        if (!finished) {
          reject(
            new AgiWorkforceApiError(
              'The AGI Cloud response stopped before it finished, so this result is incomplete and was not used. Try again.',
              undefined,
              'STREAM_INCOMPLETE',
            ),
          );
          return;
        }
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
      reject(cancelledRequestError());
    });

    req.write(body);
    req.end();
  });
}

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
}

export type ManagedRequestBilling = 'settle-now' | 'deferred';
export type CloudRequestAttempts = 'retry-server-failures' | 'single';

export interface ManagedRequestCompletion {
  requestId: string;
  billing: ManagedRequestBilling;
}

const managedRequestCompleted = new vscode.EventEmitter<ManagedRequestCompletion>();

export const onDidCompleteManagedRequest = managedRequestCompleted.event;

export async function streamChatCompletion(
  secrets: vscode.SecretStorage,
  messages: LlmChatMessage[],
  callbacks: StreamCallbacks,
  cancellationToken: vscode.CancellationToken,
  overrideModel?: string,
  billing: ManagedRequestBilling = 'settle-now',
  attempts: CloudRequestAttempts = 'retry-server-failures',
): Promise<void> {
  const requestBody = buildCloudUtilityChatCompletionRequest(messages, overrideModel);
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
  const model = requestBody.model;

  const bodyStr = JSON.stringify(requestBody);

  const idempotencyKey = `agi.vscode.chat.${randomUUID()}`;

  const headersFor = (bearer: string): Record<string, string> => ({
    Authorization: `Bearer ${bearer}`,
    ...platformRequestHeaders(),
    'Idempotency-Key': idempotencyKey,
  });

  const requestStartTime = Date.now();

  if (cancellationToken.isCancellationRequested) throw cancelledRequestError();
  let tokenDelivered = false;
  const send = (bearer: string): Promise<void> =>
    withRetry(
      () =>
        httpsPostStream(
          `${endpoint}/chat/completions`,
          headersFor(bearer),
          bodyStr,
          (chunk) => {
            const content = chunk.choices[0]?.delta?.content;
            if (content !== undefined && content !== '') {
              tokenDelivered = true;
              callbacks.onToken(content);
            }
          },
          cancellationToken,
        ),
      () => !tokenDelivered && !cancellationToken.isCancellationRequested,
      cancellationToken,
      attempts === 'single' ? 0 : undefined,
    );
  const isUnauthorized = (error: unknown): boolean =>
    error instanceof AgiWorkforceApiError && error.statusCode === 401;
  try {
    try {
      await send(credential.token);
    } catch (error) {
      if (!isUnauthorized(error) || credential.kind !== 'account') throw error;
      notifyAccountTierMayHaveChanged();
      const review = await reviewRejectedAccountToken(secrets, credential.token);
      if (review.kind === 'account-refused') {
        throw new AgiWorkforceApiError(review.message, 403, 'ACCOUNT_AUTH_REQUIRED');
      }
      if (review.kind === 'unconfirmed') {
        throw new AgiWorkforceApiError(
          t('chatError.couldNotReach', { provider: PRODUCT_BRAND }),
          503,
          'SESSION_CHECK_UNAVAILABLE',
        );
      }
      if (review.kind === 'rejected') throw error;
      try {
        await send(review.token);
      } catch (retryError) {
        if (isUnauthorized(retryError)) await confirmAccountTokenRejected(secrets, review.token);
        throw retryError;
      }
    }
  } catch (error) {
    if (isUnauthorized(error)) {
      notifyAccountTierMayHaveChanged();
      if (credential.kind === 'account') {
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
    managedRequestCompleted.fire({ requestId: idempotencyKey, billing });
  }
}

const TURN_SETTLEMENT_POLL_DELAYS_MS = [0, 500, 1_000, 2_000] as const;

export async function fetchBilledCredits(
  secrets: vscode.SecretStorage,
  requestId: string,
): Promise<number | null> {
  for (const delayMs of TURN_SETTLEMENT_POLL_DELAYS_MS) {
    if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    const response = await getAccountJson(
      secrets,
      `/api/usage/turns/${encodeURIComponent(requestId)}`,
    );
    if (response?.kind !== 'ok') return null;
    const parsed = TurnSettlementSchema.safeParse(response.body);
    if (!parsed.success) return null;
    if (parsed.data.status === 'settled') return parsed.data.credits ?? 0;
  }
  return null;
}

export async function chatCompletion(
  secrets: vscode.SecretStorage,
  messages: LlmChatMessage[],
  cancellationToken: vscode.CancellationToken,
  overrideModel?: string,
  billing: ManagedRequestBilling = 'settle-now',
  attempts: CloudRequestAttempts = 'retry-server-failures',
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
      billing,
      attempts,
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
  credits?: ManagedUsageCredits;
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
  capabilityDocument?: EffectiveCapabilityDocumentWire;
}

export function accountIdentityForDisplay(identity: AccountIdentity): AccountIdentity {
  const { capabilityDocument: _capabilityDocument, ...shown } = identity;
  return shown;
}

function unixSecondsToIso(value: number | null): string | undefined {
  if (value === null || !Number.isFinite(value)) return undefined;
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function accountTypeForTier(tier: string): AccountIdentity['accountType'] {
  return isTeamPlanTier(tier) || tier === 'enterprise'
    ? 'Organization account'
    : 'Personal account';
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
  const planName = parsed.data.plan.display_name.trim() || planDisplayLabel(tier) || 'Unknown';

  const currentPeriodEnd = unixSecondsToIso(parsed.data.plan.current_period_end);
  return {
    displayName,
    email,
    accountType: accountTypeForTier(tier),
    planName,
    tier,
    subscriptionStatus: parsed.data.plan.status,
    ...(currentPeriodEnd === undefined ? {} : { currentPeriodEnd }),
    cancelAtPeriodEnd: parsed.data.plan.cancel_at_period_end === true,
    subscriptionSource: parsed.data.plan.subscription_source ?? 'none',
    ...(parsed.data.capability_handshake === undefined
      ? {}
      : { capabilityDocument: parsed.data.capability_handshake }),
  };
}

function readUsageBuckets(summary: TierInfoResponse): ManagedUsageBucketReading[] {
  const credits = summary.credits;
  const windows: ReadonlyArray<{
    bucket: ManagedUsageBucket;
    usedPercentage: number | undefined;
    resetAt: string | null | undefined;
    creditWindow: ManagedUsageCreditWindow | null | undefined;
  }> = [
    {
      bucket: 'session',
      usedPercentage: summary.session_usage_percentage,
      resetAt: summary.session_reset_at,
      creditWindow: credits?.five_hour,
    },
    {
      bucket: 'weekly',
      usedPercentage: summary.weekly_usage_percentage,
      resetAt: summary.weekly_reset_at,
      creditWindow: credits?.weekly,
    },
    {
      bucket: 'weeklyFlagship',
      usedPercentage: summary.flagship_weekly_usage_percentage,
      resetAt: summary.flagship_weekly_reset_at,
      creditWindow: credits === undefined ? undefined : credits.flagship_weekly,
    },
    {
      bucket: 'period',
      usedPercentage: summary.usage_percentage,
      resetAt: summary.usage_reset_at,
      creditWindow: credits?.monthly,
    },
  ];

  return windows
    .filter(
      (window) =>
        typeof window.usedPercentage === 'number' &&
        !(credits !== undefined && !window.creditWindow),
    )
    .map((window) => ({
      bucket: window.bucket,
      percentRemaining: 100 - normalizeUsagePercentage(window.usedPercentage),
      resetAt: window.resetAt ?? null,
      ...(window.creditWindow && window.creditWindow.allowance > 0
        ? {
            allowanceCredits: window.creditWindow.allowance,
            usedCredits: window.creditWindow.used,
          }
        : {}),
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
  if (parsed.data.credits !== undefined) {
    tierInfo.credits = parsed.data.credits;
  }
  return tierInfo;
}

export async function fetchAccountIdentity(
  secrets: vscode.SecretStorage,
): Promise<AccountIdentity | undefined> {
  const accountToken = await getAccountToken(secrets);
  if (accountToken === undefined || accountToken === '') return undefined;

  const url = new URL('/api/me?surface=vscode', getCloudWebOrigin()).toString();
  const response = await sendAccountRequest(
    secrets,
    { kind: 'account', token: accountToken },
    (bearer) => getCloudJson(url, bearer),
  );
  return response.kind === 'ok' ? parseAccountIdentityResponse(response.body) : undefined;
}

type CloudJsonResponse =
  | { kind: 'ok'; body: unknown }
  | { kind: 'http-error'; status: number; message?: string; code?: string; retryAfterMs?: number }
  | { kind: 'unreadable' }
  | { kind: 'unreachable' };

function readHttpErrorBody(
  status: number,
  headers: http.IncomingHttpHeaders,
  raw: string,
): CloudJsonResponse {
  let error: { code?: unknown; message?: unknown } | undefined;
  try {
    const parsed = JSON.parse(raw) as { error?: unknown } | null;
    if (parsed?.error !== null && typeof parsed?.error === 'object') {
      error = parsed.error as { code?: unknown; message?: unknown };
    }
  } catch {
    error = undefined;
  }
  const message =
    typeof error?.message === 'string' ? boundedRefusalText(error.message) : undefined;
  const code = typeof error?.code === 'string' ? error.code : undefined;
  const retryAfter = headers['retry-after'];
  const retryAfterMs = parseRetryAfterMs(Array.isArray(retryAfter) ? retryAfter[0] : retryAfter);
  return {
    kind: 'http-error',
    status,
    ...(message === undefined ? {} : { message }),
    ...(code === undefined ? {} : { code }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
}

function isUnauthorizedResponse(response: CloudJsonResponse): boolean {
  return response.kind === 'http-error' && response.status === 401;
}

async function sendAccountRequest(
  secrets: vscode.SecretStorage,
  credential: { kind: 'account' | 'api-key'; token: string },
  send: (token: string) => Promise<CloudJsonResponse>,
): Promise<CloudJsonResponse> {
  const first = await send(credential.token);
  if (!isUnauthorizedResponse(first)) return first;
  notifyAccountTierMayHaveChanged();
  if (credential.kind !== 'account') return first;

  const review = await reviewRejectedAccountToken(secrets, credential.token);
  if (review.kind === 'unconfirmed') return { kind: 'unreachable' };
  if (review.kind === 'account-refused') {
    return {
      kind: 'http-error',
      status: 403,
      code: ErrorCode.ACCOUNT_UNAVAILABLE,
      message: review.message,
    };
  }
  if (review.kind === 'rejected') return first;

  const second = await send(review.token);
  if (isUnauthorizedResponse(second)) await confirmAccountTokenRejected(secrets, review.token);
  return second;
}

function getCloudJson(url: string, token: string): Promise<CloudJsonResponse> {
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
        Authorization: `Bearer ${token}`,
        ...platformRequestHeaders(),
      },
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        if (status >= 400) {
          resolve(readHttpErrorBody(status, res.headers, Buffer.concat(chunks).toString('utf8')));
          return;
        }
        try {
          resolve({ kind: 'ok', body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch {
          resolve({ kind: 'unreadable' });
        }
      });
      res.on('error', () => resolve({ kind: 'unreachable' }));
    });

    req.on('error', () => resolve({ kind: 'unreachable' }));
    req.setTimeout(5_000, () => {
      req.destroy();
      resolve({ kind: 'unreachable' });
    });
    req.end();
  });
}

function cloudAccountApiUrl(path: string): string {
  const rootOrigin = getCloudApiEndpoint()
    .replace(/\/api\/llm\/v1$/, '')
    .replace(/\/api\/llm$/, '');
  return `${rootOrigin}${path}`;
}

async function getAccountJson(
  secrets: vscode.SecretStorage,
  path: string,
): Promise<CloudJsonResponse | undefined> {
  const credential = await getCloudCredential(secrets);
  if (credential.kind === 'none') return undefined;
  const url = cloudAccountApiUrl(path);
  return sendAccountRequest(secrets, credential, (bearer) => getCloudJson(url, bearer));
}

export async function fetchTierInfo(secrets: vscode.SecretStorage): Promise<TierInfo | undefined> {
  const response = await getAccountJson(secrets, '/api/usage');
  return response?.kind === 'ok' ? parseTierInfoResponse(response.body) : undefined;
}

export type UsageHistoryResult =
  { kind: 'ready'; history: UsageHistory } | { kind: 'unavailable'; reason: string };

export async function fetchUsageHistory(
  secrets: vscode.SecretStorage,
): Promise<UsageHistoryResult> {
  const response = await getAccountJson(secrets, '/api/usage/history');
  if (response === undefined) {
    return { kind: 'unavailable', reason: 'Sign in to AGI Cloud to see your usage history.' };
  }
  if (response.kind === 'ok') {
    const parsed = UsageHistorySchema.safeParse(response.body);
    return parsed.success
      ? { kind: 'ready', history: parsed.data }
      : {
          kind: 'unavailable',
          reason: 'AGI Cloud returned usage history this editor cannot read.',
        };
  }
  if (response.kind === 'http-error') {
    const serverText =
      response.message !== undefined &&
      (response.status === 503 || accountRefusalKind(response.code) !== undefined)
        ? response.message
        : undefined;
    return {
      kind: 'unavailable',
      reason:
        serverText ??
        (response.status === 401
          ? 'Your AGI Cloud session expired. Sign in again to see usage history.'
          : `Usage history is unavailable right now (HTTP ${response.status}).`),
    };
  }
  return { kind: 'unavailable', reason: 'AGI Cloud could not be reached for usage history.' };
}
