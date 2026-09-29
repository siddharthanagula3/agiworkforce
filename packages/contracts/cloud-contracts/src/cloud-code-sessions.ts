import { z } from 'zod';
import {
  CLOUD_CODE_AGENT_STOP_REASONS,
  CLOUD_CODE_CHANGE_STATES,
  CLOUD_CODE_NETWORK_ACCESS,
  CLOUD_CODE_SESSION_STATES,
  CLOUD_CODE_SHARE_VISIBILITIES,
  CLOUD_CODE_TURN_MODES,
  type CloudCodeTurnMode,
} from '@agiworkforce/types';

export const CLOUD_CODE_SESSIONS_PATH = '/api/code/sessions';
export const CLOUD_CODE_SHARED_SESSIONS_PATH = '/api/code/shared';
export const CLOUD_CODE_REPOSITORIES_PATH = '/api/github/repositories';
export const CLOUD_CODE_BRANCHES_PATH = '/api/code/repositories/branches';

export const GITHUB_INSTALL_APP_START_PATH = '/api/github/install/app-start';
export const GITHUB_INSTALL_COMPLETE_PATH = '/api/github/install/complete';
export const GITHUB_INSTALL_APP_LINK_RETURN_URL = 'https://agiworkforce.com/github/installed';
export const GITHUB_INSTALL_PENDING_PATH = '/api/github/install/pending';

export const GITHUB_INSTALL_CONNECT_PAGE_PATH = '/github/connect';

export const GitHubInstallPendingRequestSchema = z.object({
  state: z.string().regex(/^[a-f0-9]{64}$/),
});
export type GitHubInstallPendingRequest = z.infer<typeof GitHubInstallPendingRequestSchema>;

export const GitHubInstallPendingResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    accountLogin: z.string().min(1).max(256),
    accountType: z.enum(['User', 'Organization']),
  }),
  z.object({ status: z.literal('invalid_state') }),
  z.object({ status: z.literal('unavailable') }),
]);
export type GitHubInstallPendingResponse = z.infer<typeof GitHubInstallPendingResponseSchema>;

export const GitHubInstallAppStartResponseSchema = z.object({
  url: z.string().url(),
});
export type GitHubInstallAppStartResponse = z.infer<typeof GitHubInstallAppStartResponseSchema>;

export const GITHUB_INSTALL_COMPLETE_STATUSES = [
  'connected',
  'already_linked',
  'ownership_failed',
  'denied',
  'invalid_state',
  'failed',
] as const;
export type GitHubInstallCompleteStatus = (typeof GITHUB_INSTALL_COMPLETE_STATUSES)[number];

export const GitHubInstallCompleteRequestSchema = z.object({
  state: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().min(1).max(512).optional(),
  error: z.string().max(64).optional(),
});
export type GitHubInstallCompleteRequest = z.infer<typeof GitHubInstallCompleteRequestSchema>;

export const GitHubInstallCompleteResponseSchema = z.object({
  status: z.enum(GITHUB_INSTALL_COMPLETE_STATUSES),
});
export type GitHubInstallCompleteResponse = z.infer<typeof GitHubInstallCompleteResponseSchema>;

export function cloudCodeSessionPath(sessionId: string): string {
  return `${CLOUD_CODE_SESSIONS_PATH}/${encodeURIComponent(sessionId)}`;
}

export const CloudCodeSessionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  repositoryUrl: z.string().nullable(),
  repositoryBranch: z.string().nullable().default(null),
  networkAccess: z.enum(CLOUD_CODE_NETWORK_ACCESS),
  runtimeId: z.string().nullable().default(null),
  extraHosts: z.array(z.string()).default([]),
  state: z.enum(CLOUD_CODE_SESSION_STATES),
  workspacePath: z.string(),
  workingBranch: z.string().nullable().default(null),
  baseBranch: z.string().nullable().default(null),
  pullRequestUrl: z.string().nullable().default(null),
  pullRequestNumber: z.number().int().nullable().default(null),
  archivedAt: z.string().datetime().nullable().default(null),
  contextInputTokens: z.number().int().nonnegative().default(0),
  contextOutputTokens: z.number().int().nonnegative().default(0),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  shareVisibility: z.enum(CLOUD_CODE_SHARE_VISIBILITIES).optional(),
  shareAudience: z.enum(['team', 'public']).optional(),
  shareToken: z.string().nullable().optional(),
});

