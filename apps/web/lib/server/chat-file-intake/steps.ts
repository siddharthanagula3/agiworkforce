import 'server-only';

import type { ChatFileIntakeRefusalCode } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { logger } from '@/lib/logger';
import {
  inspectOutboundContent,
  type OutboundFinding,
} from '@/lib/security/outbound-content-inspection';
import {
  readSourceScan,
  submitSourceScan,
  judgeSourceScanVerdict,
  type SourceScanClientOptions,
} from '@/lib/security/source-scan-client';
import {
  UPLOAD_INSPECTION_BYTES,
  inspectUploadHead,
  uploadFindingRejects,
  type UploadScanFinding,
} from '@/lib/security/upload-scan';
import { prepareChatFileStep } from '@/lib/server/chat-file-preparation';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getNeonDb } from '@/lib/server/neon-db';
import { requestMediaAssetReindex } from '@/lib/services/retrieval-index-service';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import {
  credentialScanContinuesAfterHead,
  credentialScanMimeType,
  firstCursorAfterHead,
  mergeInspectionFindings,
  openPrivateObjectRange,
  scanCredentialRange,
  type OpenObjectRange,
  type TextInspectionCursor,
} from './full-inspection';
import {
  firstPackageCursor,
  isPackageCursor,
  packageScanApplies,
  scanPackageStep,
  type PackageInspectionCursor,
} from './package-inspection';
import { defaultSealDeps, sealChatFile, type SealDeps } from './seal';
import { sqlChatFileIntakeStore, type ChatFileIntakeRow } from './store';
import {
  defaultIntakeObjects,
  endDirective,
  endHeldIntake,
  retryScanAttempt,
  type ChatFileIntakeDirective,
  type IntakeTransitionDeps,
} from './transitions';

export type { ChatFileIntakeDirective } from './transitions';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FAIRNESS_WAIT_MS = 30_000;
const SCANNER_SOURCE_URL_TTL_SECONDS = 30 * 60;
const ATTEMPT_DEADLINE_MARGIN_MS = 60_000;
const SHORT_READ_RETRIES = 1;

/**
 * The stored object is unchanged but its first bytes did not come back whole.
 * Nothing about the file is wrong, so the step is retried, and failing that the
 * row stays leased for the sweeper, instead of ending in a refusal.
 */
class ShortInspectionReadError extends Error {
  constructor(intakeId: string) {
    super(`The ranged read of intake ${intakeId} came back short twice.`);
    this.name = 'ShortInspectionReadError';
  }
}

export interface ChatFileIntakeWorkflowInput {
  version: 1;
  intakeId: string;
  userId: string;
  organizationId: string | null;
}

export function parseChatFileIntakeWorkflowInput(
  value: ChatFileIntakeWorkflowInput,
): ChatFileIntakeWorkflowInput {
  if (
    value.version !== 1 ||
    !UUID_PATTERN.test(value.intakeId) ||
    typeof value.userId !== 'string' ||
    value.userId.trim().length === 0 ||
    value.userId.length > 255 ||
    (value.organizationId !== null && !UUID_PATTERN.test(value.organizationId))
  ) {
    throw new Error('Invalid chat file intake workflow input.');
  }
  return value;
}

export type ContentPolicyVerdict = 'allowed' | 'blocked';

export interface ChatFileIntakeDeps extends IntakeTransitionDeps {
  scanner: SourceScanClientOptions;
  policy: typeof CHAT_LARGE_FILE_POLICY;
  inspectContent(
    row: ChatFileIntakeRow,
    head: Uint8Array,
    findings: readonly UploadScanFinding[],
  ): Promise<ContentPolicyVerdict>;
  openRange: OpenObjectRange;
  seal: SealDeps;
  prepare(assetId: string): Promise<{ done: boolean }>;
  reindex(row: ChatFileIntakeRow, assetId: string): Promise<void>;
}

interface StepContext {
  deps: ChatFileIntakeDeps;
  intakeId: string;
  runId: string;
}

const REFUSAL_BY_FINDING: Partial<Record<UploadScanFinding['code'], ChatFileIntakeRefusalCode>> = {
  active_content_pdf: 'active_pdf',
  encrypted_content: 'encrypted',
  limits_exceeded: 'limits_exceeded',
  credential_material: 'dlp_blocked',
  sensitive_filename: 'dlp_blocked',
};

