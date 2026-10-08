import 'server-only';

import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import { resolveAutoRoute, type AutoRoutingRequest } from '@agiworkforce/routing';
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

export interface CodeReviewOutcome {
  status: 'posted' | 'no-findings' | 'no-diff' | 'unavailable';
  /** Findings that survived the anchor check and were not already posted. */
  posted: AnchoredFinding[];
  /** Anchored findings suppressed because the same claim is already on the PR. */
  duplicates: number;
  /** Findings dropped because their file or line is not in this diff. */
  fabricated: number;
  chunks: number;
  outputTokens: number;
  reason?: 'no-route' | 'provider-error' | 'unparsable';
  /** The configured review model may train on inputs and the account opted out, so Auto reviewed instead. */
  configuredModelSetAside?: boolean;
}

export interface CodeReviewModelCall {
  prompt: string;
  pass: ReviewPass;
}

export interface CodeReviewInput {
  diff: string;
  prNumber: number;
  planTier: string;
  /** Bodies of the line comments already on the pull request. */
  postedCommentBodies: readonly string[];
  /** The installation's configured review model, when it has one. */
  preferredModel?: string | null;
  /** Who installed the review, and whether their content stays off providers that may train. */
  ownerUserId: string;
  noTrainingOnly: boolean;
  /** Injected so a test drives the pipeline without a provider. */
  callModel?: (call: CodeReviewModelCall) => Promise<{ text: string; outputTokens: number }>;
  signal?: AbortSignal;
}

interface ReviewRoute {
  dispatchProvider: string;
  modelKey: string;
  providerModelId: string;
}

function configuredReviewRoute(preferredModel: string | null | undefined): ReviewRoute | null {
  const normalized = preferredModel ? normalizeModelId(preferredModel) : null;
  if (!normalized) return null;
  try {
    return {
      dispatchProvider: resolveProviderFromModel(normalized),
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

  const request = openAIWireRequestToChatRequest({
    model: route.providerModelId,
    messages: [{ role: 'user', content: call.prompt }],
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    stream: false,
  });
  const adapter = buildServerProviderAdapter(route.dispatchProvider);
  const response = await drainToLlmResponse(
    adapter.stream(request, input.signal ?? AbortSignal.timeout(PROVIDER_TIMEOUT_MS)),
    route.modelKey,
    (chunk) => toGenericUpstreamError(route.dispatchProvider, chunk),
    resolveWireMode(route.dispatchProvider),
  );
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
    posted: [],
    duplicates: 0,
    fabricated: 0,
    chunks: 0,
    outputTokens: 0,
  };

  const files: ReviewDiffFile[] = parseUnifiedDiff(input.diff);
  const chunks = chunkDiff(files, { maxBytes: CHUNK_MAX_BYTES, maxChunks: MAX_CHUNKS });
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
    posted: fresh.slice(0, MAX_POSTED_COMMENTS),
    duplicates,
    fabricated,
    chunks: chunks.length,
    outputTokens,
    ...(setAside ? { configuredModelSetAside: true } : {}),
  };
}

class NoRouteError extends Error {}

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

export function reviewSummaryBody(outcome: CodeReviewOutcome): string {
  if (outcome.status === 'no-findings') {
    const scanned =
      outcome.chunks === 1 ? '1 part of the diff' : `${outcome.chunks} parts of the diff`;
    // A re-review that found only what is already commented has found nothing
    // new, which is not the same as having found nothing.
    const body =
      outcome.duplicates > 0
        ? `Nothing new in ${scanned}. The ${outcome.duplicates} finding(s) it raised are already line comments on this pull request.`
        : `No correctness or security defect found in ${scanned}.`;
    return `## AGI Code Review\n\n${body}${setAsideNote(outcome)}\n\n---\n${SIGNATURE}`;
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
  return `## AGI Code Review\n\n${outcome.posted.length} finding(s) anchored to the diff: ${tally}. Each one is a line comment with the evidence it rests on.${suppressed}${setAsideNote(outcome)}\n\n---\n${SIGNATURE}`;
}
