import 'server-only';

import { z } from 'zod';
import {
  MODEL_FAMILY_REGISTRY,
  getModelMetadataById,
  isAutoModeModelId,
  isFreeBillingPlanTier,
  normalizeModelId,
  resolveMaxOutputTokens,
} from '@agiworkforce/types';

import promotionDocument from '@/config/free-model-promotion.json';
import { FREE_TRIAL_MODEL } from '@/lib/free-trial-config';
import { LLMCostCalculator, type TokenUsage } from '@/lib/services/llm-cost-calculator';
import { listAvailableManagedProviderIds } from '@/lib/services/provider-adapter-service';

const MICROUSD_PER_USD = 1_000_000;
const MILLISECONDS_PER_SECOND = 1_000;
const MILLISECONDS_PER_HOUR = 60 * 60 * MILLISECONDS_PER_SECOND;
const MESSAGE_FRAME_TOKENS = 8;
const MANAGED_API_KEY = 'managed';
const IMAGE_PART_TYPES: ReadonlySet<string> = new Set(['image_url', 'image', 'input_image']);
const utf8 = new TextEncoder();

const CredentialSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  creditUsd: z.number().positive(),
  apiKey: z.union([
    z.literal(MANAGED_API_KEY),
    z.strictObject({ env: z.string().regex(/^[A-Z][A-Z0-9_]*$/) }),
  ]),
});

export const FreeModelPromotionConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    promotionId: z.string().regex(/^[a-z0-9-]+$/),
    provider: z.string().min(1),
    modelFamilyTier: z.string().min(1),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    spendCeilingUsd: z.number().positive(),
    turnReserveUsd: z.number().positive(),
    perUserMessages: z.strictObject({
      limit: z.number().int().positive(),
      window: z.string().regex(/^\d+\s*(s|m|h|d)$/),
    }),
    perUserWebSearches: z.strictObject({
      limit: z.number().int().nonnegative(),
      windowHours: z.number().positive(),
    }),
    promptTokenCeiling: z.number().int().positive(),
    promptTokenHeadroom: z.number().int().nonnegative(),
    latestMessageTokenLimit: z.number().int().positive(),
    imagePartTokenBound: z.number().int().positive(),
    toolResultHistoryChars: z.number().int().positive(),
    managedSpendRefreshSeconds: z.number().int().positive(),
    credentials: z.array(CredentialSchema).min(1),
  })
  .superRefine((config, context) => {
    if (Date.parse(config.endsAt) <= Date.parse(config.startsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'A promotion has to end after it starts',
      });
    }
    if (config.promptTokenHeadroom >= config.promptTokenCeiling) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['promptTokenHeadroom'],
        message: 'The headroom has to leave part of the prompt ceiling for the prompt',
      });
    }
    if (config.latestMessageTokenLimit > config.promptTokenCeiling - config.promptTokenHeadroom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latestMessageTokenLimit'],
        message: 'The latest message has to fit inside the prompt budget on its own',
      });
    }
    const credit = config.credentials.reduce((sum, credential) => sum + credential.creditUsd, 0);
    if (config.spendCeilingUsd > credit) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spendCeilingUsd'],
        message: 'The spend ceiling cannot exceed the credit the credentials hold',
      });
    }
    if (config.turnReserveUsd > config.spendCeilingUsd) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['turnReserveUsd'],
        message: 'One turn cannot reserve more than the whole promotion may spend',
      });
    }
    const ids = config.credentials.map((credential) => credential.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credentials'],
        message: 'Credential ids must be distinct',
      });
    }
    if (
      config.credentials.filter((credential) => credential.apiKey === MANAGED_API_KEY).length > 1
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credentials'],
        message: 'Only one credential can be the managed key',
      });
    }
  });

export type FreeModelPromotionConfig = z.infer<typeof FreeModelPromotionConfigSchema>;

export interface FreeModelPromotionCredential {
  id: string;
  creditMicrousd: number;
  /** Its account carries nothing but this promotion, so its failures say nothing about managed traffic. */
  isolated: boolean;
  apiKeyEnv: string | null;
}

