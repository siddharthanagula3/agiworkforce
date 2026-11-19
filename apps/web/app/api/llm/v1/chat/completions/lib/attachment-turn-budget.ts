import 'server-only';

import { getRoutePricing } from '@agiworkforce/model-registry';
import { getModelMetadataById } from '@agiworkforce/types';

import { CHAT_LARGE_FILE_POLICY, type ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import { sliceWholeCodePoints } from '@/lib/server/chat-file-preparation/text-stream';
import { isFileSearchTool, type FileReadingBudget } from '@/lib/server/tools/file-search-tool';
import { untrustedDocumentText } from '@/lib/server/untrusted-document-text';
import { withdrawnToolMessage } from './tool-turn-governor';

export type AttachmentTurnBudgetPolicy = ChatLargeFilePolicy['turnBudget'];

/** The same characters-per-token estimate the request processor charges prompts by. */
const ESTIMATED_CHARS_PER_TOKEN = 3.5;
const CENTS_PER_DOLLAR = 100;
const TOKENS_PER_MILLION = 1_000_000;
const PER_MILLION_TOKENS_UNIT = 'per_million_tokens';

export const LARGE_FILE_CARD_KEY = 'x_large_file_card';
export const LARGE_FILE_CARD_DETAIL_KEY = 'x_large_file_card_detail';
export const LARGE_FILE_TEXT_KEY = 'x_large_file_text';
export const LARGE_FILE_MORE_KEY = 'x_large_file_more';

export const FILE_READING_REMOVED_STUB =
  "Earlier file reading was removed to stay within this turn's reading budget.";
export const LARGE_FILE_PARTIAL_READ_LINE =
  'Tell the person your answer is based on part of this file.';
export const LARGE_FILE_NOT_READ_LINE = 'The rest of this file was not read.';
export const LARGE_FILE_TOOL_NOTE =
  'Read more of it with open_file (its id, and an offset or a page), or find passages with search_files.';

export function estimateAttachmentTokens(text: string): number {
  return Math.ceil(text.length / ESTIMATED_CHARS_PER_TOKEN);
}

function charsForTokens(tokens: number): number {
  return Math.max(0, Math.floor(tokens * ESTIMATED_CHARS_PER_TOKEN));
}

/**
 * T: the attachment-derived tokens one turn may send, the smallest of the
 * policy ceiling, a share of the model's window and the cents cap at the
 * route's uncached input price. A missing window or a free route does not bind.
 */
export function attachmentTurnTokenLimit(input: {
  contextWindow: number | null | undefined;
  inputUsdPerMillionTokens: number | null | undefined;
  policy?: AttachmentTurnBudgetPolicy;
}): number {
  const policy = input.policy ?? CHAT_LARGE_FILE_POLICY.turnBudget;
  const limits = [policy.maxAttachmentTokensPerTurn];
  if (input.contextWindow && input.contextWindow > 0) {
    limits.push(policy.contextShare * input.contextWindow);
  }
  if (input.inputUsdPerMillionTokens && input.inputUsdPerMillionTokens > 0) {
    const centsPerToken = (input.inputUsdPerMillionTokens * CENTS_PER_DOLLAR) / TOKENS_PER_MILLION;
    limits.push(policy.maxInputCentsPerTurn / centsPerToken);
  }
  return Math.max(0, Math.floor(Math.min(...limits)));
}

export function attachmentTurnTokenLimitForRoute(
  modelId: string,
  routeId: string | null | undefined,
  policy?: AttachmentTurnBudgetPolicy,
): number {
  const sheet = routeId ? getRoutePricing(routeId) : null;
  return attachmentTurnTokenLimit({
    contextWindow: getModelMetadataById(modelId)?.contextWindow ?? null,
    inputUsdPerMillionTokens:
      sheet && sheet.unit === PER_MILLION_TOKENS_UNIT ? sheet.inputPerMillion : null,
    ...(policy ? { policy } : {}),
  });
}

export interface AttachmentTurnLedgerState {
  limitTokens: number;
  charged: number;
  readingClosed: boolean;
  fileToolsOffered: boolean;
  /** What the current step's file-tool results may still add, kept for a call approved on resume. */
  stepAllowanceLeft?: number;
}

export interface LargeFileCardMarker {
  assetId: string;
  live: boolean;
  lines: string[];
  oneLine: string;
  partial: boolean;
  oneLined?: boolean;
  unreadable?: boolean;
}

export interface LargeFileCardDetailMarker {
  assetId: string;
  text: string;
}

export interface LargeFileTextMarker {
  assetId: string;
  filename: string;
  live: boolean;
  text: string;
}

export interface LargeFileMoreMarker {
  dropped: number;
}

export interface LedgerMessage {
  role: string;
  content: string;
  multimodal_content?: unknown[];
  tool_calls?: unknown[];
  tool_call_id?: string;
}

type Part = Record<string, unknown>;

function marker<T>(part: unknown, key: string): T | null {
  if (!part || typeof part !== 'object') return null;
  const value = (part as Part)[key];
  return value && typeof value === 'object' ? (value as T) : null;
}

export function cardMarkerOf(part: unknown): LargeFileCardMarker | null {
  return marker<LargeFileCardMarker>(part, LARGE_FILE_CARD_KEY);
}

export function textMarkerOf(part: unknown): LargeFileTextMarker | null {
  return marker<LargeFileTextMarker>(part, LARGE_FILE_TEXT_KEY);
}

function detailMarkerOf(part: unknown): LargeFileCardDetailMarker | null {
  return marker<LargeFileCardDetailMarker>(part, LARGE_FILE_CARD_DETAIL_KEY);
}

function moreMarkerOf(part: unknown): LargeFileMoreMarker | null {
  return marker<LargeFileMoreMarker>(part, LARGE_FILE_MORE_KEY);
}

export function renderLargeFileCard(
  card: LargeFileCardMarker,
  options: { oneLine: boolean; fileToolsOffered: boolean },
): string {
  if (options.oneLine) return card.oneLine;
  const lines = [...card.lines];
  if (card.unreadable) return lines.join('\n');
  if (card.partial) {
    lines.push(options.fileToolsOffered ? LARGE_FILE_TOOL_NOTE : LARGE_FILE_NOT_READ_LINE);
    lines.push(LARGE_FILE_PARTIAL_READ_LINE);
  } else if (options.fileToolsOffered) {
    lines.push(LARGE_FILE_TOOL_NOTE);
  }
  return lines.join('\n');
}

export function plainTextFilePart(filename: string, text: string): Part {
  return {
    type: 'file',
    file: {
      filename,
      mime_type: 'text/plain',
      file_data: `data:text/plain;base64,${Buffer.from(text, 'utf8').toString('base64')}`,
    },
  };
}

export function largeFileTextPart(section: LargeFileTextMarker): Part {
  return {
    ...plainTextFilePart(section.filename, untrustedDocumentText(section.filename, section.text)),
    [LARGE_FILE_TEXT_KEY]: section,
  };
}

function sectionTokens(filename: string, text: string): number {
  return estimateAttachmentTokens(untrustedDocumentText(filename, text));
}

function moreFilesLine(count: number): string {
  return `[and ${count} more ${count === 1 ? 'file' : 'files'}]`;
}

function textOfParts(parts: readonly unknown[]): string {
  return parts
    .filter(
      (part): part is { type: string; text: string } =>
        !!part &&
        typeof part === 'object' &&
        (part as Part)['type'] === 'text' &&
        typeof (part as Part)['text'] === 'string' &&
        ((part as Part)['text'] as string).length > 0,
    )
    .map((part) => part.text)
    .join('\n');
}

function partTokens(part: unknown): number {
  const card = cardMarkerOf(part);
  if (card) return estimateAttachmentTokens(String((part as Part)['text'] ?? ''));
  const text = textMarkerOf(part);
  if (text) return sectionTokens(text.filename, text.text);
  const detail = detailMarkerOf(part);
  if (detail) return estimateAttachmentTokens(detail.text);
  const more = moreMarkerOf(part);
  if (more) return estimateAttachmentTokens(String((part as Part)['text'] ?? ''));
  return 0;
}

interface CardLocation {
  messageIndex: number;
  card: LargeFileCardMarker;
  detailTokens: number;
}

function locateCards(messages: readonly LedgerMessage[]): CardLocation[] {
  const cards: CardLocation[] = [];
  messages.forEach((message, messageIndex) => {
    const parts = message.multimodal_content ?? [];
    for (const part of parts) {
      const card = cardMarkerOf(part);
      if (!card) continue;
      const detail = parts
        .map((candidate) => detailMarkerOf(candidate))
        .find((found) => found?.assetId === card.assetId);
      cards.push({
        messageIndex,
        card,
        detailTokens: detail ? estimateAttachmentTokens(detail.text) : 0,
      });
    }
  });
  return cards;
}

function priorityOrder(cards: readonly CardLocation[]): CardLocation[] {
  return [...cards].sort((a, b) => {
    if (a.card.live !== b.card.live) return a.card.live ? -1 : 1;
    return b.messageIndex - a.messageIndex;
  });
}

function fileToolCallNames(messages: readonly LedgerMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) continue;
    for (const call of message.tool_calls) {
      if (!call || typeof call !== 'object') continue;
      const id = (call as Part)['id'];
      const fn = (call as Part)['function'];
      const name = fn && typeof fn === 'object' ? (fn as Part)['name'] : undefined;
      if (typeof id === 'string' && typeof name === 'string' && isFileSearchTool(name)) {
        names.set(id, name);
      }
    }
  }
  return names;
}

