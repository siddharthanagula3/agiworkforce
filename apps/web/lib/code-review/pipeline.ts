import 'server-only';

import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { estimateTokens, resolveAutoRoute, type AutoRoutingRequest } from '@agiworkforce/routing';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { buildPrReviewPrompt } from '@/app/api/github/webhook/pr-diff-prompt';
import { normalizeModelId } from '@agiworkforce/types';
import {
  buildServerProviderAdapter,
  resolveProviderFromModel,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { logger } from '@/lib/logger';
import { dispatchProviderForSelectedRoute } from '@/lib/services/aggregator-routing';
import {
  reserveBackgroundUsage,
  type BackgroundUsageLease,
} from '@/lib/services/background-usage-lease';
import { fingerprintManagedUsageRequest } from '@/lib/services/managed-usage-request-service';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';
import { sideCallRoutingRequest } from '@/lib/server/side-call-training-policy';
import { chunkDiff, parseUnifiedDiff, type ReviewDiffFile } from './diff';
import {
  anchorFindings,
  fingerprintsInPostedComments,
  parseReviewResponse,
  renderFindingComment,
  sortFindings,
  REVIEW_PASSES,
  type AnchoredFinding,
  type ReviewPass,
} from './findings';

const CHUNK_MAX_BYTES = 40 * 1024;
const MAX_CHUNKS = 8;
const MAX_OUTPUT_TOKENS = 2048;
const MAX_POSTED_COMMENTS = 30;
const PROVIDER_TIMEOUT_MS = 60_000;
const MS_PER_SECOND = 1_000;
const LEASE_SLACK_SECONDS = 60;

export const CODE_REVIEW_QUOTA_FEATURE = 'code_review';

export interface ReviewCoverage {
  /** The fetched diff was cut at the fetch limit before review. */
  diffTruncated: boolean;
  /** Hunks with a part left out because the review's chunk ceiling was reached. */
  omittedHunks: number;
  /** Lines too long for one chunk, cut short. */
  clippedLines: number;
  /** Model answers that could not be read, so their pass added no findings for that part. */
  failedCalls: number;
  /** Fresh findings past the posting limit. */
  omittedFindings: number;
}

export function reviewCoverageIsPartial(coverage: ReviewCoverage): boolean {
  return (
    coverage.diffTruncated ||
    coverage.omittedHunks > 0 ||
    coverage.clippedLines > 0 ||
    coverage.failedCalls > 0 ||
    coverage.omittedFindings > 0
  );
}

const COMPLETE_COVERAGE: ReviewCoverage = {
  diffTruncated: false,
  omittedHunks: 0,
  clippedLines: 0,
  failedCalls: 0,
  omittedFindings: 0,
};

export interface CodeReviewOutcome {
  status: 'posted' | 'no-findings' | 'no-diff' | 'unavailable';
  coverage: ReviewCoverage;
  /** Findings that survived the anchor check and were not already posted. */
  posted: AnchoredFinding[];
  /** Anchored findings suppressed because the same claim is already on the PR. */
  duplicates: number;
  /** Findings dropped because their file or line is not in this diff. */
  fabricated: number;
  chunks: number;
  outputTokens: number;
  reason?: 'no-route' | 'provider-error' | 'unparsable' | 'usage-budget';
  /** The configured review model may train on inputs and the account opted out, so Auto reviewed instead. */
  configuredModelSetAside?: boolean;
}

export interface CodeReviewModelCall {
  prompt: string;
  pass: ReviewPass;
  /** Names this call within its review, so a retried review reserves it once. */
  ref: string;
}

export interface CodeReviewInput {
  diff: string;
  /** The diff was cut at the fetch limit before it reached the review. */
  diffTruncated?: boolean;
  prNumber: number;
  planTier: string;
  /** Bodies of the line comments already on the pull request. */
  postedCommentBodies: readonly string[];
  /** The installation's configured review model, when it has one. */
  preferredModel?: string | null;
  /** Who installed the review, and whether their content stays off providers that may train. */
  ownerUserId: string;
  noTrainingOnly: boolean;
  /** The owner's scoped connection that each model call is reserved and settled on. */
  billingDb: DatabaseAdapter;
  /** Names this review, so its calls' reservations are keyed to it. */
  reviewRef: string;
  /** Injected so a test drives the pipeline without a provider. */
  callModel?: (call: CodeReviewModelCall) => Promise<{ text: string; outputTokens: number }>;
  signal?: AbortSignal;
}

interface ReviewRoute {
  dispatchProvider: string;
  provider: string;
  routeId: string | null;
  modelKey: string;
  providerModelId: string;
}

function configuredReviewRoute(preferredModel: string | null | undefined): ReviewRoute | null {
  const normalized = preferredModel ? normalizeModelId(preferredModel) : null;
  if (!normalized) return null;
  try {
    const provider = resolveProviderFromModel(normalized);
    return {
      dispatchProvider: provider,
      provider,
      routeId: null,
      modelKey: normalized,
      providerModelId: normalized,
    };
  } catch (error) {
    logger.warn({ error, preferredModel }, '[code-review] configured review model is unroutable');
    return null;
  }
}

function routeKeepsInputsOutOfTraining(route: ReviewRoute): boolean {
  return (
    modelKeepsInputsOutOfTraining(route.modelKey) &&
    providerKeepsInputsOutOfTraining(route.dispatchProvider)
  );
}

function configuredModelSetAside(
  input: Pick<CodeReviewInput, 'preferredModel' | 'noTrainingOnly'>,
): boolean {
  if (!input.noTrainingOnly) return false;
  const configured = configuredReviewRoute(input.preferredModel);
  return configured !== null && !routeKeepsInputsOutOfTraining(configured);
}

/**
 * The installation's chosen model when it names one the catalogue knows and
 * the account's training choice allows it, and the Auto coding route
 * otherwise. Either way the provider is resolved from the catalogue, so no
 * provider is named in this file.
 */
async function resolveReviewRoute(
  input: Pick<CodeReviewInput, 'planTier' | 'preferredModel' | 'ownerUserId' | 'noTrainingOnly'>,
): Promise<ReviewRoute | null> {
  const { planTier, noTrainingOnly } = input;
  const configured = configuredReviewRoute(input.preferredModel);
  if (configured && (!noTrainingOnly || routeKeepsInputsOutOfTraining(configured))) {
    return configured;
  }
  const baseRouting: AutoRoutingRequest = {
    selection: 'auto',
    taskType: 'coding',
    subscriptionTier: planTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
  };
  const routing = noTrainingOnly
    ? await sideCallRoutingRequest(null, input.ownerUserId, baseRouting, { forceNoTraining: true })
    : baseRouting;
  if (!routing) return null;
  const route = resolveAutoRoute(routing);
  if (route.status === 'unavailable') {
    logger.warn({ code: route.code }, '[code-review] no managed route available');
    return null;
  }
  const dispatchProvider = dispatchProviderForSelectedRoute(route);
  if (noTrainingOnly && !providerKeepsInputsOutOfTraining(dispatchProvider)) return null;
  return {
    dispatchProvider,
    provider: route.provider,
    routeId: route.routeId,
    modelKey: route.modelKey,
    providerModelId: route.providerModelId,
  };
}

async function callReviewModel(
  input: CodeReviewInput,
  call: CodeReviewModelCall,
): Promise<{ text: string; outputTokens: number } | null> {
  const route = await resolveReviewRoute(input);
  if (!route) return null;

  let lease: BackgroundUsageLease;
  try {
    lease = await reserveBackgroundUsage({
      db: input.billingDb,
      userId: input.ownerUserId,
      organizationId: null,
      planTier: input.planTier,
      idempotencyKey: `code-review:${input.reviewRef}:${call.ref}`,
      requestHash: fingerprintManagedUsageRequest({
        kind: CODE_REVIEW_QUOTA_FEATURE,
        reviewRef: input.reviewRef,
        call: call.ref,
        provider: route.provider,
        model: route.modelKey,
      }),
      provider: route.provider,
      model: route.modelKey,
      routeId: route.routeId,
      estimatedPromptTokens: estimateTokens(call.prompt, route.modelKey),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      leaseSeconds: Math.ceil(PROVIDER_TIMEOUT_MS / MS_PER_SECOND) + LEASE_SLACK_SECONDS,
      quotaFeature: CODE_REVIEW_QUOTA_FEATURE,
    });
  } catch (error) {
    logger.warn({ error, pass: call.pass }, '[code-review] usage reservation refused');
    throw new BudgetRefusedError();
  }

  const request = openAIWireRequestToChatRequest({
    model: route.providerModelId,
    messages: [{ role: 'user', content: call.prompt }],
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    stream: false,
  });
  const adapter = buildServerProviderAdapter(route.dispatchProvider);
  let response;
  try {
    await lease.providerStarted();
    response = await drainToLlmResponse(
      adapter.stream(request, input.signal ?? AbortSignal.timeout(PROVIDER_TIMEOUT_MS)),
      route.modelKey,
      (chunk) => toGenericUpstreamError(route.dispatchProvider, chunk),
      resolveWireMode(route.dispatchProvider),
    );
  } catch (error) {
    await lease
      .failed({ type: CODE_REVIEW_QUOTA_FEATURE, call: call.ref })
      .catch((releaseError: unknown) => {
        logger.error({ releaseError }, '[code-review] reservation release failed');
      });
    throw error;
  }
  const usage = {
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    totalTokens: response.totalTokens,
    cacheReadInputTokens: response.cachedInputTokens,
    cacheCreationInputTokens: response.cacheCreationInputTokens,
    cacheCreation1hInputTokens: response.cacheCreation1hInputTokens,
  };
  await lease.completed({
    provider: route.provider,
    model: route.modelKey,
    routeId: route.routeId,
    usage,
    record: { ...usage, type: CODE_REVIEW_QUOTA_FEATURE, call: call.ref },
  });
  return { text: response.content, outputTokens: response.completionTokens };
}

/**
 * Turn a pull request diff into findings anchored to real lines.
 *
 * Every stage exists to keep a posted comment honest. The diff is parsed so a
 * line number means something; the model answers in a schema so a finding can
 * be checked rather than believed; the anchor check drops what the diff cannot
 * carry; and the fingerprint check keeps a re-review of the same push from
 * saying the same thing twice.
 */
export async function reviewPullRequestDiff(input: CodeReviewInput): Promise<CodeReviewOutcome> {
  const empty: CodeReviewOutcome = {
    status: 'no-diff',
    coverage: COMPLETE_COVERAGE,
    posted: [],
    duplicates: 0,
    fabricated: 0,
    chunks: 0,
    outputTokens: 0,
  };

  const files: ReviewDiffFile[] = parseUnifiedDiff(input.diff);
  const { chunks, omittedHunks, clippedLines } = chunkDiff(files, {
    maxBytes: CHUNK_MAX_BYTES,
    maxChunks: MAX_CHUNKS,
  });
  if (chunks.length === 0) return empty;

  const setAside = configuredModelSetAside(input);
  if (setAside) {
    logger.warn(
      { preferredModel: input.preferredModel },
      '[code-review] configured review model may train on inputs and the account opted out; reviewing with Auto',
    );
  }

  const callModel =
    input.callModel ??
    (async (call: CodeReviewModelCall) => {
      const result = await callReviewModel(input, call);
      if (!result) throw new NoRouteError();
      return result;
    });

  const anchored: AnchoredFinding[] = [];
  let fabricated = 0;
  let outputTokens = 0;
  let unparsable = 0;

  for (const [index, chunk] of chunks.entries()) {
    for (const pass of REVIEW_PASSES) {
      let answer: { text: string; outputTokens: number };
      try {
        answer = await callModel({
          pass,
          ref: `${index}:${pass}`,
          prompt: buildPrReviewPrompt({
            pass,
            prNumber: input.prNumber,
            chunkIndex: index,
            chunkCount: chunks.length,
            diff: chunk.text,
          }),
        });
      } catch (error) {
        if (error instanceof NoRouteError) {
          return { ...empty, status: 'unavailable', chunks: chunks.length, reason: 'no-route' };
        }
        if (error instanceof BudgetRefusedError) {
          return {
            ...empty,
            status: 'unavailable',
            chunks: chunks.length,
            outputTokens,
            reason: 'usage-budget',
          };
        }
        logger.error({ error, pass, chunk: index }, '[code-review] provider call failed');
        return {
          ...empty,
          status: 'unavailable',
          chunks: chunks.length,
          outputTokens,
          reason: 'provider-error',
        };
      }

      outputTokens += answer.outputTokens;
      const parsed = parseReviewResponse(answer.text);
      if (!parsed) {
        unparsable += 1;
        continue;
      }
      const checked = anchorFindings(parsed.findings, files, pass);
      fabricated += checked.fabricated.length;
      if (checked.fabricated.length > 0) {
        logger.warn(
          { pass, chunk: index, dropped: checked.fabricated.length },
          '[code-review] dropped findings that name a line this diff does not contain',
        );
      }
      anchored.push(...checked.anchored);
    }
  }

  if (unparsable > 0 && anchored.length === 0) {
    return {
      ...empty,
      status: 'unavailable',
      chunks: chunks.length,
      outputTokens,
      reason: 'unparsable',
    };
  }

  const alreadyPosted = fingerprintsInPostedComments(input.postedCommentBodies);
  const seen = new Set<string>();
  const fresh: AnchoredFinding[] = [];
  let duplicates = 0;
  for (const finding of sortFindings(anchored)) {
    if (alreadyPosted.has(finding.fingerprint) || seen.has(finding.fingerprint)) {
      duplicates += 1;
      continue;
    }
    seen.add(finding.fingerprint);
    fresh.push(finding);
  }

  return {
    status: fresh.length > 0 ? 'posted' : 'no-findings',
    coverage: {
      diffTruncated: input.diffTruncated === true,
      omittedHunks,
      clippedLines,
      failedCalls: unparsable,
      omittedFindings: Math.max(0, fresh.length - MAX_POSTED_COMMENTS),
    },
    posted: fresh.slice(0, MAX_POSTED_COMMENTS),
    duplicates,
    fabricated,
    chunks: chunks.length,
    outputTokens,
    ...(setAside ? { configuredModelSetAside: true } : {}),
  };
}

class NoRouteError extends Error {}

class BudgetRefusedError extends Error {}

export function reviewLineComments(
  findings: readonly AnchoredFinding[],
): { path: string; line: number; body: string }[] {
  return findings.map((finding) => ({
    path: finding.path,
    line: finding.line,
    body: renderFindingComment(finding),
  }));
}

const SIGNATURE =
  '*Reviewed by [AGI](https://agiworkforce.com) · [Disconnect](https://agiworkforce.com/chat)*';

const CONFIGURED_MODEL_SET_ASIDE_NOTE =
  'The review model set for this installation was not used: its provider may train on what you send, and this account has Only use models that do not train on your chats turned on. This review used Auto with a model that does not train on your code.';

function setAsideNote(outcome: CodeReviewOutcome): string {
  return outcome.configuredModelSetAside ? `\n\n${CONFIGURED_MODEL_SET_ASIDE_NOTE}` : '';
}

export interface ReviewedHead {
  reviewedSha: string;
  currentSha: string | null;
}

const SHORT_SHA_LENGTH = 7;

function reviewedHeadNote(head: ReviewedHead | undefined): string {
  if (!head) return '';
  const reviewed = `Reviewed commit \`${head.reviewedSha.slice(0, SHORT_SHA_LENGTH)}\`.`;
  if (head.currentSha && head.currentSha !== head.reviewedSha) {
    return `\n\n${reviewed} The pull request has since moved to \`${head.currentSha.slice(0, SHORT_SHA_LENGTH)}\`, which this review does not cover.`;
  }
  return `\n\n${reviewed}`;
}

function coverageNote(coverage: ReviewCoverage): string {
  const gaps: string[] = [];
  if (coverage.diffTruncated) {
    gaps.push('The diff was longer than the limit this review reads, so its end was not reviewed.');
  }
  if (coverage.omittedHunks > 0) {
    gaps.push(
      `${coverage.omittedHunks} hunk(s) were not reviewed in full because the diff is larger than one review covers.`,
    );
  }
  if (coverage.clippedLines > 0) {
    gaps.push(`${coverage.clippedLines} very long line(s) were cut short.`);
  }
  if (coverage.failedCalls > 0) {
    gaps.push(
      `${coverage.failedCalls} review step(s) returned an answer that could not be read, so what they would have found is missing.`,
    );
  }
  if (coverage.omittedFindings > 0) {
    gaps.push(
      `${coverage.omittedFindings} more finding(s) were not posted because a review posts at most ${MAX_POSTED_COMMENTS} line comments.`,
    );
  }
  return gaps.length > 0 ? `\n\n**Partial review.** ${gaps.join(' ')}` : '';
}

export function reviewSummaryBody(outcome: CodeReviewOutcome, head?: ReviewedHead): string {
  const partial = reviewCoverageIsPartial(outcome.coverage);
  const trailer = `${coverageNote(outcome.coverage)}${reviewedHeadNote(head)}${setAsideNote(outcome)}\n\n---\n${SIGNATURE}`;
  if (outcome.status === 'no-findings') {
    const scanned =
      outcome.chunks === 1 ? '1 part of the diff' : `${outcome.chunks} parts of the diff`;
    const reviewed = partial ? `${scanned} it reviewed` : scanned;
    // A re-review that found only what is already commented has found nothing
    // new, which is not the same as having found nothing.
    const body =
      outcome.duplicates > 0
        ? `Nothing new in ${reviewed}. The ${outcome.duplicates} finding(s) it raised are already line comments on this pull request.`
        : `No correctness or security defect found in ${reviewed}.`;
    return `## AGI Code Review\n\n${body}${trailer}`;
  }
  const counts = new Map<string, number>();
  for (const finding of outcome.posted) {
    counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  }
  const tally = [...counts.entries()].map(([severity, count]) => `${count} ${severity}`).join(', ');
  const suppressed =
    outcome.duplicates > 0
      ? `\n\n${outcome.duplicates} finding(s) already commented on this pull request were not repeated.`
      : '';
  return `## AGI Code Review\n\n${outcome.posted.length} finding(s) anchored to the diff: ${tally}. Each one is a line comment with the evidence it rests on.${suppressed}${trailer}`;
}
