import {
  ServerSentEventDecoder,
  ServerSentEventFrameLimitError,
  splitJoinedServerSentEventData,
  type ServerSentEvent,
} from '@agiworkforce/client-runtime';
import {
  createManagedCloudAgentRunClient,
  MAX_CHAT_ATTACHMENT_BYTES,
  parseAgentEventDelta,
  parseGeneratedFilesDelta,
  parseInteractiveCardDelta,
  readManagedCloudAgentRunHandle,
  reconcileManagedCloudPublicText,
  TOOL_APPROVAL_RESUME_PATH,
  TOOL_INPUT_RESUME_PATH,
  ToolApprovalResumeErrorResponseSchema,
  ToolApprovalResumeRequestSchema,
  ToolInputResumeRequestSchema,
  type ManagedCloudAgentRunReference,
  type GeneratedFileWire,
  type ToolApprovalDecisionWire,
  type ToolApprovalResumeRequest,
  type ToolInputResponseWire,
  type ToolInputResumeRequest,
} from '@agiworkforce/cloud-contracts';
import {
  classifyManagedQuotaErrorCode,
  effectivePlanTier,
  getDefaultModelFor,
  INTERACTIVE_CARD_REQUEST_KEY,
  MAX_ATTACHMENT_BYTES,
  normalizeBillingPlanTier,
  parseManagedUsageSummaryResponse,
  WEB_SEARCH_CITATION_DELTA_KEY,
  type AgentEventSource,
  type Effort,
  type InteractiveCard,
  type ManagedQuotaBlockPresentation,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  getFreshClerkAuthContext,
  getFreshClerkToken,
  revokeSyncedWebSession,
  signOutClerk,
} from './clerkAuth';
import { clearAutofillProfile } from '../content/autofill/profile-storage';
import type { ManagedCloudOwner } from './managedCloudAuthority';
import { configuredAgiWebOrigin, DEFAULT_AGI_WEB_ORIGIN } from '../../lib/webOrigin';
import { platformRequestHeaders } from '../../platformHeaders';
import { logger } from '../../utils';
import type { MemoryCommandKind, MemoryCommandStatus } from './memoryClient';

// The plan default the server derives, so the extension never names a model free cannot reach.
export const FREE_TRIAL_MODEL: string = getDefaultModelFor(normalizeBillingPlanTier(null), 'chat');

/**
 * Character cap on the Chrome request envelope to bound renderer and transport
 * memory. This is a surface safety bound, not a free-plan usage counter.
 */
export const MANAGED_CHAT_MAX_INPUT_CHARS = 32_000;

export const MANAGED_CHAT_MAX_MESSAGES = 100;
export const MANAGED_CHAT_MAX_ATTACHMENTS = 5;
export const MANAGED_CHAT_MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_BYTES;
export const MANAGED_CHAT_MAX_ATTACHMENT_FILE_BYTES = MAX_CHAT_ATTACHMENT_BYTES;
export const MANAGED_CHAT_DEFAULT_TIMEOUT_MS = 90_000;
export const MANAGED_CHAT_MAX_SSE_FRAME_CHARS = 1_048_576;
export const MANAGED_CHAT_MAX_STREAMED_TEXT_CHARS = 4_194_304;
const MANAGED_CHAT_MAX_ERROR_BODY_CHARS = 65_536;

export const FREE_TRIAL_GATEWAY: string = configuredAgiWebOrigin() ?? DEFAULT_AGI_WEB_ORIGIN;
export const FREE_TRIAL_ENDPOINT = `${FREE_TRIAL_GATEWAY}/api/llm/v1/chat/completions`;
export const MANAGED_APPROVAL_ENDPOINT = `${FREE_TRIAL_GATEWAY}${TOOL_APPROVAL_RESUME_PATH}`;
export const MANAGED_INPUT_RESUME_ENDPOINT = `${FREE_TRIAL_GATEWAY}${TOOL_INPUT_RESUME_PATH}`;
export const MANAGED_MODELS_ENDPOINT = `${FREE_TRIAL_GATEWAY}/api/llm/v1/models`;
export const MANAGED_USAGE_ENDPOINT = `${FREE_TRIAL_GATEWAY}/api/usage`;
export const MANAGED_USAGE_HISTORY_ENDPOINT = `${FREE_TRIAL_GATEWAY}/api/usage/history`;

const SESSION_TOKEN_KEY = 'agi_clerk_session_token';
const DEV_TOKEN_KEY = 'agi_dev_bearer_token';

export interface ManagedModelAccess {
  subscriptionTier: string;
  accountPlanTier?: string;
  subscriptionStatus?: string;
  usage: ManagedUsageSummaryResponse;
  modelIds: string[];
  allowedAutoModes: string[];
}

export type ManagedQuotaRecoveryAction = 'top_up' | 'upgrade' | 'view_usage' | 'contact_support';

export interface ManagedQuotaRecovery {
  action: ManagedQuotaRecoveryAction;
  href: string;
}

export interface ManagedQuotaBlock {
  code: string;
  recovery?: ManagedQuotaRecovery;
}

export type ManagedQuotaWarningScope = 'billing_period' | 'rolling_five_hour' | 'rolling_weekly';

export interface ManagedQuotaWarningSignal {
  scope: ManagedQuotaWarningScope;
  usedPercent: number;
}

const QUOTA_WARNING_SCOPES: ReadonlySet<string> = new Set<ManagedQuotaWarningScope>([
  'billing_period',
  'rolling_five_hour',
  'rolling_weekly',
]);

export function parseQuotaWarningHeader(value: string | null): ManagedQuotaWarningSignal | null {
  if (!value) return null;
  const fields = new Map<string, string>();
  for (const part of value.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0) {
      fields.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
    }
  }
  const scope = fields.get('scope');
  const usedPercent = Number(fields.get('used_percent'));
  if (!scope || !QUOTA_WARNING_SCOPES.has(scope) || !Number.isFinite(usedPercent)) return null;
  return {
    scope: scope as ManagedQuotaWarningScope,
    usedPercent: Math.min(100, Math.max(0, usedPercent)),
  };
}

export interface ManagedCloudAuthContext {
  token: string;
  owner: ManagedCloudOwner;
}

const MAX_MANAGED_MODEL_IDS = 200;
const MAX_MANAGED_AUTO_MODES = 50;

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function normalizeAccessString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength && !containsControlCharacter(normalized)
    ? normalized
    : undefined;
}

const ACCOUNT_UNAVAILABLE_CODE = 'ACCOUNT_UNAVAILABLE';
const TERMS_ACCEPTANCE_REQUIRED_CODE = 'TERMS_ACCEPTANCE_REQUIRED';
const TERMS_ACCEPTANCE_REQUIRED_MESSAGE =
  'Accept the updated AGI Workforce Terms of Service on agiworkforce.com to keep using AGI Cloud chat.';

/**
 * The account routes send upper-case codes and the chat gateway sends lower
 * case, so a refusal matched with === only on one casing fell through to the
 * generic "not available for this account" answer.
 */