function refusalForFindings(findings: readonly UploadScanFinding[]): ChatFileIntakeRefusalCode {
  const rejecting = findings.find((finding) => uploadFindingRejects(finding));
  return (rejecting && REFUSAL_BY_FINDING[rejecting.code]) ?? 'type_mismatch';
}

function reportedUploadFindings(findings: readonly UploadScanFinding[]): OutboundFinding[] {
  const counts = new Map<string, OutboundFinding>();
  for (const finding of findings) {
    if (uploadFindingRejects(finding)) continue;
    const existing = counts.get(finding.code);
    if (existing) existing.count += 1;
    else
      counts.set(finding.code, {
        scanner: 'upload_scan',
        name: finding.code,
        severity: 'medium',
        count: 1,
      });
  }
  return [...counts.values()];
}

function mimeEssence(value: string | undefined): string | undefined {
  return value?.split(';', 1)[0]?.trim().toLowerCase();
}

function scanGiveUpReached(deps: ChatFileIntakeDeps, row: ChatFileIntakeRow): boolean {
  if (row.firstSubmittedAt === null) return false;
  const counted = deps.now() - row.firstSubmittedAt - row.scanBudgetWaitMs;
  return counted >= deps.policy.intake.scanGiveUpMs;
}

function scanUnavailable(
  ctx: StepContext,
  row: ChatFileIntakeRow,
): Promise<ChatFileIntakeDirective> {
  return endHeldIntake(ctx.deps, row, ctx.runId, {
    state: 'failed',
    failureCode: 'scan_unavailable',
  });
}

function refuse(
  ctx: StepContext,
  row: ChatFileIntakeRow,
  refusalCode: ChatFileIntakeRefusalCode,
): Promise<ChatFileIntakeDirective> {
  return endHeldIntake(ctx.deps, row, ctx.runId, { state: 'rejected', refusalCode });
}

async function startStep(ctx: StepContext): Promise<ChatFileIntakeDirective> {
  const row = await ctx.deps.store.get(ctx.intakeId);
  switch (row?.state) {
    case 'uploaded':
    case 'inspecting':
      return { next: 'inspect' };
    case 'scanning':
      return { next: 'poll', resume: true, pollIndex: 0, scanningSinceMs: null, deadlineMs: null };
    case 'sealing':
      return { next: 'seal' };
    default:
      return endDirective(row ? `already_${row.state}` : 'missing');
  }
}

/** The first bytes, read twice at most: a short read is never inspected as if it were the file. */
async function readInspectedHead(
  ctx: StepContext,
  row: ChatFileIntakeRow,
  wanted: number,
): Promise<Uint8Array | null> {
  for (let attempt = 0; attempt <= SHORT_READ_RETRIES; attempt += 1) {
    const head = await ctx.deps.objects.readHead(row.stagingKey, wanted);
    if (head !== null && head.byteLength === wanted) return head;
  }
  return null;
}

function holdForInspection(ctx: StepContext): Promise<ChatFileIntakeRow | null> {
  return ctx.deps.store.claim({
    intakeId: ctx.intakeId,
    runId: ctx.runId,
    to: 'inspecting',
    from: ['uploaded'],
    nowMs: ctx.deps.now(),
  });
}

function refuseInspected(
  ctx: StepContext,
  row: ChatFileIntakeRow,
  findings: readonly UploadScanFinding[],
): Promise<ChatFileIntakeDirective> {
  logger.warn(
    { intakeId: row.id, findings: findings.map((finding) => finding.code) },
    '[chat-files] refused a large file that failed content inspection',
  );
  return refuse(ctx, row, refusalForFindings(findings));
}

/**
 * The workspace data policy over every finding, then the entity tag the
 * scanner and the seal hold the bytes to.
 */
async function concludeInspection(
  ctx: StepContext,
  row: ChatFileIntakeRow,
  etag: string,
  head: Uint8Array,
  findings: readonly UploadScanFinding[],
): Promise<ChatFileIntakeDirective> {
  const { deps } = ctx;
  if ((await deps.inspectContent(row, head, findings)) === 'blocked') {
    logger.warn(
      { intakeId: row.id },
      '[chat-files] the workspace data policy blocked a large file',
    );
    return refuse(ctx, row, 'dlp_blocked');
  }
  const recorded = await deps.store.recordEtag({ intakeId: row.id, runId: ctx.runId, etag });
  return recorded ? { next: 'submit' } : endDirective('superseded');
}

