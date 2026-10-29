import {
  detectExplicitWebSearchIntent,
  explicitWebSearchSignals,
  hasExplicitWebSearchOptOut,
} from '@agiworkforce/search';
import {
  canAccessModelForSubscriptionTier,
  getModelMetadataById,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';

import { annotateActiveSpan } from '@/lib/observability/span';
import {
  forcedFunctionToolChoice,
  isForcedToolChoiceFor,
  modelAcceptsForcedToolChoice,
} from '@/lib/required-tool-call';

import { WEB_SEARCH_TOOL, webSearchToolDef } from './web-search-tool';

export type RequiredSearchSource =
  'explicit_mode' | 'work_mode' | 'explicit_intent' | 'freshness' | 'research_task';

export type WebSearchRequirement = {
  required: boolean;
  source: RequiredSearchSource | null;
};

const NOT_REQUIRED: WebSearchRequirement = { required: false, source: null };

// Phrasing that dates an answer: whatever the model recalls is from training
// time, and the user asked about now.
const FRESHNESS_PHRASES = [
  'yesterday',
  'last night',
  'this afternoon',
  'this evening',
  'this quarter',
  'this year',
  'last week',
  'last month',
  'as of today',
  'at the moment',
  'so far this year',
  'newest',
  'just announced',
  'just released',
  'just launched',
  'recently',
];

/** Subjects whose correct answer changes without anyone republishing a page. */
const VOLATILE_SUBJECTS = [
  'stock price',
  'share price',
  'exchange rate',
  'interest rate',
  'election results',
  'who won',
  'final score',
  'release date',
  'weather',
  'forecast',
];

const FRESHNESS_PATTERNS = [...FRESHNESS_PHRASES, ...VOLATILE_SUBJECTS].map(
  (phrase) => new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}\\b`, 'i'),
);

const YEAR_PATTERN = /\b(20\d{2})\b/g;

/** Offices and roles whose holder changes on a date no training cutoff knows. */
const HELD_OFFICES = [
  'president',
  'vice president',
  'prime minister',
  'chief minister',
  'deputy prime minister',
  'chancellor',
  'governor',
  'mayor',
  'minister',
  'secretary of state',
  'secretary general',
  'speaker',
  'chief justice',
  'attorney general',
  'head of state',
  'head of government',
  'monarch',
  'king',
  'queen',
  'pope',
  'ceo',
  'cfo',
  'cto',
  'chief executive',
  'chairman',
  'chairperson',
  'chair',
  'head coach',
  'captain',
  'world champion',
  'champion',
];

const HELD_OFFICE_ALTERNATION = HELD_OFFICES.toSorted((a, b) => b.length - a.length)
  .map((office) => office.replace(/ /g, '\\s+'))
  .join('|');

// "who is the president of India" asks who holds the office now; "who was"
// asks about a settled past and stays answerable from memory.
const OFFICE_HOLDER_PATTERNS = [
  new RegExp(
    `\\bwho(?:'s|\\s+is|\\s+are)\\s+(?:the\\s+)?(?:[\\p{L}'-]+\\s+){0,3}?(?:${HELD_OFFICE_ALTERNATION})s?\\b`,
    'iu',
  ),
  new RegExp(
    `\\b(?:current|incumbent|sitting|reigning|present|acting|new)\\s+(?:[\\p{L}'-]+\\s+){0,2}?(?:${HELD_OFFICE_ALTERNATION})s?\\b`,
    'iu',
  ),
];

// The recency keywords stay owned by `@agiworkforce/search`; this adds the
// phrasings, volatile subjects and dates that list does not carry.
export function detectFreshnessIntent(message: string, now: Date = new Date()): boolean {
  if (!message.trim()) return false;
  if (detectExplicitWebSearchIntent(message) === 'recency') return true;
  if (FRESHNESS_PATTERNS.some((pattern) => pattern.test(message))) return true;
  if (OFFICE_HOLDER_PATTERNS.some((pattern) => pattern.test(message))) return true;
  const currentYear = now.getUTCFullYear();
  for (const match of message.matchAll(YEAR_PATTERN)) {
    if (Number(match[1]) >= currentYear) return true;
  }
  return false;
}