function isGatewayCode(code: string | undefined, expected: string): boolean {
  return code?.toUpperCase() === expected;
}
const ACCOUNT_UNAVAILABLE_MESSAGE =
  'This AGI account cannot be used right now. Open your account on the web to see why.';

export class AccountUnavailableError extends Error {
  constructor(
    message: string,
    readonly recoveryPath: string | null,
  ) {
    super(message);
    this.name = 'AccountUnavailableError';
  }
}

export async function getManagedModelAccess(
  token: string,
  signal?: AbortSignal,
): Promise<ManagedModelAccess> {
  if (!token.trim()) throw new Error('Authentication is required');
  const requestOptions: RequestInit = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    },
    signal,
  };
  const [response, usageResponse] = await Promise.all([
    fetch(MANAGED_MODELS_ENDPOINT, requestOptions),
    fetch(MANAGED_USAGE_ENDPOINT, requestOptions),
  ]);
  if (!response.ok || !usageResponse.ok) {
    const failed = !response.ok ? response : usageResponse;
    const status = failed.status;
    if (status === 403) {
      const refusal = readGatewayErrorBody(await readBoundedErrorBody(failed));
      if (isGatewayCode(refusal.code, ACCOUNT_UNAVAILABLE_CODE)) {
        throw new AccountUnavailableError(
          refusal.message ?? ACCOUNT_UNAVAILABLE_MESSAGE,
          refusal.recoveryPath ?? null,
        );
      }
    }
    throw new Error(
      status === 401 ? 'Authentication is required' : `Account access is unavailable (${status})`,
    );
  }

  const [body, usageBody] = await Promise.all([response.json(), usageResponse.json()]);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid model-access response');
  }
  const record = body as Record<string, unknown>;
  const models = record['data'];
  const metadata = record['x_agi_workforce'];
  if (!Array.isArray(models) || !metadata || typeof metadata !== 'object') {
    throw new Error('Invalid model-access response');
  }
  const meta = metadata as Record<string, unknown>;
  const subscriptionTier = meta['user_tier'];
  const autoModes = meta['allowed_auto_modes'];
  const normalizedTier = normalizeAccessString(subscriptionTier, 64);
  if (!normalizedTier || !Array.isArray(autoModes)) {
    throw new Error('Invalid model-access response');
  }

  let usageSummary: ReturnType<typeof parseManagedUsageSummaryResponse>;
  try {
    usageSummary = parseManagedUsageSummaryResponse(usageBody);
  } catch {
    throw new Error('Invalid account-access response');
  }

  const modelIds: string[] = [];
  const seenModels = new Set<string>();
  for (const value of models.slice(0, MAX_MANAGED_MODEL_IDS * 2)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid model-access response');
    }
    const id = normalizeAccessString((value as Record<string, unknown>)['id'], 200);
    if (!id) {
      throw new Error('Invalid model-access response');
    }
    if (!seenModels.has(id)) {
      seenModels.add(id);
      modelIds.push(id);
      if (modelIds.length === MAX_MANAGED_MODEL_IDS) break;
    }
  }

  const allowedAutoModes: string[] = [];
  const seenAutoModes = new Set<string>();
  for (const value of autoModes.slice(0, MAX_MANAGED_AUTO_MODES * 4)) {
    const mode = normalizeAccessString(value, 100);
    if (!mode) throw new Error('Invalid model-access response');
    if (!seenAutoModes.has(mode)) {
      seenAutoModes.add(mode);
      allowedAutoModes.push(mode);
      if (allowedAutoModes.length === MAX_MANAGED_AUTO_MODES) break;
    }
  }

  return {
    subscriptionTier: effectivePlanTier(usageSummary.plan_tier, usageSummary.subscription_status),
    accountPlanTier: usageSummary.plan_tier,
    subscriptionStatus: usageSummary.subscription_status,
    usage: usageSummary,
    modelIds,
    allowedAutoModes,
  };
}

export interface ManagedModelUsage {
  modelId: string;
  label: string | null;
  requests: number;
  credits: number;
}

export interface ManagedUsageHistory {
  from: string;
  to: string;
  byModel: ManagedModelUsage[];
}

function readModelUsageRow(value: unknown): ManagedModelUsage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const modelId = normalizeAccessString(record['key'], 200);
  const requests = record['requests'];
  const credits = record['credits'];
  if (!modelId || typeof requests !== 'number' || typeof credits !== 'number') return null;
  if (!Number.isFinite(requests) || !Number.isFinite(credits)) return null;
  const label = typeof record['label'] === 'string' && record['label'] ? record['label'] : null;
  return { modelId, label, requests, credits: Math.max(0, credits) };
}

export async function getManagedUsageHistory(
  token: string,
  signal?: AbortSignal,
): Promise<ManagedUsageHistory> {
  if (!token.trim()) throw new Error('Authentication is required');
  const response = await fetch(MANAGED_USAGE_HISTORY_ENDPOINT, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    },
    signal,
  });
  if (!response.ok) throw new Error(`Usage history is unavailable (${response.status})`);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid usage history response');
  }
  const record = body as Record<string, unknown>;
  const from = record['from'];
  const to = record['to'];
  const byModel = record['byModel'];
  if (typeof from !== 'string' || typeof to !== 'string' || !Array.isArray(byModel)) {
    throw new Error('Invalid usage history response');
  }
  const rows = byModel.map(readModelUsageRow);
  if (rows.some((row) => row === null)) throw new Error('Invalid usage history response');
  return { from, to, byModel: rows as ManagedModelUsage[] };
}

export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  try {
    const token = await getFreshClerkToken(forceRefresh);
    if (token) return token;
  } catch (error) {
    if (forceRefresh) throw error;
    // Native API may be unavailable in a misconfigured development build. The
    // dev-only token below remains an explicit local escape hatch for tests.
  }

  if (isDevBuild()) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const local = await chrome.storage.local.get([DEV_TOKEN_KEY]);
        const token = local[DEV_TOKEN_KEY];
        if (typeof token === 'string' && token.length > 0) return token;
      }
    } catch {
      /* noop */
    }
  }

  return null;
}

async function developmentTokenOwner(token: string): Promise<ManagedCloudOwner> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const fingerprint = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return {
    accountId: `development-${fingerprint}`,
    authIncarnation: `development-${fingerprint}`,
  };
}

export async function getManagedCloudAuthContext(
  forceRefresh = false,
): Promise<ManagedCloudAuthContext | null> {
  try {
    const context = await getFreshClerkAuthContext(forceRefresh);
    if (context) return context;
  } catch (error) {
    if (forceRefresh) throw error;
  }

  if (!isDevBuild()) return null;
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const local = await chrome.storage.local.get([DEV_TOKEN_KEY]);
    const token = local[DEV_TOKEN_KEY];
    if (typeof token !== 'string' || token.length === 0) return null;
    return { token, owner: await developmentTokenOwner(token) };
  } catch {
    return null;
  }
}

function isDevBuild(): boolean {
  return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
}