export const CloudCodeTerminalEntrySchema = z.object({
  id: z.string(),
  sessionId: z.string().uuid(),
  command: z.string(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

export const CloudCodeRuntimeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['harness', 'image']),
  summary: z.string(),
  agentCommand: z.string().nullable(),
  cpuCount: z.number().nonnegative(),
  memoryMB: z.number().nonnegative(),
  diskSizeMB: z.number().nonnegative(),
  isPublic: z.boolean(),
  needsUserCredential: z.boolean().optional(),
  runsOwnAgent: z.boolean().optional(),
});

export const CloudCodeSessionListSchema = z.object({
  availability: z.object({
    deploymentEnabled: z.boolean(),
    storageReady: z.boolean(),
    planEntitled: z.boolean(),
    planTier: z.string(),
    maxSessions: z.number().int().nonnegative(),
  }),
  sessions: z.array(CloudCodeSessionSchema),
  runtimes: z.array(CloudCodeRuntimeSchema).default([]),
});

export const CloudCodeRepositorySchema = z.object({
  installationId: z.number().int().positive(),
  owner: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().min(1),
  defaultBranch: z.string().nullable(),
  isPrivate: z.boolean(),
});

export const CloudCodeRepositoryListSchema = z.object({
  repositories: z.array(CloudCodeRepositorySchema),
  installationCount: z.number().int().nonnegative(),
  truncated: z.boolean().default(false),
  unreachable: z
    .array(z.object({ installationId: z.number().int(), accountLogin: z.string() }))
    .default([]),
});

export const CloudCodeBranchSchema = z.object({
  name: z.string().min(1),
  isProtected: z.boolean(),
});

export const CloudCodeBranchListSchema = z.object({
  branches: z.array(CloudCodeBranchSchema),
  truncated: z.boolean().default(false),
});

export const CloudCodeAgentStepSchema = z.object({
  index: z.number().int().nonnegative(),
  toolName: z.string(),
  label: z.string().nullable(),
  output: z.string(),
  isError: z.boolean(),
});

export const CloudCodeAgentTurnRecordSchema = z.object({
  turnId: z.string(),
  goal: z.string(),
  mode: z.enum(CLOUD_CODE_TURN_MODES).default('agent'),
  stopReason: z.enum(CLOUD_CODE_AGENT_STOP_REASONS).nullable(),
  stepsUsed: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  cancelRequestedAt: z.string().nullable().default(null),
  finalMessage: z.string(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  steps: z.array(CloudCodeAgentStepSchema),
});

export const CloudCodeSessionDetailSchema = z.object({
  session: CloudCodeSessionSchema,
  terminalEntries: z.array(CloudCodeTerminalEntrySchema),
  turns: z.array(CloudCodeAgentTurnRecordSchema).default([]),
});

export const CloudCodeSessionResponseSchema = z.object({ session: CloudCodeSessionSchema });

export const CloudCodeSharedSessionSchema = z.object({
  visibility: z.enum(['team', 'public']),
  ownerName: z.string().nullable(),
  title: z.string(),
  repositoryUrl: z.string().nullable(),
  workingBranch: z.string().nullable(),
  baseBranch: z.string().nullable(),
  pullRequestUrl: z.string().nullable(),
  pullRequestNumber: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  terminalEntries: z.array(CloudCodeTerminalEntrySchema),
  turns: z.array(CloudCodeAgentTurnRecordSchema),
});
export const CloudCodeSessionDeletedSchema = z.object({ deleted: z.literal(true) });

export const CloudCodeCommandResponseSchema = z.object({
  session: CloudCodeSessionSchema,
  terminalEntry: CloudCodeTerminalEntrySchema,
});

export const CloudCodeCommitResultSchema = z.object({
  session: CloudCodeSessionSchema,
  push: z.object({
    ok: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
    exitCode: z.number().int(),
  }),
});

export const CloudCodeChangedFileSchema = z.object({
  path: z.string(),
  state: z.enum(CLOUD_CODE_CHANGE_STATES),
});

export const CloudCodeChangesSchema = z.object({
  session: CloudCodeSessionSchema,
  base: z.string().nullable(),
  workingBranch: z.string().nullable(),
  files: z.array(CloudCodeChangedFileSchema),
  diff: z.string(),
  diffTruncated: z.boolean().default(false),
});

export const CloudCodeDiscardResultSchema = z.object({
  session: CloudCodeSessionSchema,
  discarded: z.array(z.string()),
});

export const CloudCodePullRequestSchema = z.object({
  session: CloudCodeSessionSchema,
  url: z.string(),
  number: z.number().int().positive(),
  alreadyOpen: z.boolean(),
});

export const CloudCodePullRequestStatusSchema = z.object({
  number: z.number().int().positive(),
  url: z.string(),
  state: z.enum(['open', 'closed']),
  draft: z.boolean(),
  merged: z.boolean(),
  checksState: z.enum(['none', 'pending', 'passing', 'failing']),
  failedChecks: z.array(z.string()),
  reviewState: z.enum(['none', 'commented', 'approved', 'changes_requested']),
});

export const CloudCodeTurnCancellationSchema = z.object({
  turnId: z.string(),
  requestedAt: z.string(),
  /** Optional on the wire: the surface does not need it, an operator reading a log does. */
  durable: z.boolean().optional(),
});

export const CloudCodePendingApprovalSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  toolUseId: z.string(),
  command: z.string(),
  reason: z.string(),
});