function objectUnchanged(
  current: { etag?: string | undefined; contentLength?: number | undefined } | null,
  etag: string,
  row: ChatFileIntakeRow,
): boolean {
  return current !== null && current.etag === etag && current.contentLength === row.byteCount;
}

/**
 * One step of the credential scan after the head: at most a text step's bytes,
 * read once and held to the entity tag the head was read under. The cursor
 * moves only through the directive this returns, so a retried step scans the
 * same range again and a range is never skipped or counted twice. The last
 * step reads the head again, because the data policy decides over the head's
 * findings and the rest's together.
 */
async function continueInspection(
  ctx: StepContext,
  cursor: TextInspectionCursor,
): Promise<ChatFileIntakeDirective> {
  const { deps } = ctx;
  const row = await holdForInspection(ctx);
  if (!row) return endDirective('superseded');
  if (!objectUnchanged(await deps.objects.head(row.stagingKey), cursor.etag, row)) {
    return refuse(ctx, row, 'changed_during_check');
  }

  const ownedTo = Math.min(row.byteCount, cursor.ownedFrom + deps.policy.kinds.text.bytesPerStep);
  const scanned = await scanCredentialRange({
    openRange: deps.openRange,
    key: row.stagingKey,
    mimeType: credentialScanMimeType(row),
    byteCount: row.byteCount,
    ownedFrom: cursor.ownedFrom,
    ownedTo,
  });
  const finished = scanned.kind === 'read' && !scanned.rejected && ownedTo === row.byteCount;
  const head = finished
    ? await readInspectedHead(ctx, row, Math.min(row.byteCount, UPLOAD_INSPECTION_BYTES))
    : null;
  if (!objectUnchanged(await deps.objects.head(row.stagingKey), cursor.etag, row)) {
    return refuse(ctx, row, 'changed_during_check');
  }
  if (scanned.kind === 'short') throw new ShortInspectionReadError(row.id);
  if (scanned.rejected) return refuseInspected(ctx, row, scanned.findings);

  const findings = mergeInspectionFindings(cursor.findings, scanned.findings);
  if (!finished) return { next: 'inspect', cursor: { ...cursor, ownedFrom: ownedTo, findings } };
  if (head === null) throw new ShortInspectionReadError(row.id);
  const inspection = inspectUploadHead(
    head,
    row.mimeType,
    row.fileName,
    credentialScanMimeType(row),
  );
  if (!inspection.ok) return refuseInspected(ctx, row, inspection.findings);
  return concludeInspection(ctx, row, cursor.etag, head, [...inspection.findings, ...findings]);
}

/**
 * One step of the credential scan of an Office package: the whole file, read
 * once and held to the entity tag the head was read under, then at most a text
 * step's bytes of the package and its inflated members. The step that reaches
 * the end decides over the head's findings and the package's together, from
 * the same read.
 */
async function continuePackageInspection(
  ctx: StepContext,
  cursor: PackageInspectionCursor,
): Promise<ChatFileIntakeDirective> {
  const { deps } = ctx;
  const row = await holdForInspection(ctx);
  if (!row) return endDirective('superseded');
  if (!objectUnchanged(await deps.objects.head(row.stagingKey), cursor.etag, row)) {
    return refuse(ctx, row, 'changed_during_check');
  }
  const data = await readInspectedHead(ctx, row, row.byteCount);
  if (!objectUnchanged(await deps.objects.head(row.stagingKey), cursor.etag, row)) {
    return refuse(ctx, row, 'changed_during_check');
  }
  if (data === null) throw new ShortInspectionReadError(row.id);

  const scanned = await scanPackageStep({
    data,
    row,
    cursor,
    policy: deps.policy,
    declaredAsText: credentialScanContinuesAfterHead(row),
  });
  switch (scanned.kind) {
    case 'continue':
      return { next: 'inspect', cursor: scanned.cursor };
    case 'unreadable':
      logger.warn(
        { intakeId: row.id, reason: scanned.reason },
        '[chat-files] refused a large file whose package could not be read to its end',
      );
      return refuse(ctx, row, scanned.refusal);
    case 'rejected':
      return refuseInspected(ctx, row, scanned.findings);
    case 'finished': {
      const head = data.subarray(0, Math.min(row.byteCount, UPLOAD_INSPECTION_BYTES));
      const inspection = inspectUploadHead(
        head,
        row.mimeType,
        row.fileName,
        credentialScanMimeType(row),
      );
      if (!inspection.ok) return refuseInspected(ctx, row, inspection.findings);
      return concludeInspection(ctx, row, cursor.etag, head, [
        ...inspection.findings,
        ...scanned.findings,
      ]);
    }
  }
}

