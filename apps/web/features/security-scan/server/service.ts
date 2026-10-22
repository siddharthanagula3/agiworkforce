import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  CloudCodeConflictError,
  CloudCodeLimitError,
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
  CLOUD_CODE_UNPUSHED_COMMITS_COMMAND,
  CLOUD_CODE_UNPUSHED_COMMITS_MESSAGE,
  commitFileAndPushCloudCodeSession,
  getCloudCodeSession,
  openCloudCodeSessionPullRequest,
  type CloudCodeOwner,
} from '@/lib/services/cloud-code-session-service';

import {
  SECURITY_SCAN_STATUS,
  type SecurityScanCompletedReport,
  type SecurityScanDecision,
  type SecurityScanDecisionResponse,
  type SecurityScanDeliveryResult,
  type SecurityScanDropped,
  type SecurityScanFinding,
  type SecurityScanReport,
  type SecurityScanStateResponse,
} from '@agiworkforce/cloud-contracts';
import {
  anchorCandidate,
  compareSeverity,
  findingId,
  parseScanResponse,
  parseVerificationResponse,
  type CandidateFinding,
} from './findings';
import {
  SecurityScanBudgetError,
  SecurityScanNoRouteError,
  resolveSecurityScanModel,
  type SecurityScanModel,
  type SecurityScanModelInput,
} from './model';
import {
  SECURITY_SCAN_SYSTEM_PROMPT,
  SECURITY_VERIFY_SYSTEM_PROMPT,
  buildScanPrompt,
  buildVerificationPrompt,
} from './prompts';
import { SecurityScanReportReplayError } from './report-signing';
import { packScanBatches, parseGitLsFilesStage, rankCandidateFiles } from './selection';
import { shellQuote, withSecurityScanWorkspace, type SecurityScanWorkspace } from './workspace';

const MAX_BATCH_BYTES = 48 * 1024;
const MAX_BATCHES = 4;
const MAX_SCAN_BYTES = MAX_BATCH_BYTES * MAX_BATCHES;
const MAX_FILES_READ = 160;
const SCAN_OUTPUT_TOKENS = 4096;
const VERIFY_OUTPUT_TOKENS = 4096;
const RUNNING_STALE_MS = 6 * 60 * 1000;
const COMMIT_SUBJECT_PREFIX = 'fix: ';
const GENERIC_SCAN_FAILURE = 'The scan could not finish. Try again.';
const STALE_SCAN_FAILURE = 'The scan stopped before it finished. Run it again.';

export interface SecurityScanServiceContext {
  db: DatabaseAdapter;
  owner: CloudCodeOwner;
  sessionId: string;
  planTier: string;
  signal?: AbortSignal;
  resolveModel?: (input: SecurityScanModelInput) => Promise<SecurityScanModel>;
}

interface ReadSource {
  path: string;
  content: string;
}

interface CollectedSources {
  commit: string | null;
  candidateFiles: number;
  sources: ReadSource[];
}

function isFreshRun(report: SecurityScanReport | null, now: number): boolean {
  return (
    report?.status === SECURITY_SCAN_STATUS.running &&
    now - Date.parse(report.startedAt) < RUNNING_STALE_MS
  );
}

function presentReport(report: SecurityScanReport | null, now: number): SecurityScanReport | null {
  if (report?.status === SECURITY_SCAN_STATUS.running && !isFreshRun(report, now)) {
    return {
      status: SECURITY_SCAN_STATUS.failed,
      scanId: report.scanId,
      startedAt: report.startedAt,
      error: STALE_SCAN_FAILURE,
    };
  }
  return report;
}

async function readReportOrNullWhenReplayed(
  workspace: SecurityScanWorkspace,
): Promise<SecurityScanReport | null> {
  try {
    return await workspace.readReport();
  } catch (error) {
    if (error instanceof SecurityScanReportReplayError) return null;
    throw error;
  }
}

function replayedReport(error: SecurityScanReportReplayError): SecurityScanReport {
  return {
    status: SECURITY_SCAN_STATUS.failed,
    scanId: error.scanId,
    startedAt: error.issuedAt,
    error: error.message,
  };
}