export interface FreeModelPromotion {
  promotionId: string;
  provider: string;
  modelId: string;
  startsAtMs: number;
  endsAtMs: number;
  spendCeilingMicrousd: number;
  turnReserveMicrousd: number;
  perUserMessages: { limit: number; window: string };
  perUserWebSearches: { limit: number; windowMs: number };
  promptTokenCeiling: number;
  promptBudgetTokens: number;
  latestMessageTokenLimit: number;
  imagePartTokenBound: number;
  toolResultHistoryChars: number;
  managedSpendRefreshMs: number;
  outputTokenCap: number;
  credentials: readonly FreeModelPromotionCredential[];
}

/** What a turn carries once the promotion has reserved its spend. Plain data: it crosses the durable-workflow boundary. */
export interface FreeModelPromotionReservation {
  promotionId: string;
  credentialId: string;
  isolated: boolean;
  reservedMicrousd: number;
}

export function parseFreeModelPromotionConfig(value: unknown): FreeModelPromotionConfig {
  return FreeModelPromotionConfigSchema.parse(value);
}

let loadedConfig: FreeModelPromotionConfig | null = null;

export function loadFreeModelPromotionConfig(): FreeModelPromotionConfig {
  loadedConfig ??= parseFreeModelPromotionConfig(promotionDocument);
  return loadedConfig;
}

function toMicrousd(usd: number): number {
  return Math.round(usd * MICROUSD_PER_USD);
}

/**
 * The keys a promotion credential may name. The configuration picks among
 * them; a name the deployment does not register reads as unconfigured rather
 * than reaching into the environment for an arbitrary variable.
 */
const PROMOTION_API_KEY_READERS: Readonly<Record<string, () => string | undefined>> = {
  ANTHROPIC_PROMO_API_KEY: () => process.env['ANTHROPIC_PROMO_API_KEY'],
};

function configuredApiKey(env: string): string | null {
  const value = PROMOTION_API_KEY_READERS[env]?.()?.trim();
  return value ? value : null;
}

function credentialIsConfigured(
  credential: FreeModelPromotionConfig['credentials'][number],
  provider: string,
): boolean {
  return credential.apiKey === MANAGED_API_KEY
    ? listAvailableManagedProviderIds().has(provider)
    : configuredApiKey(credential.apiKey.env) !== null;
}

/**
 * The live model of the one family slot the provider holds at the configured
 * tier. Two slots at that tier, or none, serve nothing: the promotion never
 * guesses which model it pays for.
 */
function promotionModelId(config: FreeModelPromotionConfig): string | null {
  const families = Object.values(MODEL_FAMILY_REGISTRY).filter(
    (family) => family.provider === config.provider && family.tier === config.modelFamilyTier,
  );
  const [family] = families;
  if (!family || families.length !== 1) return null;
  const metadata = getModelMetadataById(family.activeModelId);
  if (!metadata || metadata.provider !== config.provider || metadata.deprecated === true) {
    return null;
  }
  return metadata.id;
}

/**
 * The promotion as it stands at `nowMs`, or null when nothing may be served
 * under it: outside its window, its family slot not yet promoted, or no
 * credential configured to pay for it. Spend and per-account standing are the
 * ledger's to answer; this is only whether the offer exists at all.
 */
export function readFreeModelPromotion(
  nowMs: number = Date.now(),
  config: FreeModelPromotionConfig = loadFreeModelPromotionConfig(),
): FreeModelPromotion | null {
  const startsAtMs = Date.parse(config.startsAt);
  const endsAtMs = Date.parse(config.endsAt);
  if (nowMs < startsAtMs || nowMs >= endsAtMs) return null;
  const modelId = promotionModelId(config);
  if (!modelId) return null;
  const credentials = config.credentials
    .filter((credential) => credentialIsConfigured(credential, config.provider))
    .map((credential) => ({
      id: credential.id,
      creditMicrousd: toMicrousd(credential.creditUsd),
      isolated: credential.apiKey !== MANAGED_API_KEY,
      apiKeyEnv: credential.apiKey === MANAGED_API_KEY ? null : credential.apiKey.env,
    }));
  if (credentials.length === 0) return null;
  return {
    promotionId: config.promotionId,
    provider: config.provider,
    modelId,
    startsAtMs,
    endsAtMs,
    spendCeilingMicrousd: toMicrousd(config.spendCeilingUsd),
    turnReserveMicrousd: toMicrousd(config.turnReserveUsd),
    perUserMessages: config.perUserMessages,
    perUserWebSearches: {
      limit: config.perUserWebSearches.limit,
      windowMs: config.perUserWebSearches.windowHours * MILLISECONDS_PER_HOUR,
    },
    promptTokenCeiling: config.promptTokenCeiling,
    promptBudgetTokens: config.promptTokenCeiling - config.promptTokenHeadroom,
    latestMessageTokenLimit: config.latestMessageTokenLimit,
    imagePartTokenBound: config.imagePartTokenBound,
    toolResultHistoryChars: config.toolResultHistoryChars,
    managedSpendRefreshMs: config.managedSpendRefreshSeconds * MILLISECONDS_PER_SECOND,
    outputTokenCap: resolveMaxOutputTokens(FREE_TRIAL_MODEL),
    credentials,
  };
}