async function inspectStep(
  ctx: StepContext,
  directive: Extract<ChatFileIntakeDirective, { next: 'inspect' }>,
): Promise<ChatFileIntakeDirective> {
  if (directive.cursor) {
    return isPackageCursor(directive.cursor)
      ? continuePackageInspection(ctx, directive.cursor)
      : continueInspection(ctx, directive.cursor);
  }
  const { deps } = ctx;
  const row = await holdForInspection(ctx);
  if (!row) return endDirective('superseded');

  const before = await deps.objects.head(row.stagingKey);
  if (!before || !before.etag) return refuse(ctx, row, 'changed_during_check');
  if (before.contentLength !== row.byteCount) return refuse(ctx, row, 'size_mismatch');
  const storedType = mimeEssence(before.contentType);
  if (storedType && storedType !== mimeEssence(row.mimeType)) {
    return refuse(ctx, row, 'type_mismatch');
  }

  const wanted = Math.min(row.byteCount, UPLOAD_INSPECTION_BYTES);
  const head = await readInspectedHead(ctx, row, wanted);
  const after = await deps.objects.head(row.stagingKey);
  if (!after || after.etag !== before.etag || after.contentLength !== row.byteCount) {
    return refuse(ctx, row, 'changed_during_check');
  }
  if (head === null) throw new ShortInspectionReadError(row.id);

  const inspection = inspectUploadHead(
    head,
    row.mimeType,
    row.fileName,
    credentialScanMimeType(row),
  );
  if (!inspection.ok) return refuseInspected(ctx, row, inspection.findings);
  if (packageScanApplies(row)) return { next: 'inspect', cursor: firstPackageCursor(before.etag) };
  if (credentialScanContinuesAfterHead(row)) {
    return { next: 'inspect', cursor: firstCursorAfterHead(before.etag) };
  }
  return concludeInspection(ctx, row, before.etag, head, inspection.findings);
}

async function holdForSubmit(
  ctx: StepContext,
): Promise<ChatFileIntakeRow | ChatFileIntakeDirective> {
  const { deps } = ctx;
  const nowMs = deps.now();
  const current = await deps.store.get(ctx.intakeId);
  if (current?.state === 'inspecting') {
    const held = await deps.store.renew({
      intakeId: ctx.intakeId,
      runId: ctx.runId,
      state: 'inspecting',
      nowMs,
    });
    if (!held) return endDirective('superseded');
    if (await deps.store.hasOtherScanning({ userId: held.userId, intakeId: held.id })) {
      return { next: 'submit', sleepMs: FAIRNESS_WAIT_MS };
    }
    const scanning = await deps.store.claim({
      intakeId: ctx.intakeId,
      runId: ctx.runId,
      to: 'scanning',
      from: ['inspecting'],
      nowMs,
    });
    return scanning ?? endDirective('superseded');
  }
  if (current?.state === 'scanning') {
    const held = await deps.store.renew({
      intakeId: ctx.intakeId,
      runId: ctx.runId,
      state: 'scanning',
      nowMs,
    });
    return held ?? endDirective('superseded');
  }
  return endDirective('superseded');
}

function isDirective(
  value: ChatFileIntakeRow | ChatFileIntakeDirective,
): value is ChatFileIntakeDirective {
  return 'next' in value;
}

async function deferSubmit(
  ctx: StepContext,
  row: ChatFileIntakeRow,
  reason: 'queue_full' | 'source_budget',
  waitMs: number,
): Promise<ChatFileIntakeDirective> {
  const { intake } = ctx.deps.policy;
  const sleepMs = Math.min(Math.max(waitMs, 0), intake.scanGiveUpMs);
  if (reason === 'source_budget' && sleepMs > 0) {
    const counted = await ctx.deps.store.addBudgetWait({
      intakeId: row.id,
      runId: ctx.runId,
      waitMs: sleepMs,
      capMs: intake.budgetWaitMaxMs,
    });
    if (!counted) return endDirective('superseded');
  }
  return { next: 'submit', sleepMs, deferral: { reason, remainingMs: waitMs - sleepMs } };
}

