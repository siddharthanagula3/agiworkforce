import 'server-only';

import { NextRequest, NextResponse, after } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  verifyGitHubWebhookSignature,
  getInstallationAccessToken,
  getPrDiff,
  listPrReviewCommentBodies,
  postIssueComment,
  postPrReview,
  GITHUB_WEBHOOK_SECRET,
} from '@/lib/github-app';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { assertWorkspaceCodeAccess } from '@/lib/services/organization-policy-code-gate';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';
import { effectivePlanTier } from '@agiworkforce/types';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  reviewLineComments,
  reviewPullRequestDiff,
  reviewSummaryBody,
} from '@/lib/code-review/pipeline';
import { ingestTriggerEvent } from '@/lib/triggers/trigger-ingest';
import { toGitHubTriggerEvent } from '@/lib/triggers/github-events';
import { routeGitHubWebhookEvent } from './webhook-router';
import { recordDeliveryOnce } from './delivery-dedup';
import { escapeUntrustedPrDiff } from './pr-diff-prompt';

const GITHUB_BOT_LOGIN = process.env['GITHUB_BOT_LOGIN'] ?? 'agi-workforce[bot]';
const BOT_MENTION = '@agi-workforce';

/**
 * GitHub's own statement of the commenter's standing on the repository. OWNER,
 * MEMBER and COLLABORATOR are the ones who can already push; everyone else is a
 * passer-by whose mention must not spend the installation's review quota.
 */
const REVIEW_TRIGGER_ASSOCIATIONS: ReadonlySet<string> = new Set([
  'OWNER',
  'MEMBER',
  'COLLABORATOR',
]);

const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000;

const MAX_REVIEWS_PER_INSTALLATION_PER_30_DAYS = Number(
  process.env['GITHUB_PR_REVIEW_MONTHLY_CAP'] ?? '100',
);
const QUOTA_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'github-webhook');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') ?? '';

  if (
    !GITHUB_WEBHOOK_SECRET ||
    !verifyGitHubWebhookSignature(rawBody, signature, GITHUB_WEBHOOK_SECRET)
  ) {
    logger.warn({ signature }, 'GitHub webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const routedEvent = routeGitHubWebhookEvent(event, rawPayload);
  if (routedEvent.kind === 'invalid') {
    logger.warn({ event, reason: routedEvent.reason }, 'Invalid GitHub webhook payload');
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }
  if (routedEvent.kind === 'ignored') {
    logger.debug(
      {
        event: routedEvent.event,
        action: routedEvent.action,
        reason: routedEvent.reason,
      },
      'Ignored unsupported GitHub webhook event',
    );
    return NextResponse.json({ received: true });
  }
  if (routedEvent.kind === 'ping') {
    return NextResponse.json({ received: true, event: 'ping' });
  }

  {
    const payloadRecord = rawPayload as Record<string, unknown>;
    const dedupOutcome = await recordDeliveryOnce(getNeonDb(), {
      deliveryId: request.headers.get('x-github-delivery'),
      event: event ?? 'unknown',
      action: typeof payloadRecord['action'] === 'string' ? payloadRecord['action'] : null,
      installationId:
        typeof (payloadRecord['installation'] as Record<string, unknown> | undefined)?.['id'] ===
        'number'
          ? ((payloadRecord['installation'] as Record<string, unknown>)['id'] as number)
          : null,
    });
    if (dedupOutcome === 'duplicate') {
      logger.info(
        { deliveryId: request.headers.get('x-github-delivery'), event },
        'Duplicate GitHub webhook delivery acknowledged without reprocessing',
      );
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  if (routedEvent.kind === 'automation-event') {
    const reviewTarget = automatedReviewTarget(
      routedEvent.event,
      routedEvent.action,
      routedEvent.payload,
    );
    if (reviewTarget) after(scheduleReview(reviewTarget));

    const triggerEvent = toGitHubTriggerEvent({
      event: routedEvent.event,
      action: routedEvent.action,
      deliveryId: request.headers.get('x-github-delivery') ?? `${routedEvent.event}:${Date.now()}`,
      payload: routedEvent.payload,
    });
    if (!triggerEvent) {
      return NextResponse.json({
        received: true,
        event: routedEvent.event,
        matched: 0,
        review: reviewTarget ? 'queued' : 'none',
      });
    }
    try {
      const outcomes = await ingestTriggerEvent(getNeonDb(), triggerEvent);
      return NextResponse.json({
        received: true,
        event: triggerEvent.type,
        matched: outcomes.length,
        queued: outcomes.filter((outcome) => outcome.outcome === 'enqueued').length,
        review: reviewTarget ? 'queued' : 'none',
      });
    } catch (error) {
      logger.error(
        { error, event: triggerEvent.type },
        'GitHub automation event could not be ingested',
      );
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500, headers: { 'Retry-After': '10' } },
      );
    }
  }

  if (routedEvent.kind === 'installation-deleted') {
    try {
      const db = getNeonDb();
      await db.transaction(async (tx) => {
        await tx.execute('delete from github_pr_review_attempts where installation_id = $1', [
          routedEvent.installationId,
        ]);
        await tx.execute('delete from github_installations where installation_id = $1', [
          routedEvent.installationId,
        ]);
      });
    } catch (error) {
      logger.error(
        { error, installationId: routedEvent.installationId },
        'Failed to remove deleted GitHub installation',
      );
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500, headers: { 'Retry-After': '10' } },
      );
    }
    logger.info(
      { installationId: routedEvent.installationId },
      'Removed deleted GitHub installation',
    );
    return NextResponse.json({ received: true, event: 'installation.deleted' });
  }

  const payload = routedEvent.payload;

  const commentBody: string =
    ((payload['comment'] as Record<string, unknown>)?.['body'] as string) ?? '';
  if (!commentBody.toLowerCase().includes(BOT_MENTION.toLowerCase())) {
    return NextResponse.json({ received: true });
  }

  const sender = payload['sender'] as Record<string, unknown> | undefined;
  if (sender?.['type'] === 'Bot' || sender?.['login'] === GITHUB_BOT_LOGIN) {
    return NextResponse.json({ received: true });
  }

  // A mention from anyone at all used to mint an installation token, fetch the
  // diff and spend a model call, so any passer-by on a public repository could
  // spend the installation's quota. GitHub reports the commenter's standing on
  // the repository, and only someone who belongs to it may start a review.
  const comment = payload['comment'] as Record<string, unknown> | undefined;
  const authorAssociation = String(comment?.['author_association'] ?? '');
  if (!REVIEW_TRIGGER_ASSOCIATIONS.has(authorAssociation)) {
    logger.info(
      { authorAssociation },
      'GitHub webhook: ignoring a review mention from outside the repository',
    );
    return NextResponse.json({ received: true });
  }

  const issue = payload['issue'] as Record<string, unknown> | undefined;
  if (!issue?.['pull_request']) {
    return NextResponse.json({ received: true });
  }

  const installation = payload['installation'] as Record<string, unknown> | undefined;
  const repository = payload['repository'] as Record<string, unknown> | undefined;
  const installationId = installation?.['id'] as number | undefined;
  const fullName = repository?.['full_name'] as string | undefined;
  const prNumber = issue?.['number'] as number | undefined;

  if (!installationId || !fullName || !prNumber) {
    return NextResponse.json({ received: true });
  }

  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) {
    return NextResponse.json({ received: true });
  }

  after(scheduleReview({ installationId, owner, repo, prNumber, trigger: 'mention' }));

  return NextResponse.json({ received: true, review: 'queued' });
}

