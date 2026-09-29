import { z } from 'zod';
import { CLOUD_CODE_LIMITS, CLOUD_CODE_NETWORK_ACCESS } from '@agiworkforce/types';
import type {
  DeveloperSessionHandoff,
  HandoffAdmission,
  HandoffRefusal,
} from '@agiworkforce/types/protocol';
import { CLOUD_CODE_SESSIONS_PATH, CloudCodeSessionSchema } from './cloud-code-sessions';

export const CLOUD_CODE_HANDOFF_PATH = `${CLOUD_CODE_SESSIONS_PATH}/handoff`;

export const CLOUD_CODE_HANDOFF_MAX_AGE_SECONDS = 15 * 60;

export const CLOUD_CODE_HANDOFF_REFUSED_CODE = 'HANDOFF_REFUSED';

const HANDOFF_TEXT_LIMIT = 4_000;
const HANDOFF_LIST_LIMIT = 200;

const HandoffEnvironmentSchema = z.enum(['local', 'cloud']);

const HandoffWorkspaceSchema = z.object({
  cwd: z.string(),
  worktreeRoot: z.string().optional(),
  repository: z.string().max(500).optional(),
  branch: z.string().max(255).optional(),
  headCommit: z.string().max(64).optional(),
  uncommittedChanges: z.boolean().optional().default(false),
});

const HandoffPostureSchema = z.object({
  agentMode: z.enum(['ask', 'auto', 'plan', 'bypass']),
  trustMode: z.enum(['local', 'byok', 'managed', 'unknown']),
  permissionProfileId: z.string(),
});

const HandoffDecisionSchema = z.object({
  summary: z.string().max(HANDOFF_TEXT_LIMIT),
  rationale: z.string().max(HANDOFF_TEXT_LIMIT).optional(),
  decidedAt: z.string(),
});

const HandoffPlanStepSchema = z.object({
  description: z.string().max(HANDOFF_TEXT_LIMIT),
  state: z.enum(['pending', 'in_progress', 'done', 'abandoned']),
});

const HandoffFileChangeSchema = z.object({
  path: z.string().max(1_024),
  kind: z.enum(['created', 'modified', 'deleted']),
});

const HandoffValidationSchema = z.object({
  command: z.string().max(HANDOFF_TEXT_LIMIT),
  outcome: z.enum(['passed', 'failed', 'interrupted']),
  ranAt: z.string(),
  commit: z.string().optional(),
});

const HandoffLastTurnSchema = z.object({
  turnId: z.string(),
  state: z.enum(['completed', 'interrupted']),
  model: z.string().optional(),
  endedAt: z.string(),
});

export const CloudCodeHandoffRecordSchema = z.object({
  protocolVersion: z.number().int().nonnegative(),
  threadId: z.string().min(1).max(200),
  origin: z.enum(['chat', 'work', 'developer_session']),
  issuedBy: z.enum(['cli', 'vscode', 'desktop', 'unknown']),
  issuedAt: z.string(),
  fromEnvironment: HandoffEnvironmentSchema,
  toEnvironment: HandoffEnvironmentSchema,
  workspace: HandoffWorkspaceSchema,
  posture: HandoffPostureSchema,
  objective: z.string().max(HANDOFF_TEXT_LIMIT).optional(),
  decisions: z.array(HandoffDecisionSchema).max(HANDOFF_LIST_LIMIT).optional().default([]),
  plan: z.array(HandoffPlanStepSchema).max(HANDOFF_LIST_LIMIT).optional().default([]),
  modifiedFiles: z.array(HandoffFileChangeSchema).max(HANDOFF_LIST_LIMIT).optional().default([]),
  validations: z.array(HandoffValidationSchema).max(HANDOFF_LIST_LIMIT).optional().default([]),
  pendingApprovals: z.array(z.unknown()).max(HANDOFF_LIST_LIMIT).optional().default([]),
  lastTurn: HandoffLastTurnSchema.optional(),
  localResources: z
    .array(
      z.enum([
        'background_shell',
        'dev_server',
        'mcp_server',
        'sandbox',
        'file_watcher',
        'terminal',
      ]),
    )
    .optional()
    .default([]),
  issuedForAccount: z.string().optional(),
});

export type CloudCodeHandoffRecord = z.infer<typeof CloudCodeHandoffRecordSchema>;

export const CloudCodeHandoffRequestSchema = z.object({
  handoff: CloudCodeHandoffRecordSchema,
  networkAccess: z.enum(CLOUD_CODE_NETWORK_ACCESS).default('trusted'),
  runtimeId: z.string().min(1).nullable().optional(),
  repository: z
    .object({
      installationId: z.number().int().positive(),
      fullName: z.string().min(1),
    })
    .nullable()
    .optional(),
});

export type CloudCodeHandoffRequest = z.input<typeof CloudCodeHandoffRequestSchema>;

export const CLOUD_CODE_HANDOFF_WARNINGS = ['uncommitted_changes_not_included'] as const;

export type CloudCodeHandoffWarning = (typeof CLOUD_CODE_HANDOFF_WARNINGS)[number];

export const CloudCodeHandoffResponseSchema = z.object({
  session: CloudCodeSessionSchema,
  start: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('resume'), threadId: z.string() }),
    z.object({ kind: z.literal('seed'), seededFromThreadId: z.string() }),
  ]),
  seedPrompt: z.string(),
  warnings: z.array(z.enum(CLOUD_CODE_HANDOFF_WARNINGS)),
});

export type CloudCodeHandoffResponse = z.infer<typeof CloudCodeHandoffResponseSchema>;