/**
 * Results of open_file and search_files calls. A call refused because reading
 * closed carries the governor's withdrawn-tool message, which is not file text
 * and stays as it is, so the model still reads why the tool did not run.
 */
function fileToolResultIndexes(messages: readonly LedgerMessage[]): number[] {
  const names = fileToolCallNames(messages);
  const indexes: number[] = [];
  messages.forEach((message, index) => {
    if (message.role !== 'tool' || !message.tool_call_id) return;
    const name = names.get(message.tool_call_id);
    if (name && message.content !== withdrawnToolMessage(name)) indexes.push(index);
  });
  return indexes;
}

function lastUserIndex(messages: readonly LedgerMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return index;
  }
  return -1;
}

type CardForm = 'full' | 'one_line' | 'list';

interface CardPlan {
  form: CardForm;
  visible: Set<LargeFileCardMarker>;
  dropped: number;
  tokens: number;
}

/**
 * A card whose file still has text in the block is counted with the partial
 * read line, which the step adds if it cuts that text: the charge is never
 * less than what is sent.
 */
function planCards(
  cards: readonly CardLocation[],
  previouslyDropped: number,
  withText: ReadonlySet<string>,
  ledger: AttachmentTurnLedgerState,
  policy: AttachmentTurnBudgetPolicy,
): CardPlan {
  const share = Math.floor(policy.cardsShare * ledger.limitTokens);
  const render = (card: LargeFileCardMarker, oneLine: boolean) =>
    estimateAttachmentTokens(
      renderLargeFileCard(withText.has(card.assetId) ? { ...card, partial: true } : card, {
        oneLine,
        fileToolsOffered: ledger.fileToolsOffered,
      }),
    );
  const fullTokens = cards.reduce(
    (total, location) => total + render(location.card, false) + location.detailTokens,
    0,
  );
  const anyOneLined = cards.some((location) => location.card.oneLined === true);
  if (!ledger.readingClosed && !anyOneLined && previouslyDropped === 0 && fullTokens <= share) {
    return {
      form: 'full',
      visible: new Set(cards.map((c) => c.card)),
      dropped: 0,
      tokens: fullTokens,
    };
  }
  const oneLineTokens = cards.reduce((total, location) => total + render(location.card, true), 0);
  if (previouslyDropped === 0 && oneLineTokens <= share) {
    return {
      form: 'one_line',
      visible: new Set(cards.map((c) => c.card)),
      dropped: 0,
      tokens: oneLineTokens,
    };
  }
  const ordered = priorityOrder(cards);
  const visible = new Set<LargeFileCardMarker>();
  let used = 0;
  for (const [index, location] of ordered.entries()) {
    const remaining = ordered.length - index - 1 + previouslyDropped;
    const tokens = render(location.card, true);
    const tail = remaining > 0 ? estimateAttachmentTokens(moreFilesLine(remaining)) : 0;
    if (used + tokens + tail > share) break;
    visible.add(location.card);
    used += tokens;
  }
  const dropped = ordered.length - visible.size + previouslyDropped;
  return {
    form: 'list',
    visible,
    dropped,
    tokens: used + (dropped > 0 ? estimateAttachmentTokens(moreFilesLine(dropped)) : 0),
  };
}