export async function clearAuthToken(): Promise<void> {
  let previousOwner: ManagedCloudOwner | undefined;
  try {
    previousOwner = (await getManagedCloudAuthContext())?.owner;
  } catch {
    // Fall through to the ownerless computer-use cancellation below.
  }
  try {
    if (typeof document !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage(
        previousOwner
          ? { type: 'MANAGED_CLOUD_AUTH_CHANGED', previousOwner }
          : { type: 'CANCEL_COMPUTER_USE', reason: 'account_changed' },
      );
    }
  } catch {
    // A restarting worker has no surviving in-memory computer-use run.
  }
  try {
    await signOutClerk();
  } catch {
    // Continue removing local remnants even when the network sign-out fails.
  }
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      'session' in chrome.storage &&
      chrome.storage.session
    ) {
      await (
        chrome.storage.session as unknown as {
          remove: (keys: string[]) => Promise<void>;
        }
      ).remove([SESSION_TOKEN_KEY]);
    }
  } catch {
    // ignore
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove([DEV_TOKEN_KEY]);
    }
  } catch {
    // ignore
  }
  await clearAutofillProfile();
}

const LEGACY_ACCOUNT_STORAGE_KEYS = ['agi_api_key', 'agi_user_id', 'agi_user_tier', 'agi_session'];

export async function signOutOfAccount(): Promise<{ webSessionEnded: boolean }> {
  let webSessionEnded = true;
  try {
    await revokeSyncedWebSession();
  } catch (error) {
    console.warn('[AGI] Ending the web session failed:', error);
    webSessionEnded = false;
  }
  await clearAuthToken();
  await chrome.storage.local.remove(LEGACY_ACCOUNT_STORAGE_KEYS);
  return { webSessionEnded };
}

export type FreeTrialContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      image_url: { url: string; detail: 'auto' | 'low' | 'high' };
    }
  | { type: 'file'; file: { asset_id: string } };

export interface ManagedChatFileAttachment {
  assetId: string;
  mimeType: string;
}

export const MANAGED_CHAT_FILE_ASSET_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FreeTrialMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | FreeTrialContentPart[];
}

const SUPPORTED_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i;