export type WebSearchRequirementInput = {
  webSearchEnabled: boolean | undefined;
  agiWorkRun: boolean;
  researchTask: boolean;
  userMessage: string;
  /** The turn asked for a search outright (Search mode, `/search`). */
  searchRequested?: boolean;
  /** Injectable clock so the year classifier is deterministic under test. */
  now?: Date;
};

// In a long message the user's request sits in its first or last paragraph and the rest is
// material to read, whose dates and "latest" are not the user asking about now. Only an
// explicit ask for a search or sources in those paragraphs forces one there; the model still
// decides on the hints, with the tool offered.
const REQUEST_EDGE_CHARS = 280;
const LONG_MESSAGE_CHARS = REQUEST_EDGE_CHARS * 3;
const PARAGRAPH_BREAK = /\n\s*\n/u;

function requestText(message: string): string {
  if (message.length <= LONG_MESSAGE_CHARS) return message;
  const paragraphs = message
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const first = (paragraphs[0] ?? '').slice(0, REQUEST_EDGE_CHARS);
  const last = (paragraphs.at(-1) ?? '').slice(-REQUEST_EDGE_CHARS);
  return `${first}\n${last}`;
}

// Writing, rewriting, echoing or translating text works on what the user gave, so a date or a
// "latest" in it is content. The model can still search, since the tool stays offered.
// Politeness is stripped in a bounded loop. One expression that repeated a group of
// quantified alternatives was polynomial in the length of the message.
const POLITE_WORD = /^(?:please|kindly|simply|just|now|okay|ok|hey|hi|hello|pls|plz)(?=[\s,!.:])/iu;
const POLITE_GAP = /^[\s,!.:]+/u;
const MODAL_ASK = /^(?:can|could|would|will)\s+(?:you|u)\s+/iu;
const OPTIONAL_PLEASE = /^please\s+/iu;
const TRANSFORMATION_VERB =
  /^(?:write|rewrite|re-write|draft|compose|respond|reply|repeat|echo|translate|summarise|summarize|paraphrase|proofread|edit|polish|format|reformat|convert|turn|create|make|generate|design|build|render)\b/iu;

function isTransformationRequest(value: string): boolean {
  let rest = value.replace(/^\s+/u, '');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const modal = MODAL_ASK.exec(rest);
    if (modal) {
      rest = rest.slice(modal[0].length);
      const please = OPTIONAL_PLEASE.exec(rest);
      if (please) rest = rest.slice(please[0].length);
      continue;
    }
    const polite = POLITE_WORD.exec(rest);
    if (!polite) break;
    const gap = POLITE_GAP.exec(rest.slice(polite[0].length));
    if (!gap) break;
    rest = rest.slice(polite[0].length + gap[0].length);
  }
  return TRANSFORMATION_VERB.test(rest);
}

function classifyWebSearchRequirement(input: WebSearchRequirementInput): WebSearchRequirement {
  if (input.webSearchEnabled === false) return NOT_REQUIRED;
  if (input.searchRequested === true) return { required: true, source: 'explicit_mode' };
  if (hasExplicitWebSearchOptOut(input.userMessage)) return NOT_REQUIRED;
  if (input.agiWorkRun) return { required: true, source: 'work_mode' };
  const request = requestText(input.userMessage);
  const hintsCount =
    input.userMessage.length <= LONG_MESSAGE_CHARS && !isTransformationRequest(request);
  const signals = explicitWebSearchSignals(request);
  if (
    signals.includes('search_verb') ||
    signals.includes('sources') ||
    (hintsCount && signals.includes('recency'))
  ) {
    return { required: true, source: 'explicit_intent' };
  }
  if (input.researchTask) return { required: true, source: 'research_task' };
  if (hintsCount && detectFreshnessIntent(request, input.now)) {
    return { required: true, source: 'freshness' };
  }
  return NOT_REQUIRED;
}

/**
 * Is a search mandatory for this turn, and which signal made it so?
 *
 * Search stops being a suggestion the moment the user asked for one. A turn
 * that reaches the model with the tool merely offered is a turn the model is
 * free to answer from memory, which is what produced answers with no sources
 * on turns whose whole point was current information.
 */
export function resolveWebSearchRequirement(
  input: WebSearchRequirementInput,
): WebSearchRequirement {
  const requirement = classifyWebSearchRequirement(input);
  annotateActiveSpan({
    'web_search.required': requirement.required,
    'web_search.source': requirement.source ?? 'none',
  });
  return requirement;
}