function rewriteCards(messages: LedgerMessage[], plan: CardPlan, fileToolsOffered: boolean): void {
  const oneLine = plan.form !== 'full';
  messages.forEach((message, index) => {
    const parts = message.multimodal_content;
    if (!parts) return;
    let changed = false;
    const next: unknown[] = [];
    for (const part of parts) {
      if (moreMarkerOf(part)) {
        changed = true;
        continue;
      }
      const card = cardMarkerOf(part);
      if (card) {
        changed = true;
        if (!plan.visible.has(card)) continue;
        const updated: LargeFileCardMarker = oneLine ? { ...card, oneLined: true } : card;
        next.push({
          ...(part as Part),
          text: renderLargeFileCard(updated, { oneLine, fileToolsOffered }),
          [LARGE_FILE_CARD_KEY]: updated,
        });
        continue;
      }
      if (detailMarkerOf(part) && oneLine) {
        changed = true;
        continue;
      }
      next.push(part);
    }
    if (!changed) return;
    messages[index] = { ...message, multimodal_content: next, content: textOfParts(next) };
  });
  if (plan.dropped === 0) return;
  const userIndex = lastUserIndex(messages);
  if (userIndex < 0) return;
  const user = messages[userIndex]!;
  const parts = [...(user.multimodal_content ?? [{ type: 'text', text: user.content }])];
  const firstText = parts.findIndex((part) => textMarkerOf(part) !== null);
  const more = {
    type: 'text',
    text: moreFilesLine(plan.dropped),
    [LARGE_FILE_MORE_KEY]: { dropped: plan.dropped } satisfies LargeFileMoreMarker,
  };
  if (firstText < 0) parts.push(more);
  else parts.splice(firstText, 0, more);
  messages[userIndex] = { ...user, multimodal_content: parts, content: textOfParts(parts) };
}