const AUTO_REVIEW_ACTIONS: ReadonlySet<string> = new Set([
  'opened',
  'reopened',
  'synchronize',
  'ready_for_review',
]);

interface ReviewTarget {
  installationId: number;
  owner: string;
  repo: string;
  prNumber: number;
  trigger: 'mention' | 'pull-request';
}

/**
 * A pull request event that should be reviewed without anyone asking.
 *
 * A draft is excluded: it is work in progress by declaration, and reviewing it
 * on every push spends the installation's quota on code its author has not
 * offered for review yet.
 */
function automatedReviewTarget(
  event: string,
  action: string | null,
  payload: Record<string, unknown>,
): ReviewTarget | null {
  if (event !== 'pull_request' || !action || !AUTO_REVIEW_ACTIONS.has(action)) return null;

  const pullRequest = payload['pull_request'] as Record<string, unknown> | undefined;
  if (!pullRequest || pullRequest['draft'] === true) return null;

  const installationId = (payload['installation'] as Record<string, unknown> | undefined)?.['id'];
  const fullName = (payload['repository'] as Record<string, unknown> | undefined)?.['full_name'];
  const prNumber = pullRequest['number'];
  if (typeof installationId !== 'number' || typeof fullName !== 'string') return null;
  if (typeof prNumber !== 'number') return null;

  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) return null;
  return { installationId, owner, repo, prNumber, trigger: 'pull-request' };
}

function scheduleReview(target: ReviewTarget): Promise<void> {
  return runAutomatedReview(target).catch((error: unknown) => {
    logger.error({ error, ...target }, 'PR review background error');
  });
}

interface InstallationRow {
  user_id: string;
  pr_review_enabled: boolean;
  review_model: string | null;
}