const FREE_PLAN_TIER = normalizeBillingPlanTier(null);

/**
 * A Free turn on the plan's own model is paid for out of a small Free window,
 * so it is offered search and fetch tools only when the turn needs them. A
 * promoted or event model is paid for by its own budget and keeps its policy.
 */
export function webSearchToolOfferPolicyFor(input: {
  model: string;
  planTier: string | null | undefined;
}): 'required_only' | undefined {
  const modelPolicy = getModelMetadataById(input.model)?.webSearchToolOfferPolicy;
  if (modelPolicy) return modelPolicy;
  return input.planTier?.toLowerCase() === FREE_PLAN_TIER &&
    canAccessModelForSubscriptionTier(input.model, FREE_PLAN_TIER)
    ? 'required_only'
    : undefined;
}

export function shouldOfferWebSearchForTurn(input: {
  webSearchEnabled: boolean | undefined;
  requirement: WebSearchRequirement;
  modelPolicy: 'required_only' | undefined;
  surface: string;
  userOptOut?: boolean;
}): boolean {
  return (
    input.webSearchEnabled === true &&
    input.userOptOut !== true &&
    (input.surface !== 'web' || input.modelPolicy !== 'required_only' || input.requirement.required)
  );
}

export type AttachedSearchToolKind =
  'generic-function' | 'openai-hosted' | 'anthropic-server' | 'google-builtin';

const ANTHROPIC_SERVER_SEARCH_TYPE_PREFIX = `${WEB_SEARCH_TOOL}_`;
const GOOGLE_BUILTIN_SEARCH_KEY = 'google_search';

function classifySearchTool(tool: unknown): AttachedSearchToolKind | null {
  if (!tool || typeof tool !== 'object') return null;
  const record = tool as Record<string, unknown>;

  const fn = record['function'];
  if (record['type'] === 'function' && fn && typeof fn === 'object') {
    return (fn as Record<string, unknown>)['name'] === WEB_SEARCH_TOOL ? 'generic-function' : null;
  }

  const type = record['type'];
  if (typeof type === 'string' && type.startsWith(ANTHROPIC_SERVER_SEARCH_TYPE_PREFIX)) {
    return 'anthropic-server';
  }
  if (type === WEB_SEARCH_TOOL) return 'openai-hosted';
  if (record[GOOGLE_BUILTIN_SEARCH_KEY] && typeof record[GOOGLE_BUILTIN_SEARCH_KEY] === 'object') {
    return 'google-builtin';
  }
  return null;
}

/**
 * Which shape of search tool this request actually carries. The four are not
 * interchangeable: only two of them accept a tool choice, so the caller cannot
 * treat "a search tool is attached" as "a search can be required".
 */
export function classifyAttachedSearchTool(
  tools: readonly unknown[] | undefined,
): AttachedSearchToolKind | null {
  for (const tool of tools ?? []) {
    const kind = classifySearchTool(tool);
    if (kind) return kind;
  }
  return null;
}

/**
 * The provider-native search kind of one tool, empty for anything else,
 * `generic-function` included: that shape is our own tool, already governed
 * by the web-search call budget, not the native per-turn cap.
 */
export function nativeSearchToolName(tool: unknown): string {
  const kind = classifySearchTool(tool);
  return kind && kind !== 'generic-function' ? kind : '';
}

/**
 * Replace a provider-executed search tool with our own, when the account's
 * policy says a search has to be approved first.
 *
 * A provider-native search never becomes a tool call we see. The provider runs
 * it inside its own turn and we learn about it from a `serverToolStart` line on
 * the wire, by which time the query has already left. `resolveToolCallGate` is
 * therefore structurally unreachable for it: there is no call to gate, and no
 * amount of wiring in the tool loop can create one. That is why "Ask before
 * every action" did not stop a web search.
 *
 * The generic function tool is the same capability with a round trip. The model
 * emits a call, the loop gates it, the user approves, and our own executor runs
 * the search. So an approval requirement is honoured by choosing that shape
 * instead of the native one, rather than by adding a second gate.
 *
 * Fail-closed when the generic backend is not configured: the native tool is
 * withdrawn too and the model answers without search, saying so. Leaving native
 * search attached would keep running un-approved searches under a setting that
 * promises otherwise, which is the state this replaces.
 */