function previouslyDroppedCards(messages: readonly LedgerMessage[]): number {
  for (const message of messages) {
    for (const part of message.multimodal_content ?? []) {
      const more = moreMarkerOf(part);
      if (more && Number.isSafeInteger(more.dropped)) return more.dropped;
    }
  }
  return 0;
}

function textSections(messages: readonly LedgerMessage[]): LargeFileTextMarker[] {
  return messages.flatMap((message) =>
    (message.multimodal_content ?? [])
      .map((part) => textMarkerOf(part))
      .filter((section): section is LargeFileTextMarker => section !== null),
  );
}

/** The longest prefix of the section whose fenced rendering is at most `tokens`. */
function fitSection(section: LargeFileTextMarker, tokens: number): LargeFileTextMarker | null {
  if (sectionTokens(section.filename, section.text) <= tokens) return section;
  if (sectionTokens(section.filename, '') >= tokens) return null;
  let low = 0;
  let high = Math.min(section.text.length, charsForTokens(tokens));
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (sectionTokens(section.filename, sliceWholeCodePoints(section.text, middle)) <= tokens) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const text = sliceWholeCodePoints(section.text, low).trimEnd();
  return text.length > 0 ? { ...section, text } : null;
}

function allocate(
  sections: readonly LargeFileTextMarker[],
  totalTokens: number,
  perSectionCap: number,
): { fitted: LargeFileTextMarker[]; used: number } {
  const fitted: LargeFileTextMarker[] = [];
  let remaining = Math.max(0, totalTokens);
  const bySize = [...sections].sort(
    (a, b) => sectionTokens(a.filename, a.text) - sectionTokens(b.filename, b.text),
  );
  const results = new Map<LargeFileTextMarker, LargeFileTextMarker | null>();
  bySize.forEach((section, index) => {
    const share = Math.min(perSectionCap, Math.floor(remaining / (bySize.length - index)));
    const fit = fitSection(section, share);
    results.set(section, fit);
    if (fit) remaining -= sectionTokens(fit.filename, fit.text);
  });
  for (const section of sections) {
    const fit = results.get(section);
    if (fit) fitted.push(fit);
  }
  return { fitted, used: Math.max(0, totalTokens) - remaining };
}