function parseFileSizes(output: string): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const record of output.split('\0')) {
    const tab = record.indexOf('\t');
    if (tab <= 0) continue;
    const size = Number(record.slice(0, tab));
    if (Number.isSafeInteger(size) && size >= 0) sizes.set(record.slice(tab + 1), size);
  }
  return sizes;
}

async function collectSources(
  workspace: SecurityScanWorkspace,
  scope: string | null,
): Promise<CollectedSources> {
  const head = await workspace.run('git rev-parse HEAD');
  const commit =
    head.ok && /^[0-9a-f]{40,64}$/.test(head.stdout.trim()) ? head.stdout.trim() : null;
  const listing = await workspace.run('git ls-files -s -z');
  if (!listing.ok) {
    throw new CloudCodeUnavailableError('The repository files could not be listed');
  }
  const ranked = rankCandidateFiles(parseGitLsFilesStage(listing.stdout), scope);
  const candidates = ranked.slice(0, MAX_FILES_READ);
  const sources: ReadSource[] = [];
  if (candidates.length === 0) return { commit, candidateFiles: ranked.length, sources };

  const stat = await workspace.run(
    `stat -L --printf '%s\\t%n\\0' -- ${candidates.map(shellQuote).join(' ')}`,
  );
  const sizes = parseFileSizes(stat.stdout);
  if (sizes.size === 0 && !stat.ok) {
    throw new CloudCodeUnavailableError('The repository files could not be measured');
  }
  let bytes = 0;
  for (const path of candidates) {
    const listed = sizes.get(path);
    if (listed === undefined || listed === 0 || listed > MAX_BATCH_BYTES) continue;
    if (bytes + listed > MAX_SCAN_BYTES) continue;
    const content = await workspace.readText(path);
    if (content === null || content.trim().length === 0) continue;
    const size = Buffer.byteLength(content, 'utf8');
    if (size > MAX_BATCH_BYTES || bytes + size > MAX_SCAN_BYTES) continue;
    sources.push({ path, content });
    bytes += size;
  }
  return { commit, candidateFiles: ranked.length, sources };
}

function scanFailureMessage(error: unknown): string {
  if (error instanceof SecurityScanNoRouteError || error instanceof SecurityScanBudgetError) {
    return error.message;
  }
  if (
    error instanceof CloudCodeConflictError ||
    error instanceof CloudCodeUnavailableError ||
    error instanceof CloudCodeValidationError
  ) {
    return error.message;
  }
  return GENERIC_SCAN_FAILURE;
}

interface AnchoredCandidate {
  id: string;
  candidate: CandidateFinding;
  patch: string;
  content: string;
}