function imageDataUrlByteLength(value: string): number {
  if (!SUPPORTED_IMAGE_DATA_URL.test(value)) {
    throw new Error('Unsupported attachment: expected a base64 PNG, JPEG, WebP, or GIF image');
  }
  const base64 = value.slice(value.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function assertAttachmentBudget(attachments: readonly string[]): void {
  if (attachments.length > MANAGED_CHAT_MAX_ATTACHMENTS) {
    throw new Error(`Too many attachments: maximum is ${MANAGED_CHAT_MAX_ATTACHMENTS}`);
  }
  let totalBytes = 0;
  for (const attachment of attachments) {
    totalBytes += imageDataUrlByteLength(attachment);
    if (totalBytes > MANAGED_CHAT_MAX_ATTACHMENT_BYTES) {
      throw new Error('Attachments exceed the 25 MiB request limit');
    }
  }
}

export function createMultimodalUserContent(
  text: string,
  attachments: string[],
  files: readonly ManagedChatFileAttachment[] = [],
): FreeTrialContentPart[] {
  assertAttachmentBudget(attachments);
  if (attachments.length + files.length > MANAGED_CHAT_MAX_ATTACHMENTS) {
    throw new Error(`Too many attachments: maximum is ${MANAGED_CHAT_MAX_ATTACHMENTS}`);
  }
  const parts: FreeTrialContentPart[] = [{ type: 'text', text }];
  for (const attachment of attachments) {
    parts.push({
      type: 'image_url',
      image_url: { url: attachment, detail: 'auto' },
    });
  }
  for (const file of files) {
    if (!MANAGED_CHAT_FILE_ASSET_ID.test(file.assetId)) {
      throw new Error('Unsupported attachment: expected an uploaded file reference');
    }
    parts.push({ type: 'file', file: { asset_id: file.assetId } });
  }
  return parts;
}

function selectBoundedMessageWindow(messages: readonly FreeTrialMessage[]): FreeTrialMessage[] {
  if (messages.length <= MANAGED_CHAT_MAX_MESSAGES) return [...messages];
  const firstSystem = messages.find((message) => message.role === 'system');
  const recent = messages.slice(-(MANAGED_CHAT_MAX_MESSAGES - (firstSystem ? 1 : 0)));
  return firstSystem && !recent.includes(firstSystem) ? [firstSystem, ...recent] : recent;
}

function assertMessageShape(message: FreeTrialMessage): void {
  if (!message || typeof message !== 'object') throw new Error('Invalid managed chat message');
  if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') {
    throw new Error('Invalid managed chat message role');
  }
  if (typeof message.content === 'string') return;
  if (!Array.isArray(message.content)) throw new Error('Invalid managed chat message content');
  for (const part of message.content) {
    if (!part || typeof part !== 'object') throw new Error('Invalid managed chat content part');
    if (part.type === 'text') {
      if (typeof part.text !== 'string') throw new Error('Invalid managed chat text part');
      continue;
    }
    if (part.type === 'file') {
      if (
        !part.file ||
        typeof part.file.asset_id !== 'string' ||
        !MANAGED_CHAT_FILE_ASSET_ID.test(part.file.asset_id)
      ) {
        throw new Error('Invalid managed chat file part');
      }
      continue;
    }
    if (
      part.type !== 'image_url' ||
      !part.image_url ||
      typeof part.image_url.url !== 'string' ||
      !['auto', 'low', 'high'].includes(part.image_url.detail)
    ) {
      throw new Error('Invalid managed chat image part');
    }
  }
}

function capRequestMessages(messages: readonly FreeTrialMessage[]): FreeTrialMessage[] {
  const window = selectBoundedMessageWindow(messages);
  let remaining = MANAGED_CHAT_MAX_INPUT_CHARS;
  const reversed: FreeTrialMessage[] = [];
  let attachmentCount = 0;
  let attachmentBytes = 0;

  for (let index = window.length - 1; index >= 0; index -= 1) {
    const message = window[index];
    if (!message) continue;
    assertMessageShape(message);
    if (typeof message.content === 'string') {
      const content = message.content.slice(0, remaining);
      remaining -= content.length;
      if (content.length > 0 || index === window.length - 1) {
        reversed.push({ ...message, content });
      }
      continue;
    }

    const parts: FreeTrialContentPart[] = [];
    for (let partIndex = message.content.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.content[partIndex];
      if (!part) continue;
      if (part.type === 'text') {
        const text = part.text.slice(0, remaining);
        remaining -= text.length;
        if (text) parts.unshift({ ...part, text });
        continue;
      }
      attachmentCount += 1;
      if (part.type === 'image_url') attachmentBytes += imageDataUrlByteLength(part.image_url.url);
      if (
        attachmentCount > MANAGED_CHAT_MAX_ATTACHMENTS ||
        attachmentBytes > MANAGED_CHAT_MAX_ATTACHMENT_BYTES
      ) {
        throw new Error('Managed chat attachment budget exceeded');
      }
      parts.unshift(part);
    }
    if (parts.length > 0) reversed.push({ ...message, content: parts });
  }

  return reversed.reverse();
}

export interface ManagedChatSourceWire extends AgentEventSource {
  publishedDate?: string;
}

export interface ManagedChatSourcesDelta {
  citations: ManagedChatSourceWire[];
  results: ManagedChatSourceWire[];
}

export const CODE_EXECUTION_OUTPUT_MAX_CHARS = 16_000;

export interface ManagedCodeExecution {
  status: 'running' | 'completed' | 'failed';
  stdout?: string;
  stderr?: string;
  returnCode?: number;
  errorCode?: string;
}

export type FreeTrialChunk =
  | { type: 'text'; text: string }
  | { type: 'code-execution'; execution: ManagedCodeExecution }
  | { type: 'agent-event'; envelope: AgentEventEnvelope; durableReplay?: true }
  | { type: 'generated-files'; files: GeneratedFileWire[] }
  | ({ type: 'sources' } & ManagedChatSourcesDelta)
  | { type: 'interactive-card'; card: InteractiveCard }
  | { type: 'run'; run: ManagedCloudAgentRunReference }
  | { type: 'quota-warning'; warning: ManagedQuotaWarningSignal }
  | { type: 'done' }
  | {
      type: 'error';
      message: string;
      code:
        | 'quota_exceeded'
        | 'auth_required'
        | 'account_suspended'
        | 'terms_required'
        | 'plan_required'
        | 'rate_limited'
        | 'server_error'
        | 'protocol_error'
        | 'cancelled'
        | 'timeout';
      /**
       * The wait the provider itself asked for, never a guess. The panel
       * states a time only when this is present, because a reader who sits
       * out an invented one and fails again stops believing the next.
       */
      retryAfterSeconds?: number;
      /**
       * The id the gateway logged for this same failure, so a reader
       * reporting it hands over the one string that finds the turn.
       */
      requestId?: string;
      quota?: ManagedQuotaBlock;
    };

export interface ManagedMemoryCommandTurn {
  kind: MemoryCommandKind;
  status: MemoryCommandStatus;
}

export interface ManagedChatStreamOptions {
  model?: string;
  memoryCommand?: ManagedMemoryCommandTurn;
  effort?: Effort;
  extendedThinking?: boolean;
  workMode?: 'chat' | 'agiwork';
  agiWorkGoal?: string;
  agiWorkPlan?: readonly string[];
  webSearch?: boolean;
  webFetch?: boolean;
  approvalResume?: ToolApprovalResumeRequest;
  inputResume?: ToolInputResumeRequest;
  idempotencyKey?: string;
  conversationId?: string;
  assistantMessageId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const MANAGED_CHAT_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function isAbortSignal(value: unknown): value is AbortSignal {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'aborted' in value &&
    typeof (value as AbortSignal).addEventListener === 'function',
  );
}

function normalizeStreamOptions(
  value: ManagedChatStreamOptions | AbortSignal | undefined,
): ManagedChatStreamOptions {
  return isAbortSignal(value) ? { signal: value } : (value ?? {});
}

interface ParsedSseFrame {
  text?: string;
  codeExecution?: ManagedCodeExecution;
  agentEvent?: AgentEventEnvelope;
  generatedFiles?: GeneratedFileWire[];
  interactiveCard?: InteractiveCard;
  sources?: ManagedChatSourcesDelta;
  terminal?: boolean;
  recognized?: boolean;
  error?: Extract<FreeTrialChunk, { type: 'error' }>;
}

function readSourceRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseCodeExecutionDelta(result: unknown, status: unknown): ManagedCodeExecution | null {
  const content = readSourceRecord(readSourceRecord(result)?.['content']);
  if (content?.['type'] === 'code_execution_tool_result_error') {
    const errorCode = content['error_code'];
    return {
      status: 'failed',
      errorCode:
        typeof errorCode === 'string' && errorCode ? errorCode.slice(0, 80) : 'unknown_error',
    };
  }
  if (content) {
    const returnCode = content['return_code'];
    return {
      status: 'completed',
      stdout:
        typeof content['stdout'] === 'string'
          ? content['stdout'].slice(0, CODE_EXECUTION_OUTPUT_MAX_CHARS)
          : '',
      stderr:
        typeof content['stderr'] === 'string'
          ? content['stderr'].slice(0, CODE_EXECUTION_OUTPUT_MAX_CHARS)
          : '',
      returnCode: typeof returnCode === 'number' && Number.isInteger(returnCode) ? returnCode : 0,
    };
  }
  const tool = readSourceRecord(status);
  return tool?.['type'] === 'server_tool_use' && tool['name'] === 'code_execution'
    ? { status: 'running' }
    : null;
}

function parseCitationDelta(payload: unknown): ManagedChatSourceWire[] {
  const record = readSourceRecord(payload);
  const url = record?.['url'];
  const title = record?.['title'];
  return typeof url === 'string' && url && typeof title === 'string' && title
    ? [{ url, title }]
    : [];
}

function parseSearchResultsDelta(payload: unknown): ManagedChatSourceWire[] {
  const content = readSourceRecord(payload)?.['content'];
  if (!Array.isArray(content)) return [];
  return content.flatMap((entry) => {
    const record = readSourceRecord(entry);
    const url = record?.['url'];
    if (!record || typeof url !== 'string' || !url) return [];
    if (record['type'] !== undefined && record['type'] !== 'web_search_result') return [];
    const title = typeof record['title'] === 'string' && record['title'] ? record['title'] : url;
    const pageAge = record['page_age'];
    return [
      {
        url,
        title,
        ...(typeof pageAge === 'string' && pageAge ? { publishedDate: pageAge } : {}),
      },
    ];
  });
}

function protocolError(message = 'Malformed response from AGI Cloud.'): ParsedSseFrame {
  return { error: { type: 'error', message, code: 'protocol_error' } };
}

const MAX_STATED_RETRY_AFTER_SECONDS = 86_400;

function statableRetryAfterSeconds(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const seconds = Math.round(raw);
  if (seconds < 1 || seconds > MAX_STATED_RETRY_AFTER_SECONDS) return undefined;
  return seconds;
}

/**
 * The gateway puts the sentence, the wait and the id on one frame. Reading
 * only the sentence left the panel unable to say when a window reopens or to
 * give support anything to search for, so both frames that can carry a failure
 * are read here rather than twice, differently.
 */
function gatewayFailure(
  raw: unknown,
  fallbackMessage: string,
): Extract<FreeTrialChunk, { type: 'error' }> {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : undefined;
  const message =
    typeof raw === 'string'
      ? raw
      : typeof record?.['message'] === 'string' && record['message']
        ? (record['message'] as string)
        : fallbackMessage;
  const providerCode = typeof record?.['code'] === 'string' ? (record['code'] as string) : '';
  const retryAfterSeconds = statableRetryAfterSeconds(record?.['retryAfterSeconds']);
  const requestId = record?.['requestId'];
  const block = accountLimitBlock(providerCode);
  return {
    type: 'error',
    message,
    code: block
      ? accountLimitFailureCode(block)
      : providerCode.includes('limit_reached') || providerCode.includes('free_trial')
        ? 'quota_exceeded'
        : 'server_error',
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(typeof requestId === 'string' && requestId ? { requestId } : {}),
    ...(block ? { quota: quotaBlock(providerCode, record?.['recovery']) } : {}),
  };
}

const QUOTA_RECOVERY_ACTIONS: ReadonlySet<string> = new Set<ManagedQuotaRecoveryAction>([
  'top_up',
  'upgrade',
  'view_usage',
  'contact_support',
]);

function accountLimitBlock(code: string | undefined): ManagedQuotaBlockPresentation | null {
  const block = classifyManagedQuotaErrorCode(code);
  return block && block.kind !== 'rate_limit' ? block : null;
}

function accountLimitFailureCode(
  block: ManagedQuotaBlockPresentation,
): 'plan_required' | 'quota_exceeded' {
  return block.feature === 'model_access' || block.feature === 'paid_capability'
    ? 'plan_required'
    : 'quota_exceeded';
}

function readQuotaRecovery(value: unknown): ManagedQuotaRecovery | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const action = record['action'];
  const href = normalizeAccessString(record['href'], 200);
  if (typeof action !== 'string' || !QUOTA_RECOVERY_ACTIONS.has(action)) return undefined;
  if (!href || !href.startsWith('/') || href.startsWith('//')) return undefined;
  return { action: action as ManagedQuotaRecoveryAction, href };
}