/** Rule 6: earlier turns' files share at most half of B; the current turn's files take the rest. */
export function fitTextSections(
  sections: readonly LargeFileTextMarker[],
  blockTokens: number,
  policy: AttachmentTurnBudgetPolicy = CHAT_LARGE_FILE_POLICY.turnBudget,
): { sections: LargeFileTextMarker[]; tokens: number } {
  const earlier = sections.filter((section) => !section.live);
  const current = sections.filter((section) => section.live);
  const earlierTotal = Math.min(policy.laterTurnTotalTokens, Math.floor(blockTokens / 2));
  const earlierEach = Math.min(policy.laterTurnFileTokens, earlierTotal);
  const earlierFit = allocate(earlier, earlierTotal, earlierEach);
  const currentFit = allocate(current, blockTokens - earlierFit.used, Number.POSITIVE_INFINITY);
  const fittedByAsset = new Map(
    [...earlierFit.fitted, ...currentFit.fitted].map((section) => [section.assetId, section]),
  );
  const ordered = sections
    .map((section) => fittedByAsset.get(section.assetId))
    .filter((section): section is LargeFileTextMarker => section !== undefined);
  return { sections: ordered, tokens: earlierFit.used + currentFit.used };
}

function rewriteTextSections(
  messages: LedgerMessage[],
  fitted: ReadonlyMap<string, LargeFileTextMarker>,
): void {
  messages.forEach((message, index) => {
    const parts = message.multimodal_content;
    if (!parts?.some((part) => textMarkerOf(part) !== null)) return;
    const next = parts.flatMap((part) => {
      const section = textMarkerOf(part);
      if (!section) return [part];
      const fit = fitted.get(section.assetId);
      if (!fit) return [];
      return fit.text === section.text ? [part] : [largeFileTextPart(fit)];
    });
    messages[index] = { ...message, multimodal_content: next, content: textOfParts(next) };
  });
}

function stubFileToolResults(messages: LedgerMessage[]): void {
  for (const index of fileToolResultIndexes(messages)) {
    const message = messages[index]!;
    if (message.content === FILE_READING_REMOVED_STUB) continue;
    messages[index] = {
      ...message,
      content: FILE_READING_REMOVED_STUB,
      ...(message.multimodal_content ? { multimodal_content: undefined } : {}),
    };
  }
}

export interface AttachmentTurnStep {
  readingOpen: boolean;
  closedThisStep: boolean;
  /** What the file-tool results of this step may add together; 0 once reading is closed. */
  resultsAllowanceTokens: number;
  /** Current-turn files whose text this step sends only in part. */
  cutLiveFilenames: string[];
}

function closeReading(
  messages: LedgerMessage[],
  ledger: AttachmentTurnLedgerState,
  policy: AttachmentTurnBudgetPolicy,
): void {
  ledger.readingClosed = true;
  const plan = planCards(
    locateCards(messages),
    previouslyDroppedCards(messages),
    new Set(),
    ledger,
    policy,
  );
  rewriteCards(messages, plan, ledger.fileToolsOffered);
  rewriteTextSections(messages, new Map());
  stubFileToolResults(messages);
}

/**
 * Rewrites the attachment-derived content of one step under the turn ledger
 * (spec "The turn ledger", rules 1 to 7) and charges what the step sends.
 * Reading closes the first time twice the resend exceeds the remainder, and
 * stays closed; the step that closes it charges nothing.
 */