export const CloudCodeAgentTurnSchema = z.object({
  turnId: z.string(),
  stopReason: z.enum(CLOUD_CODE_AGENT_STOP_REASONS),
  stepsUsed: z.number().int().nonnegative(),
  finalMessage: z.string(),
  steps: z.array(CloudCodeAgentStepSchema).default([]),
  pendingApproval: CloudCodePendingApprovalSchema.optional(),
  errorMessage: z.string().optional(),
});

export const CloudCodeAgentApprovalsSchema = z.object({
  approvals: z.array(
    z.object({
      turnId: z.string(),
      stepIndex: z.number().int().nonnegative(),
      command: z.string(),
      reason: z.string(),
      goal: z.string(),
      expiresAt: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export type CloudCodeAgentTurn = z.infer<typeof CloudCodeAgentTurnSchema>;
export type CloudCodeAgentApproval = z.infer<
  typeof CloudCodeAgentApprovalsSchema
>['approvals'][number];
export type CloudCodeApprovalDecision = 'approve' | 'reject';
export type CloudCodeCommitResult = z.infer<typeof CloudCodeCommitResultSchema>;
export type CloudCodeRepository = z.infer<typeof CloudCodeRepositorySchema>;
export type CloudCodeChanges = z.infer<typeof CloudCodeChangesSchema>;
export type CloudCodeDiscardResult = z.infer<typeof CloudCodeDiscardResultSchema>;
export type CloudCodePullRequest = z.infer<typeof CloudCodePullRequestSchema>;
export type CloudCodePullRequestStatus = z.infer<typeof CloudCodePullRequestStatusSchema>;
export type CloudCodeTurnCancellation = z.infer<typeof CloudCodeTurnCancellationSchema>;
export type CloudCodeRepositoryList = z.infer<typeof CloudCodeRepositoryListSchema>;
export type CloudCodeBranch = z.infer<typeof CloudCodeBranchSchema>;
export type CloudCodeBranchList = z.infer<typeof CloudCodeBranchListSchema>;

export interface StartCloudCodeAgentTurnRequest {
  goal: string;
  model: string;
  /** Sent as `Idempotency-Key`; the managed-usage ledger refuses the turn without it. */
  idempotencyKey: string;
  maxSteps?: number;
  mode?: CloudCodeTurnMode;
}

export interface CommitCloudCodeSessionRequest {
  message: string;
  files?: string[];
}

export interface DecideCloudCodeApprovalRequest {
  turnId: string;
  stepIndex: number;
  decision: CloudCodeApprovalDecision;
}

export const CLOUD_CODE_TURN_STILL_RUNNING_CODE = 'turn_still_running';

export type CloudCodeSessionReply = z.input<typeof CloudCodeSessionResponseSchema>;
export type CloudCodeCommandReply = z.input<typeof CloudCodeCommandResponseSchema>;
export type CloudCodeChangesReply = z.input<typeof CloudCodeChangesSchema>;
export type CloudCodeDiscardReply = z.input<typeof CloudCodeDiscardResultSchema>;
export type CloudCodePullRequestReply = z.input<typeof CloudCodePullRequestSchema>;
export type CloudCodePullRequestStatusReply = z.input<typeof CloudCodePullRequestStatusSchema>;
export type CloudCodeTurnCancellationReply = z.input<typeof CloudCodeTurnCancellationSchema>;
export type CloudCodeAgentTurnReply = z.input<typeof CloudCodeAgentTurnSchema>;
export type CloudCodeAgentApprovalsReply = z.input<typeof CloudCodeAgentApprovalsSchema>;
export type CloudCodeSharedSessionReply = z.input<typeof CloudCodeSharedSessionSchema>;