function quotaBlock(code: string, recovery: unknown): ManagedQuotaBlock {
  const link = readQuotaRecovery(recovery);
  return { code: code.trim().toLowerCase(), ...(link ? { recovery: link } : {}) };
}

interface GatewayErrorBody {
  code?: string;
  message?: string;
  recoveryPath?: string;
  recovery?: unknown;
}

function isGatewayPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  try {
    return new URL(path, FREE_TRIAL_GATEWAY).origin === new URL(FREE_TRIAL_GATEWAY).origin;
  } catch {
    return false;
  }
}

function readGatewayErrorBody(body: string): GatewayErrorBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const error = (parsed as Record<string, unknown>)['error'];
  if (typeof error === 'string') return { code: error };
  if (!error || typeof error !== 'object' || Array.isArray(error)) return {};
  const record = error as Record<string, unknown>;
  const code = normalizeAccessString(record['code'], 100);
  const message = normalizeAccessString(record['message'], 500);
  const details = record['details'];
  const recoveryPath =
    details && typeof details === 'object' && !Array.isArray(details)
      ? normalizeAccessString((details as Record<string, unknown>)['recoveryPath'], 200)
      : undefined;
  return {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(recoveryPath && isGatewayPath(recoveryPath) ? { recoveryPath } : {}),
    recovery: record['recovery'],
  };
}

class ManagedChatProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManagedChatProtocolError';
  }
}

function parseSseData(dataPayload: string): ParsedSseFrame {
  const data = dataPayload.trim();
  if (!data) return { recognized: true };
  if (data === '[DONE]') return { terminal: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return protocolError();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return protocolError();
  }

  const event = parsed as Record<string, unknown>;
  if (event['error'] !== undefined) {
    return { error: gatewayFailure(event['error'], 'AGI Cloud request failed.') };
  }

  let recognized = false;
  let deltaContent: unknown;
  let codeExecution: ManagedCodeExecution | null = null;
  let agentEvent: AgentEventEnvelope | null = null;
  let generatedFiles: GeneratedFileWire[] = [];
  let interactiveCard: InteractiveCard | null = null;
  let citations: ManagedChatSourceWire[] = [];
  let searchResults: ManagedChatSourceWire[] = [];
  let finishReason: unknown;
  const choices = event['choices'];
  if (choices !== undefined) {
    if (!Array.isArray(choices)) return protocolError();
    if (choices.length === 0) {
      if (event['usage'] === undefined) return protocolError();
      recognized = true;
    } else {
      const choice = choices[0];
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return protocolError();
      const choiceRecord = choice as Record<string, unknown>;
      finishReason = choiceRecord['finish_reason'];
      const delta = choiceRecord['delta'];
      if (delta !== undefined) {
        if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return protocolError();
        const deltaRecord = delta as Record<string, unknown>;
        deltaContent = deltaRecord['content'];
        codeExecution = parseCodeExecutionDelta(
          deltaRecord['x_code_result'],
          deltaRecord['x_tool_status'],
        );
        agentEvent = parseAgentEventDelta(deltaRecord['x_agent_event']);
        generatedFiles = parseGeneratedFilesDelta(deltaRecord['x_generated_files']);
        interactiveCard = parseInteractiveCardDelta(deltaRecord['x_interactive_card']);
        citations = parseCitationDelta(deltaRecord[WEB_SEARCH_CITATION_DELTA_KEY]);
        searchResults = parseSearchResultsDelta(deltaRecord['x_search_results']);

        const streamError = deltaRecord['x_stream_error'];
        if (streamError !== undefined && streamError !== null) {
          return {
            error: gatewayFailure(streamError, 'AGI Cloud request failed while streaming.'),
          };
        }

        // The keys this client actually READS. It deliberately does not double
        // as the list of keys the server may SEND.
        const consumedDeltaKeys = [
          'content',
          'role',
          'tool_calls',
          'reasoning_content',
          'x_generated_files',
          'x_interactive_card',
          'x_tool_status',
          'x_tool_approval_request',
          'x_tool_result',
          'x_search_results',
          'x_code_result',
          'x_agent_event',
        ];
        recognized =
          consumedDeltaKeys.some((key) => key in deltaRecord) ||
          Object.keys(deltaRecord).some((key) => key.startsWith('x_'));
      }
      recognized =
        recognized ||
        'finish_reason' in choiceRecord ||
        'index' in choiceRecord ||
        'logprobs' in choiceRecord;
    }
  }

  if (deltaContent !== undefined && typeof deltaContent !== 'string') {
    return protocolError();
  }
  const directContent = event['content'];
  if (directContent !== undefined && typeof directContent !== 'string') {
    return protocolError();
  }
  if (directContent !== undefined) recognized = true;
  if (finishReason !== undefined && finishReason !== null && typeof finishReason !== 'string') {
    return protocolError();
  }
  if (finishReason === 'error') {
    return {
      error: {
        type: 'error',
        message: 'AGI Cloud reported a streaming failure without error details.',
        code: 'server_error',
      },
    };
  }
  const done = event['done'];
  if (done !== undefined && typeof done !== 'boolean') return protocolError();
  if (done !== undefined) recognized = true;
  if (event['usage'] !== undefined) recognized = true;
  if (!recognized) return protocolError();

  return {
    text:
      typeof deltaContent === 'string'
        ? deltaContent
        : typeof directContent === 'string'
          ? directContent
          : undefined,
    ...(codeExecution ? { codeExecution } : {}),
    ...(agentEvent ? { agentEvent } : {}),
    ...(generatedFiles.length > 0 ? { generatedFiles } : {}),
    ...(interactiveCard ? { interactiveCard } : {}),
    ...(citations.length > 0 || searchResults.length > 0
      ? { sources: { citations, results: searchResults } }
      : {}),
    terminal: done === true || (typeof finishReason === 'string' && finishReason.length > 0),
    recognized: true,
  };
}

