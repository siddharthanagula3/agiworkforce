import { classifyManagedQuotaErrorCode } from '@agiworkforce/types';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';

/**
 * A wait this surface repeats to a reader is one a server measured. An
 * invented "wait a few hours" is worse than no sentence, because a reader who
 * sits it out and fails again stops believing the next one, so anything that
 * is not a finite number of seconds inside a believable window is dropped
 * rather than rounded into a figure.
 */
const MAX_STATED_RETRY_AFTER_SECONDS = 86_400;

export function statableRetryAfterSeconds(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const seconds = Math.round(raw);
  if (seconds < 1 || seconds > MAX_STATED_RETRY_AFTER_SECONDS) return undefined;
  return seconds;
}

function counted(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

export function statedWait(retryAfterSeconds: unknown): string | undefined {
  const seconds = statableRetryAfterSeconds(retryAfterSeconds);
  if (seconds === undefined) return undefined;
  if (seconds < 90) return `about ${counted(seconds, 'second')}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `about ${counted(minutes, 'minute')}`;
  return `about ${counted(Math.round(seconds / 3600), 'hour')}`;
}

export const LOCAL_MODE_KEEPS_WORKING = 'Local mode keeps working.';
const FREE_USAGE_LIMIT_REACHED = 'You have reached the free usage limit on your account.';

interface UsageLimitRefusal {
  code?: string | null;
  retryAfterSeconds?: number | undefined;
  body?: Record<string, unknown> | undefined;
}

function secondsUntilReset(body: Record<string, unknown> | undefined, nowMs: number) {
  const error = body?.['error'];
  const resetsAt =
    error && typeof error === 'object' ? (error as { resets_at?: unknown }).resets_at : undefined;
  if (typeof resetsAt !== 'string') return undefined;
  const resetMs = Date.parse(resetsAt);
  return Number.isFinite(resetMs) ? Math.ceil((resetMs - nowMs) / 1_000) : undefined;
}

/**
 * What a Free account reads when its allowance is spent, or null for any other
 * refusal. It says when Cloud replies come back, from the wait or the reset
 * time the refusal carries, and that Local mode is unaffected.
 */
export function freeUsageLimitMessage(
  refusal: UsageLimitRefusal,
  nowMs: number = Date.now(),
): string | null {
  const block = classifyManagedQuotaErrorCode(refusal.code);
  if (block?.kind !== 'free_trial' || block.feature !== 'token_cap') return null;
  const wait = statedWait(refusal.retryAfterSeconds ?? secondsUntilReset(refusal.body, nowMs));
  const when = wait ? `Try again in ${wait}.` : 'Try again after it resets.';
  return `${FREE_USAGE_LIMIT_REACHED} ${when} ${LOCAL_MODE_KEEPS_WORKING}`;
}

/**
 * The id the server already put in its own log line for this failure, so a
 * reader reporting a problem hands over the one string that finds the turn.
 * Only ever appended to a failure: a turn that worked has nothing to report.
 */
export function withFailureReference(message: string, requestId: string | undefined): string {
  return requestId ? `${message} Reference: ${requestId}` : message;
}

/**
 * The gateway writes one sentence for every surface, and most of them end on
 * how to pay for more: a pricing page, an access code, a waitlist, credits.
 * App Review reads any of that as steering to an outside purchase (guideline
 * 3.1.1), and a build that sells nothing in the app may not offer an upgrade
 * at all, nor name the plans that would include a feature. So the phone keeps
 * what happened and every way forward that costs nothing, and drops the rest
 * by sentence and by alternative. It matches vocabulary rather than whole
 * sentences because the gateway rewords these, and an exact-sentence filter
 * silently stopped matching when it did.
 */
const OFF_DEVICE_PURCHASE =
  /\b(?:pricing page|access codes?|waitlist|(?:add|buy) (?:more )?credits|top[ -]?up|contact sales)\b/i;
const IN_APP_PURCHASE = /\b(?:upgrad(?:e|es|ed|ing)|subscribe|paid plans?)\b/i;
const CREDIT_PURCHASE = /\b(?:(?:add|buy) (?:more )?credits|top[ -]?up)\b/i;
const SOFTWARE_UPGRADE = /\b(?:upgrade (?:this|the|your) (?:client|app)|before an upgrade)\b/gi;

const PLAN_PLACEMENT = [
  /^(.+?) (?:is|are) available on (?:the )?[A-Z][^.]* plans?$/,
  /^(.+?) (?:is|are) on the [A-Z][^.]* plan, not yours$/,
  /^(.+?) requires? (?:a|an|the) [^.]*\bplan$/,
];

const STAGED_UPGRADE_SENTENCE = /^Paid upgrades are opening in stages\b/;
const STAGED_UPGRADE_FACT = 'Paid upgrades are opening in stages.';

const NOT_A_STANDALONE_CLAUSE = /^(?:if|when|unless|because|and|but|so|then)\b/i;

export const NOT_INCLUDED_IN_PLAN = 'It isn’t included in your plan.';
const USAGE_LIMIT_NEXT_STEP = 'See Usage in Settings for when it resets.';

// The phone runs Local and AGI Cloud only and never takes a provider key, so
// a suggestion to use one leads nowhere here.
const OWN_PROVIDER_KEY = /\bown (?:provider |API )?keys?\b/i;

function steersToPurchase(text: string): boolean {
  if (OFF_DEVICE_PURCHASE.test(text)) return true;
  return !NATIVE_PURCHASES_AVAILABLE && IN_APP_PURCHASE.test(text.replace(SOFTWARE_UPGRADE, ''));
}

function leadsNowhereHere(text: string): boolean {
  return steersToPurchase(text) || OWN_PROVIDER_KEY.test(text);
}

function sentencesOf(message: string): string[] {
  const boundary = /[.!?]\s+(?=[A-Z0-9“"'(])/g;
  const sentences: string[] = [];
  let start = 0;
  for (let match = boundary.exec(message); match; match = boundary.exec(message)) {
    sentences.push(message.slice(start, match.index + 1).trim());
    start = match.index + match[0].length;
  }
  sentences.push(message.slice(start).trim());
  return sentences.filter(Boolean);
}

function alternativesOf(body: string): string[] {
  const listed = body.split(/,\s+or\s+/);
  if (listed.length === 1) return body.split(/\s+or\s+/);
  const [head = '', ...rest] = listed;
  return [...head.split(/,\s+/), ...rest];
}

function joinedAlternatives(kept: readonly string[]): string {
  if (kept.length <= 2) return kept.join(' or ');
  return `${kept.slice(0, -1).join(', ')}, or ${kept[kept.length - 1]}`;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface SentenceVerdict {
  kept: string | null;
  droppedCredits: boolean;
}

function judgedSentence(sentence: string): SentenceVerdict {
  const [, body = sentence, ending = ''] = /^([\s\S]*?)([.!?]*)$/.exec(sentence) ?? [];

  if (NATIVE_PURCHASES_AVAILABLE && STAGED_UPGRADE_SENTENCE.test(body)) {
    return { kept: STAGED_UPGRADE_FACT, droppedCredits: false };
  }
  if (!NATIVE_PURCHASES_AVAILABLE) {
    for (const placement of PLAN_PLACEMENT) {
      const subject = placement.exec(body)?.[1];
      if (subject)
        return { kept: `${subject} isn’t included in your plan.`, droppedCredits: false };
    }
  }
  if (!leadsNowhereHere(body)) return { kept: sentence, droppedCredits: false };

  const alternatives = alternativesOf(body).map((part) => part.trim());
  const kept = alternatives.filter((part) => part && !leadsNowhereHere(part));
  const droppedCredits = alternatives.some((part) => CREDIT_PURCHASE.test(part));
  const salvageable =
    kept.length > 0 &&
    !kept.some((part) => NOT_A_STANDALONE_CLAUSE.test(part)) &&
    kept.every((part) => part === alternatives[0] || !/^[A-Z]/.test(part));
  return {
    kept: salvageable ? `${capitalised(joinedAlternatives(kept))}${ending || '.'}` : null,
    droppedCredits,
  };
}

/**
 * The message with every purchase step and every own-provider-key alternative
 * removed, or an empty string when nothing else was in it. A message that
 * names neither comes back exactly as sent.
 */
export function purchaseNeutralRemainder(message: string): string {
  const sentences = sentencesOf(message);
  const verdicts = sentences.map(judgedSentence);
  if (verdicts.every((verdict, index) => verdict.kept === sentences[index])) return message;
  const kept = verdicts.flatMap((verdict) => (verdict.kept ? [verdict.kept] : []));
  if (verdicts.some((verdict) => verdict.droppedCredits) && !kept.includes(USAGE_LIMIT_NEXT_STEP)) {
    kept.push(USAGE_LIMIT_NEXT_STEP);
  }
  return kept.join(' ');
}

export function withoutExternalPurchaseSteering(message: string): string {
  if (!message.trim()) return message;
  return purchaseNeutralRemainder(message) || NOT_INCLUDED_IN_PLAN;
}

export const DAILY_UPLOAD_LIMIT_CODE = 'daily_upload_limit_reached';

export const DAILY_UPLOAD_LIMIT_MESSAGE =
  'Today’s file uploads are used. Upload more after midnight UTC.';

interface UploadRefusal {
  status: number;
  code?: string | null;
  body?: Record<string, unknown> | undefined;
  message: string;
}

function refusalDetailsCode(body: Record<string, unknown> | undefined): string | null {
  const error = body?.['error'];
  const details =
    error && typeof error === 'object' ? (error as { details?: unknown }).details : undefined;
  const code =
    details && typeof details === 'object' ? (details as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : null;
}

/**
 * What a person reads when the plan's uploads for the day are spent, or null
 * when the refusal is some other 429, which a retry can still clear. The server
 * ends this sentence on how to pay for more, so the phone keeps the part that
 * is true here: when uploads open again.
 */
export function dailyUploadLimitMessage(refusal: UploadRefusal): string | null {
  if (refusal.status !== 429) return null;
  const daily =
    refusal.code === DAILY_UPLOAD_LIMIT_CODE ||
    refusalDetailsCode(refusal.body) === DAILY_UPLOAD_LIMIT_CODE;
  if (!daily) return null;
  const remainder = purchaseNeutralRemainder(refusal.message);
  return remainder && remainder !== NOT_INCLUDED_IN_PLAN ? remainder : DAILY_UPLOAD_LIMIT_MESSAGE;
}