export function substituteGatedWebSearchTool(
  tools: readonly unknown[] | undefined,
  options: { approvalRequired: boolean; genericBackendConfigured: boolean },
): unknown[] | undefined {
  if (!options.approvalRequired) return tools as unknown[] | undefined;
  return replaceNativeWebSearchTool(tools, options.genericBackendConfigured);
}

export function replaceNativeWebSearchTool(
  tools: readonly unknown[] | undefined,
  genericBackendConfigured: boolean,
): unknown[] | undefined {
  if (!tools) return tools;

  const withoutNative = tools.filter((tool) => nativeSearchToolName(tool) === '');
  if (withoutNative.length === tools.length) return tools as unknown[];

  const alreadyGeneric = withoutNative.some(
    (tool) => classifySearchTool(tool) === 'generic-function',
  );
  if (alreadyGeneric || !genericBackendConfigured) return withoutNative;
  return [...withoutNative, webSearchToolDef()];
}

/**
 * Anthropic and Google both document search triggering as the model's own
 * decision, steerable by the system prompt and capped by `max_uses`, with no
 * tool-choice equivalent for the server-side tool. Sending one anyway either
 * errors or is ignored, so those two shapes take the prompt path instead.
 */
const TOOL_CHOICE_CAPABLE_SEARCH_TOOLS: ReadonlySet<AttachedSearchToolKind> =
  new Set<AttachedSearchToolKind>(['generic-function', 'openai-hosted']);

export const REQUIRED_SEARCH_SYSTEM_NUDGE =
  'This turn requires live web results. Call the web search tool before you answer, ' +
  'base the answer on what it returns, and cite the pages you used. Do not answer from ' +
  'memory alone, and do not tell the user to search for themselves. If a search returns ' +
  'nothing usable, say so plainly instead of substituting your own recollection.';

/**
 * Sent as the user turn of a retry, not as a system line: the nudge already
 * failed as an instruction, and a provider that ignored the system prompt
 * still answers the last thing the user said.
 */
export const REQUIRED_SEARCH_RETRY_DIRECTIVE =
  'That answer used no live sources. Run the web search tool now, then answer only ' +
  'from what it returns and cite the pages you used.';

export type RequiredSearchEnforcementMode = 'tool-choice' | 'nudge' | 'none';

export type RequiredSearchEnforcement = {
  mode: RequiredSearchEnforcementMode;
  toolChoice?: { type: 'function'; function: { name: string } };
  attachedTool: AttachedSearchToolKind | null;
};

const NO_ENFORCEMENT: RequiredSearchEnforcement = { mode: 'none', attachedTool: null };

/**
 * How to make the first model step search: a tool choice where the provider
 * honours one, a system line where it does not.
 *
 * A caller-supplied `tool_choice` always wins. Forcing a tool the caller did
 * not ask for would silently override an API client's own contract.
 */
export function resolveRequiredSearchEnforcement(input: {
  required: boolean;
  requestedToolChoice: unknown;
  stream: boolean | undefined;
  model: string | undefined;
  tools: readonly unknown[] | undefined;
}): RequiredSearchEnforcement {
  if (!input.required) return NO_ENFORCEMENT;
  if (input.requestedToolChoice !== undefined) return NO_ENFORCEMENT;
  if (input.stream !== true) return NO_ENFORCEMENT;

  const attachedTool = classifyAttachedSearchTool(input.tools);
  if (attachedTool === null) return NO_ENFORCEMENT;

  if (
    TOOL_CHOICE_CAPABLE_SEARCH_TOOLS.has(attachedTool) &&
    modelAcceptsForcedToolChoice(input.model)
  ) {
    return {
      mode: 'tool-choice',
      toolChoice: forcedFunctionToolChoice(WEB_SEARCH_TOOL),
      attachedTool,
    };
  }

  return { mode: 'nudge', attachedTool };
}

/**
 * Is this the tool choice the required-search decision installed? Only that
 * one is released to `auto` after the search step; a choice the caller sent
 * stands for the whole turn.
 */
export function isRequiredSearchToolChoice(choice: unknown): boolean {
  return isForcedToolChoiceFor(choice, WEB_SEARCH_TOOL);
}