// These codes are the reader's own usage limit, so the sentence names their
// account; the shared free model allowance is a different failure with its own.
const QUOTA_EXHAUSTED_MESSAGE =
  'You have reached the usage limit on your account. Open Usage in AGI Cloud settings to see when it resets. Paid upgrades are opening in stages, so they need an access code or a place on the upgrade waitlist.';

function bodyIndicatesFreeQuota(body: string): boolean {
  const normalized = body.toLowerCase();
  return (
    normalized.includes('free_trial_token_budget_reached') ||
    normalized.includes('insufficient_quota') ||
    normalized.includes('quota_exceeded')
  );
}

const ACCOUNT_REFUSAL_STATUSES: ReadonlySet<number> = new Set([401, 402, 403, 429]);

function accountRefusal(status: number, body: string): Extract<FreeTrialChunk, { type: 'error' }> {
  const gatewayError = readGatewayErrorBody(body);
  if (isGatewayCode(gatewayError.code, ACCOUNT_UNAVAILABLE_CODE)) {
    return {
      type: 'error',
      code: 'account_suspended',
      message: gatewayError.message ?? ACCOUNT_UNAVAILABLE_MESSAGE,
    };
  }
  if (isGatewayCode(gatewayError.code, TERMS_ACCEPTANCE_REQUIRED_CODE)) {
    return {
      type: 'error',
      code: 'terms_required',
      message: gatewayError.message ?? TERMS_ACCEPTANCE_REQUIRED_MESSAGE,
    };
  }
  const block = accountLimitBlock(gatewayError.code);
  if (block && gatewayError.code) {
    const code = accountLimitFailureCode(block);
    return {
      type: 'error',
      code,
      message:
        gatewayError.message ??
        (code === 'quota_exceeded' ? QUOTA_EXHAUSTED_MESSAGE : block.reason),
      quota: quotaBlock(gatewayError.code, gatewayError.recovery),
    };
  }
  if (status === 402 || bodyIndicatesFreeQuota(body)) {
    return {
      type: 'error',
      message: gatewayError.message ?? QUOTA_EXHAUSTED_MESSAGE,
      code: 'quota_exceeded',
    };
  }
  if (status === 401) {
    return { type: 'error', message: 'Sign in to use AGI Cloud chat.', code: 'auth_required' };
  }
  if (status === 429) {
    return {
      type: 'error',
      message: 'AGI Cloud is receiving too many requests. Try again shortly.',
      code: 'rate_limited',
    };
  }
  return {
    type: 'error',
    message: 'This AGI Cloud capability is not available for the current account.',
    code: 'plan_required',
  };
}