export function freeModelPromotionCoversPlan(planTier: string | null | undefined): boolean {
  return isFreeBillingPlanTier((planTier ?? '').trim().toLowerCase());
}

/**
 * Whether a selection names the model the promotion serves, whether or not the
 * promotion is running. A Free account that picked it keeps being answered,
 * on the plan's own model, once the promotion has nothing left to give it.
 */
export function namesFreeModelPromotionModel(
  selection: string,
  config: FreeModelPromotionConfig = loadFreeModelPromotionConfig(),
): boolean {
  const modelId = promotionModelId(config);
  return modelId !== null && normalizeModelId(selection.trim().toLowerCase()) === modelId;
}

/** Auto, or the promoted model by name. Any other model the account chose keeps its own route. */
export function freeModelPromotionCoversSelection(
  promotion: Pick<FreeModelPromotion, 'modelId'>,
  selection: string,
): boolean {
  if (isAutoModeModelId(selection)) return true;
  return normalizeModelId(selection.trim().toLowerCase()) === promotion.modelId;
}

export function freeModelPromotionCredentialApiKey(
  credentialId: string,
  config: FreeModelPromotionConfig = loadFreeModelPromotionConfig(),
): string | null {
  const credential = config.credentials.find((candidate) => candidate.id === credentialId);
  if (!credential || credential.apiKey === MANAGED_API_KEY) return null;
  return configuredApiKey(credential.apiKey.env);
}

function utf8Bytes(text: string): number {
  return utf8.encode(text).byteLength;
}

function partTokenBound(part: unknown, imagePartTokenBound: number): number {
  if (typeof part === 'string') return utf8Bytes(part);
  if (!part || typeof part !== 'object') return 0;
  const type = (part as { type?: unknown }).type;
  if (typeof type === 'string' && IMAGE_PART_TYPES.has(type)) return imagePartTokenBound;
  return utf8Bytes(JSON.stringify(part));
}

export interface PromotionSizedMessage {
  content?: unknown;
  multimodal_content?: unknown[];
  tool_calls?: unknown[];
  tool_call_id?: string;
}

/**
 * An upper bound on the tokens a message costs, never an estimate of them.
 * A byte-level BPE token covers at least one UTF-8 byte, so a byte count bounds
 * text from above in every script and for every tokenizer generation, where a
 * characters-per-token ratio undercounts code, CJK and newer tokenizers. An
 * image is billed by its pixels, so it is bounded by the largest image the
 * provider accepts rather than by its encoded size.
 */
export function messageTokenBound(
  message: PromotionSizedMessage,
  imagePartTokenBound: number,
): number {
  const parts = Array.isArray(message.multimodal_content)
    ? message.multimodal_content
    : Array.isArray(message.content)
      ? (message.content as unknown[])
      : null;
  const content = parts
    ? parts.reduce<number>((sum, part) => sum + partTokenBound(part, imagePartTokenBound), 0)
    : typeof message.content === 'string'
      ? utf8Bytes(message.content)
      : 0;
  const toolCalls = message.tool_calls ? utf8Bytes(JSON.stringify(message.tool_calls)) : 0;
  const toolCallId = message.tool_call_id ? utf8Bytes(message.tool_call_id) : 0;
  return content + toolCalls + toolCallId + MESSAGE_FRAME_TOKENS;
}