async function readReviewInstallation(
  db: ReturnType<typeof getNeonDb>,
  installationId: number,
): Promise<InstallationRow | null> {
  const rows = await db
    .query<InstallationRow>(
      `select user_id, pr_review_enabled, review_model
         from github_installations
        where installation_id = $1
          and ownership_verified_at is not null
        limit 1`,
      [installationId],
    )
    .catch(() => [] as InstallationRow[]);
  const row = rows[0] ?? null;
  return row?.pr_review_enabled ? row : null;
}

/**
 * Whether this attempt may spend a model call: not while another attempt for
 * the same pull request is still in flight, and not past the installation's
 * rolling cap. A push that lands while a review is running is the case the
 * debounce exists for, and it is why auto-review on every push is affordable.
 */
async function reviewBudgetAllows(
  db: ReturnType<typeof getNeonDb>,
  target: ReviewTarget,
  token: string,
): Promise<boolean> {
  const { installationId, owner, repo, prNumber } = target;
  const recordSkip = async (status: string): Promise<void> => {
    await db
      .execute(
        'insert into github_pr_review_attempts (installation_id, pr_number, repo_owner, repo_name, status, completed_at) values ($1, $2, $3, $4, $5, $6)',
        [installationId, prNumber, owner, repo, status, new Date().toISOString()],
      )
      .catch(() => undefined);
  };

  try {
    type AttemptRow = { id: string; attempted_at: string; status: string };
    const recentSamePR = await db
      .query<AttemptRow>(
        'select id, attempted_at, status from github_pr_review_attempts where installation_id = $1 and pr_number = $2 and attempted_at >= $3 order by attempted_at desc limit 1',
        [installationId, prNumber, new Date(Date.now() - DEBOUNCE_WINDOW_MS).toISOString()],
      )
      .catch(() => [] as AttemptRow[]);

    if (recentSamePR[0]?.status === 'pending') {
      logger.info(
        { installationId, prNumber, debounceWindowMs: DEBOUNCE_WINDOW_MS },
        'web-HIGH-3: skipping review · another attempt is in flight',
      );
      await recordSkip('skipped_debounce');
      return false;
    }

    const quotaRows = await db
      .query<{ cnt: string }>(
        'select count(*) as cnt from github_pr_review_attempts where installation_id = $1 and status = any($2) and attempted_at >= $3',
        [
          installationId,
          ['completed', 'pending'],
          new Date(Date.now() - QUOTA_WINDOW_MS).toISOString(),
        ],
      )
      .catch(() => [] as { cnt: string }[]);
    const quotaCount = quotaRows[0] ? parseInt(quotaRows[0].cnt, 10) : 0;

    if (quotaCount >= MAX_REVIEWS_PER_INSTALLATION_PER_30_DAYS) {
      logger.warn(
        { installationId, prNumber, quotaCount, cap: MAX_REVIEWS_PER_INSTALLATION_PER_30_DAYS },
        'web-HIGH-3: monthly review quota reached · skipping LLM call',
      );
      await recordSkip('skipped_quota');
      // Only a mention gets an answer. An automatic review that announced its
      // own quota on every push would comment more often than it reviews.
      if (target.trigger === 'mention') {
        await postIssueComment(
          token,
          owner,
          repo,
          prNumber,
          `## AGI Code Review\n\nThis installation has reached its monthly review quota (${MAX_REVIEWS_PER_INSTALLATION_PER_30_DAYS} reviews / 30 days). The cap resets on a rolling window · please wait or contact support to raise the limit.`,
        );
      }
      return false;
    }
  } catch (quotaErr) {
    logger.warn(
      { quotaErr, installationId, prNumber },
      'web-HIGH-3: spend-cap check failed · proceeding (best-effort)',
    );
  }
  return true;
}

const INJECTION_MARKERS = [
  'ignore previous',
  'ignore prior',
  'system:',
  'you are now',
  'override your instructions',
];

/** Whether the diff is trying to talk to the reviewer rather than be reviewed. */
function diffAttemptsPromptInjection(diff: string): boolean {
  const lower = escapeUntrustedPrDiff(diff).toLowerCase();
  const found = INJECTION_MARKERS.filter((marker) => lower.includes(marker));
  const jailbreakPair =
    lower.includes('system:') &&
    (lower.includes('ignore previous') || lower.includes('ignore prior'));
  return found.length >= 2 || jailbreakPair;
}

