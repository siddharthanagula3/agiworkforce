export type AgentContextRole = 'system' | 'user' | 'assistant' | 'tool';
export type AgentContextKind = 'text' | 'tool_result' | 'summary' | 'image';

export interface AgentContextMessage {
  id: string;
  role: AgentContextRole;
  content: string;
  kind?: AgentContextKind;
  observedTokens?: number;
}

export interface ContextUsageAnchor {
  observedInputTokens: number;
  estimatedTokensAtObservation: number;
}

export type TokenAccounting = 'provider_anchored' | 'estimated';
export type ContextBudgetStatus = 'ok' | 'warn' | 'compact';

export interface ContextBudget {
  contextWindowTokens: number;
  reservedOutputTokens: number;
  usableInputTokens: number;
  warningTokens: number;
  compactionTokens: number;
  targetTokens: number;
  estimatedTokens: number;
  usedTokens: number;
  usedFraction: number;
  status: ContextBudgetStatus;
  accounting: TokenAccounting;
}

export interface ContextBudgetInput {
  contextWindowTokens: number;
  messages: readonly AgentContextMessage[];
  reservedOutputTokens?: number;
  warningFraction?: number;
  compactionFraction?: number;
  targetFraction?: number;
  usageAnchor?: ContextUsageAnchor;
}

const TOKENS_PER_MESSAGE = 4;
const CODE_POINTS_PER_TOKEN = 4;
const DEFAULT_RESERVED_OUTPUT_TOKENS = 4_096;
const DEFAULT_WARNING_FRACTION = 0.7;
const DEFAULT_COMPACTION_FRACTION = 0.8;
const DEFAULT_TARGET_FRACTION = 0.65;
const MIN_ANCHOR_SCALE = 0.5;
const MAX_ANCHOR_SCALE = 4;

export function estimateTextTokens(text: string): number {
  return Math.ceil(Array.from(text).length / CODE_POINTS_PER_TOKEN);
}

export function estimateMessageTokens(message: AgentContextMessage): number {
  if (
    message.observedTokens !== undefined &&
    Number.isFinite(message.observedTokens) &&
    message.observedTokens >= 0
  ) {
    return Math.ceil(message.observedTokens);
  }

  const imageTokens = message.kind === 'image' ? 85 : 0;
  return TOKENS_PER_MESSAGE + imageTokens + estimateTextTokens(message.content);
}

export function estimateContextTokens(messages: readonly AgentContextMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

function fraction(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

export function computeContextBudget(input: ContextBudgetInput): ContextBudget {
  const contextWindowTokens = Math.max(1, Math.floor(input.contextWindowTokens));
  const reservedOutputTokens = Math.min(
    contextWindowTokens - 1,
    positiveInteger(input.reservedOutputTokens, DEFAULT_RESERVED_OUTPUT_TOKENS),
  );
  const usableInputTokens = Math.max(1, contextWindowTokens - reservedOutputTokens);
  const warningTokens = Math.floor(
    usableInputTokens * fraction(input.warningFraction, DEFAULT_WARNING_FRACTION),
  );
  const compactionTokens = Math.floor(
    usableInputTokens * fraction(input.compactionFraction, DEFAULT_COMPACTION_FRACTION),
  );
  const targetTokens = Math.floor(
    usableInputTokens * fraction(input.targetFraction, DEFAULT_TARGET_FRACTION),
  );
  const estimatedTokens = estimateContextTokens(input.messages);

  let usedTokens = estimatedTokens;
  let accounting: TokenAccounting = 'estimated';
  const anchor = input.usageAnchor;
  if (
    anchor !== undefined &&
    Number.isFinite(anchor.observedInputTokens) &&
    anchor.observedInputTokens >= 0 &&
    Number.isFinite(anchor.estimatedTokensAtObservation) &&
    anchor.estimatedTokensAtObservation > 0
  ) {
    const scale = Math.min(
      MAX_ANCHOR_SCALE,
      Math.max(MIN_ANCHOR_SCALE, anchor.observedInputTokens / anchor.estimatedTokensAtObservation),
    );
    usedTokens = Math.ceil(estimatedTokens * scale);
    accounting = 'provider_anchored';
  }

  const status: ContextBudgetStatus =
    usedTokens >= compactionTokens ? 'compact' : usedTokens >= warningTokens ? 'warn' : 'ok';

  return {
    contextWindowTokens,
    reservedOutputTokens,
    usableInputTokens,
    warningTokens,
    compactionTokens,
    targetTokens,
    estimatedTokens,
    usedTokens,
    usedFraction: usedTokens / usableInputTokens,
    status,
    accounting,
  };
}