export function toolsTokenBound(tools: unknown): number {
  return Array.isArray(tools) && tools.length > 0 ? utf8Bytes(JSON.stringify(tools)) : 0;
}

export function promptTokenBound(
  request: { messages: unknown; tools?: unknown },
  imagePartTokenBound: number,
): number {
  const messages = Array.isArray(request.messages)
    ? (request.messages as PromotionSizedMessage[])
    : [];
  return messages.reduce(
    (sum, message) => sum + messageTokenBound(message, imagePartTokenBound),
    toolsTokenBound(request.tools),
  );
}

/** The history budget a promoted turn trims to, once its tool definitions are paid for. */
export function promotionHistoryBudgetTokens(
  promotion: Pick<FreeModelPromotion, 'promptBudgetTokens'>,
  tools: unknown,
): number {
  return Math.max(0, promotion.promptBudgetTokens - toolsTokenBound(tools));
}

export const FREE_MODEL_PROMOTION_LIMIT_CODE = 'free_promotion_turn_limit';

export type FreeModelPromotionFit =
  | { ok: true; maxOutputTokens: number }
  | { ok: false; code: typeof FREE_MODEL_PROMOTION_LIMIT_CODE };

const PROMOTION_LIMIT: FreeModelPromotionFit = { ok: false, code: FREE_MODEL_PROMOTION_LIMIT_CODE };

/**
 * Fits one provider call of a promoted turn inside what the promotion reserved
 * for it: the prompt stays under the ceiling past which the provider bills the
 * whole request at its long-context rate, and the call's worst-case cost,
 * added to what the turn has already spent, stays inside the reservation.
 */
export function fitFreeModelPromotionOutput(input: {
  reservation: Pick<FreeModelPromotionReservation, 'reservedMicrousd'>;
  provider: string;
  model: string;
  request: { messages: unknown; tools?: unknown };
  requestedMaxOutputTokens: number;
  priorCostMicrousd?: number;
  config?: FreeModelPromotionConfig;
}): FreeModelPromotionFit {
  const config = input.config ?? loadFreeModelPromotionConfig();
  const promptTokens = promptTokenBound(input.request, config.imagePartTokenBound);
  if (promptTokens > config.promptTokenCeiling - config.promptTokenHeadroom) return PROMOTION_LIMIT;
  const requested = Math.max(0, Math.floor(input.requestedMaxOutputTokens));
  if (requested === 0) return PROMOTION_LIMIT;
  const prior = Math.max(0, input.priorCostMicrousd ?? 0);
  const reserved = input.reservation.reservedMicrousd;
  const costFor = (outputTokens: number): number =>
    prior +
    LLMCostCalculator.calculateCostMicrousd(input.provider, input.model, {
      promptTokens,
      completionTokens: outputTokens,
      totalTokens: promptTokens + outputTokens,
    });
  if (costFor(1) > reserved) return PROMOTION_LIMIT;
  if (costFor(requested) <= reserved) return { ok: true, maxOutputTokens: requested };
  let low = 1;
  let high = requested - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (costFor(middle) <= reserved) low = middle;
    else high = middle - 1;
  }
  return { ok: true, maxOutputTokens: low };
}

/**
 * What a settled turn spent of the promotion: its measured tokens plus the
 * provider-billed tool charges, never less than what the caller reported.
 */
export function freeModelPromotionSpendMicrousd(input: {
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  reportedMicrousd: number;
  toolMicrousd?: number;
}): number {
  const measured =
    input.provider && input.model && input.usage
      ? LLMCostCalculator.calculateCostMicrousd(input.provider, input.model, input.usage)
      : 0;
  const tokens = Number.isFinite(measured) ? measured : 0;
  return Math.max(
    Math.max(0, input.reportedMicrousd),
    tokens + Math.max(0, input.toolMicrousd ?? 0),
  );
}

/** Its account carries nothing but the promotion, so its refusals say nothing about managed traffic. */
export function servedOnIsolatedPromotionCredential(processed: {
  freeTrial?: { promotion?: Pick<FreeModelPromotionReservation, 'isolated'> } | undefined;
}): boolean {
  return processed.freeTrial?.promotion?.isolated === true;
}