async function runAutomatedReview(target: ReviewTarget): Promise<void> {
  const { installationId, owner, repo, prNumber } = target;
  const db = getNeonDb();
  let attemptId: string | null = null;

  try {
    const installation = await readReviewInstallation(db, installationId);
    if (!installation) return;
    const codeGate = await assertWorkspaceCodeAccess(db, installation.user_id, {
      act: 'review_pull_request',
    });
    if (!codeGate.allowed) {
      logger.info({ owner, repo, prNumber, code: codeGate.code }, codeGate.reason);
      return;
    }
    if (!isManagedComputePrivateBetaEnabled()) {
      logger.info(
        { owner, repo, prNumber },
        'GitHub PR review skipped because managed compute private beta is disabled',
      );
      return;
    }

    const token = await getInstallationAccessToken(installationId);
    if (!(await reviewBudgetAllows(db, target, token))) return;

    try {
      const pendingRows = await db.query<{ id: string }>(
        'insert into github_pr_review_attempts (installation_id, pr_number, repo_owner, repo_name, status) values ($1, $2, $3, $4, $5) returning id',
        [installationId, prNumber, owner, repo, 'pending'],
      );
      attemptId = pendingRows[0]?.id ?? null;
    } catch (insertErr) {
      logger.warn(
        { insertErr, installationId, prNumber },
        'web-HIGH-3: failed to record pending attempt · proceeding without idempotency row',
      );
    }

    const rawDiff = await getPrDiff(token, owner, repo, prNumber);
    if (rawDiff.includes('\x00')) {
      logger.warn({ owner, repo, prNumber }, 'RT-03: binary diff rejected');
      if (target.trigger === 'mention') {
        await postIssueComment(
          token,
          owner,
          repo,
          prNumber,
          '## AGI Code Review\n\nUnable to review: diff contains binary files.',
        );
      }
      return;
    }
    if (!rawDiff.trim()) {
      if (target.trigger === 'mention') {
        await postIssueComment(
          token,
          owner,
          repo,
          prNumber,
          '## AGI Code Review\n\nNo diff content found for this PR.',
        );
      }
      return;
    }
    if (diffAttemptsPromptInjection(rawDiff)) {
      logger.warn(
        { owner, repo, prNumber },
        'RT-03 / WEB-17: blocking LLM review · prompt-injection threshold met',
      );
      await postIssueComment(
        token,
        owner,
        repo,
        prNumber,
        '## AGI Code Review\n\nAutomated review skipped: PR diff contains patterns indicative of prompt injection. A human reviewer will follow up.',
      );
      return;
    }

    const subscription = await SubscriptionService.getSubscription(db, installation.user_id).catch(
      () => null,
    );
    const postedCommentBodies = await listPrReviewCommentBodies(token, owner, repo, prNumber).catch(
      (error: unknown) => {
        logger.warn(
          { error, owner, repo, prNumber },
          '[code-review] could not read posted comments',
        );
        return [] as string[];
      },
    );

    const outcome = await reviewPullRequestDiff({
      diff: rawDiff,
      prNumber,
      planTier: effectivePlanTier(subscription?.plan_tier, subscription?.status),
      postedCommentBodies,
      preferredModel: installation.review_model,
    });

    if (outcome.status === 'unavailable' || outcome.status === 'no-diff') {
      logger.warn(
        { owner, repo, prNumber, status: outcome.status, reason: outcome.reason },
        '[code-review] no review posted',
      );
      if (attemptId) await settleAttempt(db, attemptId, 'failed', outcome.outputTokens);
      return;
    }

    // A re-review that found nothing new says nothing: the findings it would
    // have repeated are already on the pull request as line comments.
    const silent = outcome.status === 'no-findings' && target.trigger !== 'mention';
    if (!silent) {
      await postPrReview(
        token,
        owner,
        repo,
        prNumber,
        reviewSummaryBody(outcome),
        'COMMENT',
        reviewLineComments(outcome.posted),
      );
    }

    logger.info(
      {
        owner,
        repo,
        prNumber,
        trigger: target.trigger,
        posted: outcome.posted.length,
        duplicates: outcome.duplicates,
        fabricated: outcome.fabricated,
        chunks: outcome.chunks,
      },
      '[code-review] review settled',
    );
    if (attemptId) await settleAttempt(db, attemptId, 'completed', outcome.outputTokens);
  } catch (error) {
    logger.error({ error, owner, repo, prNumber }, 'PR review processing error');
    if (attemptId) await settleAttempt(db, attemptId, 'failed', 0);
  }
}

async function settleAttempt(
  db: ReturnType<typeof getNeonDb>,
  attemptId: string,
  status: 'completed' | 'failed',
  tokensUsed: number,
): Promise<void> {
  await db
    .execute(
      'update github_pr_review_attempts set status = $1, completed_at = $2, tokens_used = $3 where id = $4',
      [status, new Date().toISOString(), tokensUsed, attemptId],
    )
    .catch(() => undefined);
}