async function submitStep(
  ctx: StepContext,
  directive: Extract<ChatFileIntakeDirective, { next: 'submit' }>,
): Promise<ChatFileIntakeDirective> {
  const { deps } = ctx;
  const held = await holdForSubmit(ctx);
  if (isDirective(held)) return held;
  const row = held;
  if (scanGiveUpReached(deps, row)) return scanUnavailable(ctx, row);

  const deferral = directive.deferral;
  if (deferral && deferral.remainingMs > 0) {
    return deferSubmit(ctx, row, deferral.reason, deferral.remainingMs);
  }
  if (row.attempts >= deps.policy.intake.maxScanAttempts) return scanUnavailable(ctx, row);
  if (!row.etag) return refuse(ctx, row, 'changed_during_check');

  const jobId = `${row.id}:${row.attempts + 1}`;
  let sourceUrl: string;
  try {
    sourceUrl = await deps.objects.presignGet({
      key: row.stagingKey,
      fileName: row.fileName,
      expiresInSeconds: SCANNER_SOURCE_URL_TTL_SECONDS,
    });
  } catch (error) {
    logger.warn({ error, intakeId: row.id }, '[chat-files] the scanner source could not be signed');
    return failedAttempt(ctx, row);
  }
  const answer = await submitSourceScan(
    { jobId, sourceUrl, byteCount: row.byteCount, etag: row.etag, mimeType: row.mimeType },
    deps.scanner,
  );
  switch (answer.kind) {
    case 'accepted': {
      const admitted = await deps.store.recordAttempt({
        intakeId: row.id,
        runId: ctx.runId,
        attemptsBefore: row.attempts,
        jobId,
      });
      if (!admitted) return endDirective('superseded');
      return {
        next: 'poll',
        sleepMs: deps.policy.intake.scanPollScheduleMs[0] ?? 0,
        pollIndex: 0,
        scanningSinceMs: null,
        deadlineMs: answer.deadlineMs,
      };
    }
    case 'deferred':
      return deferSubmit(ctx, row, answer.reason, answer.retryAfterMs);
    default:
      logger.warn(
        { intakeId: row.id, answer },
        '[chat-files] the scanner did not take a scan; another attempt follows',
      );
      return failedAttempt(ctx, row);
  }
}

async function failedAttempt(
  ctx: StepContext,
  row: ChatFileIntakeRow,
): Promise<ChatFileIntakeDirective> {
  const counted = await ctx.deps.store.recordAttempt({
    intakeId: row.id,
    runId: ctx.runId,
    attemptsBefore: row.attempts,
    jobId: null,
  });
  if (!counted) return endDirective('superseded');
  return retryScanAttempt(ctx.deps, counted, ctx.runId, ctx.deps.policy.intake.maxScanAttempts);
}

function nextPoll(
  deps: ChatFileIntakeDeps,
  directive: Extract<ChatFileIntakeDirective, { next: 'poll' }>,
  scanningSinceMs: number | null,
  deadlineMs: number | null,
): ChatFileIntakeDirective {
  const schedule = deps.policy.intake.scanPollScheduleMs;
  const pollIndex = directive.pollIndex + 1;
  return {
    next: 'poll',
    sleepMs: schedule[Math.min(pollIndex, schedule.length - 1)] ?? 0,
    pollIndex,
    scanningSinceMs,
    deadlineMs,
  };
}