export function applyAttachmentTurnStep(
  messages: LedgerMessage[],
  ledger: AttachmentTurnLedgerState,
  policy: AttachmentTurnBudgetPolicy = CHAT_LARGE_FILE_POLICY.turnBudget,
): AttachmentTurnStep {
  const closed: AttachmentTurnStep = {
    readingOpen: false,
    closedThisStep: false,
    resultsAllowanceTokens: 0,
    cutLiveFilenames: [],
  };
  if (ledger.readingClosed) {
    closeReading(messages, ledger, policy);
    return closed;
  }
  const sections = textSections(messages);
  const plan = planCards(
    locateCards(messages),
    previouslyDroppedCards(messages),
    new Set(sections.map((section) => section.assetId)),
    ledger,
    policy,
  );
  const resultTokens = fileToolResultIndexes(messages).reduce(
    (total, index) => total + estimateAttachmentTokens(messages[index]!.content),
    0,
  );
  const resend = plan.tokens + resultTokens;
  const remainder = Math.max(0, ledger.limitTokens - ledger.charged);
  if (2 * resend > remainder) {
    closeReading(messages, ledger, policy);
    return { ...closed, closedThisStep: true };
  }

  rewriteCards(messages, plan, ledger.fileToolsOffered);
  const blockBound = Math.floor((remainder - 2 * resend) / 2);
  const fit = fitTextSections(sections, blockBound, policy);
  const fitted = new Map(fit.sections.map((section) => [section.assetId, section]));
  rewriteTextSections(messages, fitted);
  const cut = sections.filter((section) => fitted.get(section.assetId)?.text !== section.text);
  if (cut.length > 0) {
    markCardsPartial(
      messages,
      new Set(cut.map((section) => section.assetId)),
      ledger.fileToolsOffered,
      plan.form !== 'full',
    );
  }
  const cutLiveFilenames = cut.filter((section) => section.live).map((section) => section.filename);

  ledger.charged += resend + fit.tokens;
  return {
    readingOpen: true,
    closedThisStep: false,
    resultsAllowanceTokens: resultsAllowance(remainder, resend, fit.tokens),
    cutLiveFilenames,
  };
}

/**
 * A third of what is left after three resends and the block, not the half of
 * rule 5: the results join the next step's resend, and only this bound keeps
 * that resend within half the next remainder, so a result is sent at least
 * once before reading can close.
 */
function resultsAllowance(remainder: number, resend: number, blockTokens: number): number {
  return Math.max(0, Math.floor((remainder - 3 * resend - blockTokens) / 3));
}

function markCardsPartial(
  messages: LedgerMessage[],
  assetIds: ReadonlySet<string>,
  fileToolsOffered: boolean,
  oneLine: boolean,
): void {
  messages.forEach((message, index) => {
    const parts = message.multimodal_content;
    if (!parts) return;
    let changed = false;
    const next = parts.map((part) => {
      const card = cardMarkerOf(part);
      if (!card || card.partial || !assetIds.has(card.assetId)) return part;
      changed = true;
      const updated = { ...card, partial: true };
      return {
        ...(part as Part),
        text: renderLargeFileCard(updated, { oneLine, fileToolsOffered }),
        [LARGE_FILE_CARD_KEY]: updated,
      };
    });
    if (changed)
      messages[index] = { ...message, multimodal_content: next, content: textOfParts(next) };
  });
}

/** The tokens a part holds as the ledger counts them, for tests and diagnostics. */
export function attachmentPartTokens(part: unknown): number {
  return partTokens(part);
}

/**
 * The share of this step's allowance the file tools draw from. Every charge is
 * also a charge on the ledger, so a result is paid for on the step it returns.
 */
export function createStepReadingBudget(
  ledger: AttachmentTurnLedgerState,
  allowanceTokens: number,
): FileReadingBudget {
  ledger.stepAllowanceLeft = Math.max(0, allowanceTokens);
  return {
    remainingTokens: () => Math.max(0, ledger.stepAllowanceLeft ?? 0),
    tokensFor: estimateAttachmentTokens,
    charge(tokens: number) {
      ledger.stepAllowanceLeft = Math.max(0, (ledger.stepAllowanceLeft ?? 0) - tokens);
      ledger.charged += tokens;
    },
  };
}