async function readBoundedErrorBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    try {
      return (await response.text()).slice(0, MANAGED_CHAT_MAX_ERROR_BODY_CHARS);
    } catch {
      return '';
    }
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  try {
    while (body.length <= MANAGED_CHAT_MAX_ERROR_BODY_CHARS) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch {
    return body.slice(0, MANAGED_CHAT_MAX_ERROR_BODY_CHARS);
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return body.slice(0, MANAGED_CHAT_MAX_ERROR_BODY_CHARS);
}

export async function* streamFreeChat(
  messages: FreeTrialMessage[],
  token: string,
  optionsOrSignal?: ManagedChatStreamOptions | AbortSignal,
): AsyncGenerator<FreeTrialChunk> {
  const options = normalizeStreamOptions(optionsOrSignal);
  const model = (options.model ?? FREE_TRIAL_MODEL).trim();
  const idempotencyKey = options.idempotencyKey?.trim() ?? `agi.chrome.chat.${crypto.randomUUID()}`;
  if (!MANAGED_CHAT_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    yield {
      type: 'error',
      message: 'The Managed Cloud request identity is invalid.',
      code: 'protocol_error',
    };
    return;
  }
  if (!token.trim()) {
    yield { type: 'error', message: 'Sign in to use AGI Cloud chat.', code: 'auth_required' };
    return;
  }
  let cappedMessages: FreeTrialMessage[] = [];
  let approvalResume: ToolApprovalResumeRequest | undefined;
  let inputResume: ToolInputResumeRequest | undefined;
  if (options.inputResume) {
    const parsed = ToolInputResumeRequestSchema.safeParse(options.inputResume);
    if (!parsed.success) {
      yield {
        type: 'error',
        message: 'The connector input answer is invalid.',
        code: 'protocol_error',
      };
      return;
    }
    inputResume = parsed.data;
  } else if (options.approvalResume) {
    const parsed = ToolApprovalResumeRequestSchema.safeParse(options.approvalResume);
    if (!parsed.success) {
      yield {
        type: 'error',
        message: 'The managed tool approval request is invalid.',
        code: 'protocol_error',
      };
      return;
    }
    approvalResume = parsed.data;
  } else {
    if (!model || messages.length === 0) {
      yield {
        type: 'error',
        message: 'The managed chat request is incomplete.',
        code: 'protocol_error',
      };
      return;
    }
    try {
      cappedMessages = capRequestMessages(messages);
    } catch {
      yield {
        type: 'error',
        message: 'This message is too large for AGI Cloud. Shorten it and send again.',
        code: 'protocol_error',
      };
      return;
    }
  }

  const resumeBody = inputResume ?? approvalResume;
  const resumeEndpoint = inputResume
    ? MANAGED_INPUT_RESUME_ENDPOINT
    : approvalResume
      ? MANAGED_APPROVAL_ENDPOINT
      : undefined;
  const controller = new AbortController();
  let abortKind: 'cancelled' | 'timeout' | null = null;
  const abortFromCaller = (): void => {
    abortKind = 'cancelled';
    controller.abort();
  };
  if (options.signal?.aborted) {
    abortFromCaller();
  } else {
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeoutMs = Math.min(
    Math.max(1, options.timeoutMs ?? MANAGED_CHAT_DEFAULT_TIMEOUT_MS),
    120_000,
  );
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const armInactivityWatchdog = (): void => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(() => {
      if (controller.signal.aborted) return;
      abortKind = 'timeout';
      controller.abort();
    }, timeoutMs);
  };
  armInactivityWatchdog();

  const abortError = (): Extract<FreeTrialChunk, { type: 'error' }> =>
    abortKind === 'timeout'
      ? { type: 'error', message: 'AGI Cloud response timed out.', code: 'timeout' }
      : { type: 'error', message: 'Cancelled.', code: 'cancelled' };

  try {
    if (controller.signal.aborted) {
      yield abortError();
      return;
    }

    let response: Response;
    try {
      response = await fetch(resumeEndpoint ?? FREE_TRIAL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
          'X-Requested-With': 'XMLHttpRequest',
          ...platformRequestHeaders(),
        },
        body: JSON.stringify(
          resumeBody ?? {
            model,
            messages: cappedMessages,
            stream: true,
            [INTERACTIVE_CARD_REQUEST_KEY]: {
              supported: ['clarify.v1', 'itinerary.v1', 'map-search.v1', 'product-comparison.v1'],
              canRespond: true,
            },
            ...(options.workMode ? { work_mode: options.workMode } : {}),
            ...(options.workMode === 'agiwork' && options.agiWorkGoal
              ? {
                  agi_work_goal: { goal: options.agiWorkGoal },
                  ...(options.agiWorkPlan?.length
                    ? { agi_work_plan: { steps: [...options.agiWorkPlan] } }
                    : { agi_work_plan_approval: true }),
                }
              : {}),
            ...(options.memoryCommand ? { memory_command: options.memoryCommand } : {}),
            ...(options.webSearch ? { web_search: true } : {}),
            ...(options.webFetch ? { web_fetch: true } : {}),
            ...(options.extendedThinking ? { thinking_mode: true } : {}),
            ...(options.effort ? { effort: options.effort } : {}),
            ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
            ...(options.assistantMessageId
              ? { assistant_message_id: options.assistantMessageId }
              : {}),
          },
        ),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        yield abortError();
        return;
      }
      yield {
        type: 'error',
        message: 'Network error reaching AGI cloud. Check your connection.',
        code: 'server_error',
      };
      return;
    }

    if (ACCOUNT_REFUSAL_STATUSES.has(response.status)) {
      const body = await readBoundedErrorBody(response);
      yield accountRefusal(response.status, body);
      return;
    }

    if (!response.ok) {
      const body = await readBoundedErrorBody(response);
      try {
        const parsed = ToolApprovalResumeErrorResponseSchema.safeParse(JSON.parse(body));
        if (parsed.success) {
          yield {
            type: 'error',
            message: parsed.data.error.message,
            code: 'server_error',
          };
          return;
        }
      } catch {
        // Fall through to the bounded generic status message.
      }
      yield {
        type: 'error',
        message: 'AGI Cloud is temporarily unavailable. Try again, or choose another model.',
        code: 'server_error',
      };
      return;
    }

    // A 200 that is not an event stream is the signed-out case: the gateway
    // answers a redirect to the sign-in page, fetch follows it, and the body is
    // HTML. Parsing that as SSE produced "Malformed response from AGI Cloud",
    // which named the wrong culprit and hid the real one.
    const responseContentType = response.headers.get('content-type') ?? '';
    if (!responseContentType.toLowerCase().includes('text/event-stream')) {
      const looksLikeSignInPage = responseContentType.toLowerCase().includes('text/html');
      if (!looksLikeSignInPage) {
        // The type belongs in a support report, not in the panel: it names a
        // transport a reader never chose and cannot change.
        logger.warn('managed chat replied with a non-stream content type', responseContentType);
      }
      yield {
        type: 'error',
        message: looksLikeSignInPage
          ? 'Your AGI Cloud session has expired. Sign in again from the side panel to continue.'
          : 'AGI Cloud did not return a response stream for this turn. Try again.',
        code: looksLikeSignInPage ? 'auth_required' : 'protocol_error',
      };
      return;
    }

    let runReference: ManagedCloudAgentRunReference | undefined;
    try {
      const runHandle = readManagedCloudAgentRunHandle(response);
      if (runHandle) {
        runReference = { ...runHandle, lastSequence: -1 };
        yield { type: 'run', run: { ...runReference } };
      }
    } catch {
      yield {
        type: 'error',
        message: 'AGI Cloud started this turn in a way this extension cannot follow. Try again.',
        code: 'protocol_error',
      };
      return;
    }

    const quotaWarning = parseQuotaWarningHeader(response.headers.get('x-quota-warning'));
    if (quotaWarning) yield { type: 'quota-warning', warning: quotaWarning };

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', message: 'No response body from gateway.', code: 'protocol_error' };
      return;
    }

    const decoder = new TextDecoder('utf-8', { fatal: true });
    const sseDecoder = new ServerSentEventDecoder(MANAGED_CHAT_MAX_SSE_FRAME_CHARS);
    let sawVisibleText = false;
    let sawAgentActivity = false;
    let sawRichOutput = false;
    let streamedTextCharacters = 0;
    let unacknowledgedPublicText = '';

    const publishRunReference = (
      patch: Partial<ManagedCloudAgentRunReference>,
    ): FreeTrialChunk | undefined => {
      if (!runReference) return undefined;
      runReference = {
        ...runReference,
        ...patch,
        lastSequence: Math.max(runReference.lastSequence, patch.lastSequence ?? -1),
      };
      return { type: 'run', run: { ...runReference } };
    };

    const handleEvents = async (
      dataEvents: readonly ServerSentEvent[],
    ): Promise<{ chunks: FreeTrialChunk[]; terminal: boolean }> => {
      const chunks: FreeTrialChunk[] = [];
      for (const data of dataEvents.flatMap((event) =>
        splitJoinedServerSentEventData(event.data),
      )) {
        const frame = parseSseData(data);
        if (frame.error) {
          chunks.push(frame.error);
          return { chunks, terminal: true };
        }
        if (frame.text) {
          streamedTextCharacters += frame.text.length;
          if (streamedTextCharacters > MANAGED_CHAT_MAX_STREAMED_TEXT_CHARS) {
            chunks.push({
              type: 'error',
              message: 'AGI Cloud returned more output than this surface can safely render.',
              code: 'protocol_error',
            });
            return { chunks, terminal: true };
          }
          sawVisibleText = true;
          unacknowledgedPublicText += frame.text;
          chunks.push({ type: 'text', text: frame.text });
        }
        if (frame.agentEvent) {
          sawAgentActivity = true;
          if (frame.agentEvent.event.type === 'text-delta') {
            unacknowledgedPublicText = reconcileManagedCloudPublicText(
              unacknowledgedPublicText,
              frame.agentEvent.event.delta,
            ).pending;
          }
          chunks.push({ type: 'agent-event', envelope: frame.agentEvent });
          const runChunk = publishRunReference({ lastSequence: frame.agentEvent.sequence });
          if (runChunk) chunks.push(runChunk);
        }
        if (frame.codeExecution) {
          sawRichOutput = true;
          chunks.push({ type: 'code-execution', execution: frame.codeExecution });
        }
        if (frame.generatedFiles) {
          sawRichOutput = true;
          chunks.push({ type: 'generated-files', files: frame.generatedFiles });
        }
        if (frame.interactiveCard) {
          sawRichOutput = true;
          chunks.push({ type: 'interactive-card', card: frame.interactiveCard });
        }
        if (frame.sources) chunks.push({ type: 'sources', ...frame.sources });
        if (frame.terminal) {
          if (!sawVisibleText && !sawAgentActivity && !sawRichOutput) {
            chunks.push({
              type: 'error',
              message: 'AGI Cloud completed without a result this surface can render.',
              code: 'protocol_error',
            });
            return { chunks, terminal: true };
          }
          chunks.push({ type: 'done' });
          return { chunks, terminal: true };
        }
      }
      return { chunks, terminal: false };
    };

    const decodeNetworkBytes = (value?: Uint8Array, stream = false): string => {
      try {
        return decoder.decode(value, { stream });
      } catch {
        throw new ManagedChatProtocolError('AGI Cloud returned invalid UTF-8.');
      }
    };

    const followDurableRun = async function* (): AsyncGenerator<FreeTrialChunk> {
      if (!runReference) return;
      const client = createManagedCloudAgentRunClient({
        baseUrl: FREE_TRIAL_GATEWAY,
        getAuthToken: async () => token,
      });
      const replayed: FreeTrialChunk[] = [];
      let wakeConsumer: (() => void) | undefined;
      let followed: Awaited<ReturnType<typeof client.followRun>> | undefined;
      let followError: unknown;
      let settled = false;
      const publish = (chunk: FreeTrialChunk): void => {
        replayed.push(chunk);
        wakeConsumer?.();
        wakeConsumer = undefined;
      };

      void client
        .followRun(runReference.runId, {
          afterSequence: runReference.lastSequence,
          signal: controller.signal,
          onEvent: (envelope) => {
            armInactivityWatchdog();
            if (envelope.event.type === 'text-delta') {
              const reconciled = reconcileManagedCloudPublicText(
                unacknowledgedPublicText,
                envelope.event.delta,
              );
              unacknowledgedPublicText = reconciled.pending;
              if (reconciled.unmatchedIncoming) {
                streamedTextCharacters += reconciled.unmatchedIncoming.length;
                if (streamedTextCharacters > MANAGED_CHAT_MAX_STREAMED_TEXT_CHARS) {
                  throw new ManagedChatProtocolError(
                    'AGI Cloud returned more output than this surface can safely render.',
                  );
                }
                publish({ type: 'text', text: reconciled.unmatchedIncoming });
              }
            }
            publish({ type: 'agent-event', envelope, durableReplay: true });
            const runChunk = publishRunReference({ lastSequence: envelope.sequence });
            if (runChunk) publish(runChunk);
          },
          onSnapshot: (snapshot) => {
            armInactivityWatchdog();
            const runChunk = publishRunReference({
              lastSequence: snapshot.nextAfterSequence,
              state: snapshot.run.state,
              cancellationRequestedAt: snapshot.run.cancellationRequestedAt,
            });
            if (runChunk) publish(runChunk);
          },
        })
        .then(
          (result) => {
            followed = result;
            settled = true;
            wakeConsumer?.();
            wakeConsumer = undefined;
          },
          (error: unknown) => {
            followError = error;
            settled = true;
            wakeConsumer?.();
            wakeConsumer = undefined;
          },
        );

      while (!settled || replayed.length > 0) {
        const next = replayed.shift();
        if (next) {
          yield next;
          continue;
        }
        await new Promise<void>((resolve) => {
          wakeConsumer = resolve;
        });
      }
      if (followError) throw followError;
      if (!followed) {
        throw new ManagedChatProtocolError('AGI Cloud run follow ended without a snapshot.');
      }
      const finalRunChunk = publishRunReference({
        lastSequence: followed.lastSequence,
        state: followed.run.state,
        cancellationRequestedAt: followed.run.cancellationRequestedAt,
      });
      if (finalRunChunk) yield finalRunChunk;
      if (followed.run.state === 'failed') {
        yield { type: 'error', message: 'AGI Cloud agent run failed.', code: 'server_error' };
        return;
      }
      if (followed.run.state === 'cancelled') {
        yield { type: 'error', message: 'Cancelled.', code: 'cancelled' };
        return;
      }
      yield { type: 'done' };
    };

    const emitHandled = async function* (
      dataEvents: readonly ServerSentEvent[],
    ): AsyncGenerator<FreeTrialChunk, boolean> {
      const handled = await handleEvents(dataEvents);
      for (const chunk of handled.chunks) yield chunk;
      return handled.terminal;
    };

    try {
      while (true) {
        if (controller.signal.aborted) {
          await reader.cancel().catch(() => undefined);
          yield abortError();
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;
        armInactivityWatchdog();
        const events = sseDecoder.push(decodeNetworkBytes(value, true));
        const handled = await handleEvents(events);
        for (const chunk of handled.chunks) yield chunk;
        if (handled.terminal) return;
      }

      const finalText = decodeNetworkBytes();
      if (finalText) {
        const handled = await handleEvents(sseDecoder.push(finalText));
        for (const chunk of handled.chunks) yield chunk;
        if (handled.terminal) return;
      }

      const final = sseDecoder.finish();
      if (final.incomplete) {
        yield {
          type: 'error',
          message: 'AGI Cloud closed the stream in the middle of an event.',
          code: 'protocol_error',
        };
        return;
      }
      if (final.events.length > 0) {
        let terminal = false;
        for await (const chunk of emitHandled(final.events)) {
          yield chunk;
          terminal = chunk.type === 'done' || chunk.type === 'error';
        }
        if (terminal) return;
      }

      if (runReference) {
        for await (const chunk of followDurableRun()) yield chunk;
      } else {
        yield {
          type: 'error',
          message: 'AGI Cloud closed the stream before completion.',
          code: 'protocol_error',
        };
      }
    } catch (error) {
      if (controller.signal.aborted) {
        reader.cancel().catch(() => {});
        yield abortError();
        return;
      }
      if (
        error instanceof ServerSentEventFrameLimitError ||
        error instanceof ManagedChatProtocolError
      ) {
        yield {
          type: 'error',
          message: error.message,
          code: 'protocol_error',
        };
        return;
      }
      if (runReference) {
        try {
          for await (const chunk of followDurableRun()) yield chunk;
          return;
        } catch (followError) {
          if (controller.signal.aborted) {
            yield abortError();
            return;
          }
          yield {
            type: 'error',
            message:
              followError instanceof Error
                ? followError.message
                : 'The AGI Cloud run could not be resumed.',
            code: 'server_error',
          };
          return;
        }
      }
      yield {
        type: 'error',
        message: 'The AGI Cloud response stream failed.',
        code: 'server_error',
      };
    } finally {
      reader.cancel().catch(() => {});
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function streamManagedChatToolInput(
  runId: string,
  toolInputs: ToolInputResponseWire[],
  token: string,
  options: Omit<
    ManagedChatStreamOptions,
    'approvalResume' | 'inputResume' | 'model' | 'workMode'
  > = {},
): AsyncGenerator<FreeTrialChunk> {
  return streamFreeChat([], token, {
    ...options,
    inputResume: { run_id: runId, tool_inputs: toolInputs },
  });
}

export function streamManagedChatApproval(
  runId: string,
  toolApprovals: ToolApprovalDecisionWire[],
  token: string,
  {
    guidance,
    ...options
  }: Omit<ManagedChatStreamOptions, 'approvalResume' | 'model' | 'workMode'> & {
    guidance?: string;
  } = {},
): AsyncGenerator<FreeTrialChunk> {
  return streamFreeChat([], token, {
    ...options,
    approvalResume: {
      run_id: runId,
      tool_approvals: toolApprovals,
      ...(guidance ? { guidance } : {}),
    },
  });
}