async function detectAndVerify(
  model: SecurityScanModel,
  sources: readonly ReadSource[],
): Promise<{
  confirmed: { anchored: AnchoredCandidate; verification: string }[];
  dropped: SecurityScanDropped;
  scannedFiles: number;
  scannedBytes: number;
}> {
  const { batches } = packScanBatches(sources, {
    maxBatchBytes: MAX_BATCH_BYTES,
    maxBatches: MAX_BATCHES,
  });
  const dropped: SecurityScanDropped = {
    unanchored: 0,
    patchRejected: 0,
    refuted: 0,
    unparsable: 0,
  };
  const contentByPath = new Map(sources.map((source) => [source.path, source.content]));

  const answers = await Promise.allSettled(
    batches.map((batch, index) =>
      model.call({
        ref: `scan:${index}`,
        system: SECURITY_SCAN_SYSTEM_PROMPT,
        prompt: buildScanPrompt(batch.files),
        maxOutputTokens: SCAN_OUTPUT_TOKENS,
      }),
    ),
  );
  const firstFailure = answers.find(
    (answer): answer is PromiseRejectedResult => answer.status === 'rejected',
  );
  if (batches.length > 0 && answers.every((answer) => answer.status === 'rejected')) {
    throw firstFailure?.reason ?? new Error('Every scan call failed');
  }

  let scannedFiles = 0;
  let scannedBytes = 0;
  const anchored = new Map<string, AnchoredCandidate>();
  answers.forEach((answer, index) => {
    const batch = batches[index]!;
    if (answer.status === 'rejected') {
      logger.warn({ error: answer.reason, batch: index }, '[security-scan] scan call failed');
      return;
    }
    const parsed = parseScanResponse(answer.value.text);
    if (!parsed) {
      dropped.unparsable += 1;
      return;
    }
    scannedFiles += batch.files.length;
    scannedBytes += batch.bytes;
    const batchPaths = new Set(batch.files.map((file) => file.path));
    for (const candidate of parsed) {
      const content = batchPaths.has(candidate.path)
        ? contentByPath.get(candidate.path)
        : undefined;
      const outcome = anchorCandidate(candidate, content);
      if (!outcome.ok) {
        if (outcome.reason === 'unanchored') dropped.unanchored += 1;
        else dropped.patchRejected += 1;
        continue;
      }
      const id = findingId(candidate);
      if (!anchored.has(id)) {
        anchored.set(id, { id, candidate, patch: outcome.patch, content: content! });
      }
    }
  });

  const toVerify = [...anchored.values()].sort((a, b) =>
    compareSeverity(a.candidate.severity, b.candidate.severity),
  );
  if (toVerify.length === 0) {
    return { confirmed: [], dropped, scannedFiles, scannedBytes };
  }

  const verification = await model.call({
    ref: 'verify',
    system: SECURITY_VERIFY_SYSTEM_PROMPT,
    prompt: buildVerificationPrompt(
      toVerify.map((entry) => ({
        id: entry.id,
        path: entry.candidate.path,
        line: entry.candidate.line,
        title: entry.candidate.title,
        explanation: entry.candidate.explanation,
        content: entry.content,
        patch: entry.patch,
      })),
    ),
    maxOutputTokens: VERIFY_OUTPUT_TOKENS,
  });
  const verdicts = parseVerificationResponse(verification.text);
  if (!verdicts) throw new CloudCodeUnavailableError('The findings could not be validated');

  const confirmed: { anchored: AnchoredCandidate; verification: string }[] = [];
  for (const entry of toVerify) {
    const verdict = verdicts.get(entry.id);
    if (verdict?.verdict === 'confirmed') {
      confirmed.push({ anchored: entry, verification: verdict.reason });
    } else {
      dropped.refuted += 1;
    }
  }
  return { confirmed, dropped, scannedFiles, scannedBytes };
}

async function stagePatch(
  workspace: SecurityScanWorkspace,
  id: string,
  patch: string,
): Promise<string | null> {
  const patchPath = await workspace.writePatch(id, patch);
  const check = await workspace.run(`git apply --check ${shellQuote(patchPath)}`);
  return check.ok && check.exitCode === 0 ? patchPath : null;
}

async function recordFailure(context: SecurityScanServiceContext, report: SecurityScanReport) {
  try {
    await withSecurityScanWorkspace(
      context.db,
      context.owner,
      context.sessionId,
      context.planTier,
      (workspace) => workspace.writeReport(report),
    );
  } catch (error) {
    logger.warn(
      { error, sessionId: context.sessionId },
      '[security-scan] failed scan could not be recorded',
    );
  }
}