async function pollStep(
  ctx: StepContext,
  directive: Extract<ChatFileIntakeDirective, { next: 'poll' }>,
): Promise<ChatFileIntakeDirective> {
  const { deps } = ctx;
  const nowMs = deps.now();
  const row = directive.resume
    ? await deps.store.claim({
        intakeId: ctx.intakeId,
        runId: ctx.runId,
        to: 'scanning',
        from: [],
        nowMs,
      })
    : await deps.store.renew({
        intakeId: ctx.intakeId,
        runId: ctx.runId,
        state: 'scanning',
        nowMs,
      });
  if (!row) return endDirective('superseded');
  if (scanGiveUpReached(deps, row)) return scanUnavailable(ctx, row);
  if (row.scanJobId === null) return { next: 'submit' };

  const maxAttempts = deps.policy.intake.maxScanAttempts;
  const answer = await readSourceScan(row.scanJobId, deps.scanner);
  switch (answer.kind) {
    case 'queued':
      return nextPoll(
        deps,
        directive,
        directive.scanningSinceMs,
        answer.deadlineMs ?? directive.deadlineMs,
      );
    case 'scanning': {
      const since = directive.scanningSinceMs ?? nowMs;
      const deadlineMs = answer.deadlineMs ?? directive.deadlineMs;
      if (deadlineMs !== null && nowMs - since > deadlineMs + ATTEMPT_DEADLINE_MARGIN_MS) {
        logger.warn({ intakeId: row.id }, '[chat-files] a scan passed its deadline');
        return retryScanAttempt(deps, row, ctx.runId, maxAttempts);
      }
      return nextPoll(deps, directive, since, deadlineMs);
    }
    case 'done': {
      const judgement = judgeSourceScanVerdict(answer.verdict);
      if (judgement.kind === 'clean') return { next: 'seal' };
      if (judgement.kind === 'rejected') return refuse(ctx, row, judgement.refusalCode);
      logger.warn(
        { intakeId: row.id, outcome: answer.verdict.outcome, reason: answer.verdict.reason },
        '[chat-files] a scan did not finish; another attempt follows',
      );
      return retryScanAttempt(deps, row, ctx.runId, maxAttempts);
    }
    default:
      return retryScanAttempt(deps, row, ctx.runId, maxAttempts);
  }
}

async function prepareStep(ctx: StepContext, assetId: string): Promise<ChatFileIntakeDirective> {
  const result = await ctx.deps.prepare(assetId);
  return result.done ? { next: 'index', assetId } : { next: 'prepare', assetId };
}

async function indexStep(ctx: StepContext, assetId: string): Promise<ChatFileIntakeDirective> {
  const row = await ctx.deps.store.get(ctx.intakeId);
  if (row?.state === 'sealed') await ctx.deps.reindex(row, assetId);
  return endDirective('finished');
}

/**
 * One step of the intake: the workflow calls this once per directive, so each
 * step is its own durable unit and a re-dispatched run starts at the step the
 * row's state names.
 */
export async function runChatFileIntakeStep(
  deps: ChatFileIntakeDeps,
  input: { intakeId: string; runId: string },
  directive: ChatFileIntakeDirective,
): Promise<ChatFileIntakeDirective> {
  const ctx: StepContext = { deps, intakeId: input.intakeId, runId: input.runId };
  switch (directive.next) {
    case 'start':
      return startStep(ctx);
    case 'inspect':
      return inspectStep(ctx, directive);
    case 'submit':
      return submitStep(ctx, directive);
    case 'poll':
      return pollStep(ctx, directive);
    case 'seal':
      return sealChatFile(deps, { intakeId: input.intakeId, runId: input.runId });
    case 'prepare':
      return prepareStep(ctx, directive.assetId);
    case 'index':
      return indexStep(ctx, directive.assetId);
    case 'end':
      return directive;
  }
}

function uploadContentInspector(db: DatabaseAdapter): ChatFileIntakeDeps['inspectContent'] {
  return async (row, head, findings) => {
    const verdict = await inspectOutboundContent({
      channel: 'upload',
      value: { fileName: row.fileName, mimeType: row.mimeType, content: head },
      userId: row.userId,
      organizationId: row.organizationId,
      resourceId: row.stagingKey,
      priorFindings: reportedUploadFindings(findings),
      resolveMode: async () => {
        const policy = await resolveSecretHandlingPolicy(db, row.userId);
        return policy.mode === 'redact' ? { ...policy, mode: 'block' } : policy;
      },
    });
    return verdict.action === 'allowed' ? 'allowed' : 'blocked';
  };
}

/** The workflow's dependencies, through the same user-scoped role as the routes. */
export function createChatFileIntakeDeps(input: ChatFileIntakeWorkflowInput): ChatFileIntakeDeps {
  const db = createClaimedUserScopedDb(getNeonDb(), {
    userId: input.userId,
    organizationId: input.organizationId,
  });
  return {
    store: sqlChatFileIntakeStore(db, input.userId),
    objects: defaultIntakeObjects(),
    now: Date.now,
    scanner: {},
    policy: CHAT_LARGE_FILE_POLICY,
    inspectContent: uploadContentInspector(db),
    openRange: openPrivateObjectRange,
    seal: defaultSealDeps(db),
    prepare: (assetId) => prepareChatFileStep(assetId, { db }),
    async reindex(row, assetId) {
      await requestMediaAssetReindex(db, { assetId, ownerUserId: row.userId });
    },
  };
}