export interface CloudCodeHandoffAdmissionContext {
  now: Date;
  accountFingerprint: string;
  supportedProtocolVersions: readonly number[];
}

export type CloudCodeHandoffAdmissionResult =
  { ok: true; admission: HandoffAdmission } | { ok: false; refusal: HandoffRefusal };

export function cloudCodeHandoffReceipt(
  handoff: Pick<DeveloperSessionHandoff, 'threadId' | 'issuedAt'>,
): string {
  return `${handoff.threadId}@${handoff.issuedAt}`;
}

export function admitCloudCodeHandoff(
  handoff: CloudCodeHandoffRecord,
  context: CloudCodeHandoffAdmissionContext,
): CloudCodeHandoffAdmissionResult {
  if (!context.supportedProtocolVersions.includes(handoff.protocolVersion)) {
    return {
      ok: false,
      refusal: {
        reason: 'protocolVersionUnsupported',
        requestedProtocolVersion: handoff.protocolVersion,
        supportedProtocolVersions: [...context.supportedProtocolVersions],
      },
    };
  }
  if (handoff.toEnvironment !== 'cloud') {
    return {
      ok: false,
      refusal: { reason: 'wrongDestination', expected: 'cloud', received: handoff.toEnvironment },
    };
  }
  if (handoff.posture.trustMode === 'unknown') {
    return { ok: false, refusal: { reason: 'trustModeUnknown' } };
  }
  const issuedAt = Date.parse(handoff.issuedAt);
  const ageSeconds = Math.floor((context.now.getTime() - issuedAt) / 1000);
  if (
    !Number.isFinite(issuedAt) ||
    ageSeconds < 0 ||
    ageSeconds > CLOUD_CODE_HANDOFF_MAX_AGE_SECONDS
  ) {
    return {
      ok: false,
      refusal: {
        reason: 'expired',
        issuedAt: handoff.issuedAt,
        maxAgeSeconds: CLOUD_CODE_HANDOFF_MAX_AGE_SECONDS,
      },
    };
  }
  if (handoff.issuedForAccount !== context.accountFingerprint) {
    return { ok: false, refusal: { reason: 'wrongAccount' } };
  }
  const interruptedTurn =
    handoff.lastTurn?.state === 'interrupted' ? handoff.lastTurn.turnId : undefined;
  return {
    ok: true,
    admission: {
      start:
        handoff.origin === 'developer_session'
          ? { kind: 'resume', threadId: handoff.threadId }
          : { kind: 'seed', seededFromThreadId: handoff.threadId },
      ...(handoff.localResources.length > 0 ? { restart: handoff.localResources } : {}),
      ...(interruptedTurn ? { interruptedTurn } : {}),
    },
  };
}

export function describeCloudCodeHandoffRefusal(refusal: HandoffRefusal): string {
  switch (refusal.reason) {
    case 'protocolVersionUnsupported':
      return `This handoff uses protocol version ${refusal.requestedProtocolVersion}, which managed Code does not accept. Update the CLI and hand off again.`;
    case 'wrongDestination':
      return 'This handoff is addressed to a local session, not to managed Code.';
    case 'trustModeUnknown':
      return 'The session has no known trust boundary. Choose one before handing it off.';
    case 'expired':
      return `This handoff was issued at ${refusal.issuedAt} and is good for ${Math.round(refusal.maxAgeSeconds / 60)} minutes. Hand off again from the origin.`;
    case 'replayed':
      return 'This handoff was already taken.';
    case 'wrongAccount':
      return 'This handoff belongs to a different account than the one signed in.';
  }
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : ['', `## ${title}`, ...lines];
}

export function buildCloudCodeHandoffSeedPrompt(
  handoff: CloudCodeHandoffRecord,
  admission: HandoffAdmission,
): string {
  const workspace = handoff.workspace;
  const where = [
    workspace.branch ? `branch ${workspace.branch}` : null,
    workspace.headCommit ? `commit ${workspace.headCommit}` : null,
  ].filter((part): part is string => part !== null);
  const prompt = [
    `Continue this coding session, handed off from ${handoff.issuedBy === 'unknown' ? 'another surface' : handoff.issuedBy}.`,
    ...(where.length > 0 ? [`The origin was working on ${where.join(' at ')}.`] : []),
    ...(workspace.uncommittedChanges
      ? [
          'The origin had uncommitted changes that are not in this checkout. Treat the files listed below as possibly missing their latest edits and ask before recreating them.',
        ]
      : []),
    ...(admission.interruptedTurn
      ? [
          'The last turn on the origin was interrupted before it finished. Do not assume it completed.',
        ]
      : []),
    ...section('Objective', handoff.objective ? [handoff.objective] : []),
    ...section(
      'Decisions to keep',
      handoff.decisions.map(
        (decision) =>
          `- ${decision.summary}${decision.rationale ? ` (${decision.rationale})` : ''}`,
      ),
    ),
    ...section(
      'Plan',
      handoff.plan.map((step) => `- [${step.state}] ${step.description}`),
    ),
    ...section(
      'Files changed on the origin',
      handoff.modifiedFiles.map((file) => `- ${file.kind}: ${file.path}`),
    ),
    ...section(
      'Checks run on the origin',
      handoff.validations.map((check) => `- ${check.outcome}: ${check.command}`),
    ),
    ...section(
      'Approvals still pending',
      handoff.pendingApprovals.length > 0
        ? [
            `${handoff.pendingApprovals.length} approval request(s) were open on the origin. Ask for them again here; none carries over.`,
          ]
        : [],
    ),
  ].join('\n');
  return prompt.length > CLOUD_CODE_LIMITS.task ? prompt.slice(0, CLOUD_CODE_LIMITS.task) : prompt;
}