export async function runSecurityScan(
  context: SecurityScanServiceContext,
  scope: string | null,
): Promise<SecurityScanCompletedReport> {
  const scanId = randomUUID();
  const startedAt = new Date().toISOString();
  const session = await getCloudCodeSession(context.db, context.owner, context.sessionId);
  if (!session.repositoryUrl) {
    throw new CloudCodeValidationError('Security scans need a session opened on a repository');
  }

  const model = await (context.resolveModel ?? resolveSecurityScanModel)({
    db: context.db,
    userId: context.owner.userId,
    organizationId: context.owner.organizationId,
    planTier: context.planTier,
    scanId,
    ...(context.signal ? { signal: context.signal } : {}),
  });

  const collected = await withSecurityScanWorkspace(
    context.db,
    context.owner,
    context.sessionId,
    context.planTier,
    async (workspace) => {
      if (isFreshRun(await readReportOrNullWhenReplayed(workspace), Date.now())) {
        throw new CloudCodeConflictError('A security scan is already running in this session');
      }
      const sources = await collectSources(workspace, scope);
      await workspace.writeReport({ status: SECURITY_SCAN_STATUS.running, scanId, startedAt });
      return sources;
    },
  );

  try {
    const detected = await detectAndVerify(model, collected.sources);
    return await withSecurityScanWorkspace(
      context.db,
      context.owner,
      context.sessionId,
      context.planTier,
      async (workspace) => {
        const findings: SecurityScanFinding[] = [];
        let patchRejected = detected.dropped.patchRejected;
        for (const { anchored, verification } of detected.confirmed) {
          if (!(await stagePatch(workspace, anchored.id, anchored.patch))) {
            patchRejected += 1;
            continue;
          }
          findings.push({
            id: anchored.id,
            path: anchored.candidate.path,
            line: anchored.candidate.line,
            severity: anchored.candidate.severity,
            category: anchored.candidate.category,
            title: anchored.candidate.title,
            explanation: anchored.candidate.explanation,
            evidence: anchored.candidate.evidence,
            verification,
            patch: anchored.patch,
            state: 'open',
            decidedAt: null,
          });
        }
        const report: SecurityScanCompletedReport = {
          status: SECURITY_SCAN_STATUS.completed,
          scanId,
          startedAt,
          completedAt: new Date().toISOString(),
          commit: collected.commit,
          model: model.label,
          coverage: {
            scope,
            candidateFiles: collected.candidateFiles,
            scannedFiles: detected.scannedFiles,
            scannedBytes: detected.scannedBytes,
            skippedFiles: collected.candidateFiles - detected.scannedFiles,
          },
          dropped: { ...detected.dropped, patchRejected },
          findings,
        };
        await workspace.writeReport(report);
        return report;
      },
    );
  } catch (error) {
    await recordFailure(context, {
      status: SECURITY_SCAN_STATUS.failed,
      scanId,
      startedAt,
      error: scanFailureMessage(error),
    });
    throw error;
  }
}

export async function readSecurityScanState(
  context: SecurityScanServiceContext,
): Promise<SecurityScanStateResponse> {
  const session = await getCloudCodeSession(context.db, context.owner, context.sessionId);
  const summary = {
    id: session.id,
    title: session.title,
    repositoryUrl: session.repositoryUrl,
    workingBranch: session.workingBranch,
    pullRequestUrl: session.pullRequestUrl,
  };
  if (session.state === 'closed' || !session.repositoryUrl) {
    return { session: summary, report: null };
  }
  const report = await withSecurityScanWorkspace(
    context.db,
    context.owner,
    context.sessionId,
    context.planTier,
    async (workspace) => {
      try {
        return await workspace.readReport();
      } catch (error) {
        if (error instanceof SecurityScanReportReplayError) return replayedReport(error);
        throw error;
      }
    },
  );
  return { session: summary, report: presentReport(report, Date.now()) };
}

const STAGED_CHANGES_COMMAND = 'git diff --cached --name-only -z';

async function assertOnlyTheFixWillShip(workspace: SecurityScanWorkspace): Promise<void> {
  const staged = await workspace.run(STAGED_CHANGES_COMMAND);
  if (!staged.ok) throw new CloudCodeUnavailableError('Workspace status could not be read');
  if (staged.stdout.length > 0) {
    throw new CloudCodeConflictError(
      'This session has staged changes. Commit or unstage them, then approve the fix.',
    );
  }
  const unpushed = await workspace.run(CLOUD_CODE_UNPUSHED_COMMITS_COMMAND);
  if (!unpushed.ok) throw new CloudCodeUnavailableError('Workspace status could not be read');
  if (unpushed.stdout.trim().length > 0) {
    throw new CloudCodeConflictError(CLOUD_CODE_UNPUSHED_COMMITS_MESSAGE);
  }
}

function deliveryError(error: unknown): string {
  if (
    error instanceof CloudCodeConflictError ||
    error instanceof CloudCodeLimitError ||
    error instanceof CloudCodeUnavailableError ||
    error instanceof CloudCodeValidationError
  ) {
    return error.message;
  }
  return 'The fix is applied in this session but did not reach GitHub. Push it from the session.';
}

async function deliverApprovedFix(
  context: SecurityScanServiceContext,
  finding: SecurityScanFinding,
): Promise<SecurityScanDeliveryResult> {
  try {
    await commitFileAndPushCloudCodeSession(
      context.db,
      context.owner,
      context.sessionId,
      context.planTier,
      `${COMMIT_SUBJECT_PREFIX}${finding.title}`,
      finding.path,
    );
  } catch (error) {
    logger.warn({ error, sessionId: context.sessionId }, '[security-scan] fix push failed');
    return {
      status: SECURITY_SCAN_STATUS.failed,
      pullRequestUrl: null,
      error: deliveryError(error),
    };
  }
  try {
    const pullRequest = await openCloudCodeSessionPullRequest(
      context.db,
      context.owner,
      context.sessionId,
    );
    return { status: 'pushed', pullRequestUrl: pullRequest.url, error: null };
  } catch (error) {
    logger.warn({ error, sessionId: context.sessionId }, '[security-scan] pull request failed');
    return { status: 'pushed', pullRequestUrl: null, error: deliveryError(error) };
  }
}

export async function decideSecurityScanFinding(
  context: SecurityScanServiceContext,
  input: { scanId: string; findingId: string; decision: SecurityScanDecision },
): Promise<SecurityScanDecisionResponse> {
  const decided = await withSecurityScanWorkspace(
    context.db,
    context.owner,
    context.sessionId,
    context.planTier,
    async (workspace) => {
      const report = await workspace.readReport();
      if (report?.status !== SECURITY_SCAN_STATUS.completed || report.scanId !== input.scanId) {
        throw new CloudCodeConflictError(
          'These findings are from an earlier scan. Reload to see the latest one.',
        );
      }
      const finding = report.findings.find((entry) => entry.id === input.findingId);
      if (!finding) throw new CloudCodeNotFoundError();
      if (finding.state !== 'open') {
        throw new CloudCodeConflictError('This finding has already been decided');
      }

      if (input.decision === 'approve') {
        await assertOnlyTheFixWillShip(workspace);
        const status = await workspace.run(`git status --porcelain -- ${shellQuote(finding.path)}`);
        if (!status.ok) throw new CloudCodeUnavailableError('Workspace status could not be read');
        if (status.stdout.trim().length > 0) {
          throw new CloudCodeConflictError(
            `${finding.path} has uncommitted changes. Commit or discard them, then approve the fix.`,
          );
        }
        const patchPath = await stagePatch(workspace, finding.id, finding.patch);
        const applied = patchPath
          ? await workspace.run(`git apply ${shellQuote(patchPath)}`)
          : null;
        if (!applied?.ok || applied.exitCode !== 0) {
          throw new CloudCodeConflictError(
            `${finding.path} changed after the scan, so the fix no longer applies. Run a new scan.`,
          );
        }
      }

      const decidedFinding: SecurityScanFinding = {
        ...finding,
        state: input.decision === 'approve' ? 'approved' : 'dismissed',
        decidedAt: new Date().toISOString(),
      };
      const updated: SecurityScanCompletedReport = {
        ...report,
        findings: report.findings.map((entry) =>
          entry.id === decidedFinding.id ? decidedFinding : entry,
        ),
      };
      await workspace.writeReport(updated);
      return { report: updated, finding: decidedFinding };
    },
  );

  const delivery =
    input.decision === 'approve' ? await deliverApprovedFix(context, decided.finding) : null;
  return { report: decided.report, delivery };
}
