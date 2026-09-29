import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { type Readable, type Writable } from 'node:stream';
import { z } from 'zod';
import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import type {
  AgentEventApprovalRiskLevel,
  AgentEventEnvelope,
  TurnFailureAction,
  TurnFailureCode,
} from '@agiworkforce/types/protocol';
import type {
  AppServerCapabilities,
  AppServerNotification,
  ApprovalResponseParams,
  InitializeResponse,
  LocalModelListResponse,
  ThreadListParams,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadStartParams,
  ThreadSummary,
  TurnInterruptParams,
  TurnSteerParams,
  TurnStartParams,
  TurnSummary,
} from '@agiworkforce/types';
import type {
  AccountLoginResponse,
  AccountLoginWaitResponse,
  AccountStatusResponse,
  AccountTokenResponse,
  ContextInstructionsResponse,
  HookAddParams,
  HookListResponse,
  HookRemoveParams,
  McpAddParams,
  McpLoginResponse,
  McpServerListResponse,
  McpServerToolsResponse,
  PluginInstallParams,
  PluginListResponse,
  SettingsReadResponse,
  SettingsWriteParams,
  SkillConsentResponse,
  SkillListResponse,
  SlashCommandListResponse,
  SlashCommandRunResponse,
  ThreadRewindParams,
} from '@agiworkforce/types/protocol';
import type {
  DeveloperSessionHandoff,
  HandoffAdmission,
  HandoffEnvironment,
} from '@agiworkforce/types/protocol';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  DEVELOPER_SESSION_PROTOCOL_VERSION as SUPPORTED_PROTOCOL_VERSION,
  MINIMUM_SUPPORTED_RUNTIME_VERSION as MINIMUM_SUPPORTED_CLI_VERSION_LABEL,
  PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
  isSupportedRuntimeVersion as isSupportedCliVersion,
  messageKindForAgentEvent,
} from '@agiworkforce/types';
import { redactTelemetryText } from '../core/telemetry';
import { trackRuntimeChild } from './runtimeProcessRegistry';

const MAX_LINE_BYTES = 4 * 1024 * 1024;
const MAX_REJECTED_LINE_CHARS = 400;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const SHUTDOWN_ACK_TIMEOUT_MS = 7_000;
// A device grant runs at the user's pace in a browser, and an MCP sign-in
// opens one too, so neither fits the default request timeout.
const ACCOUNT_LOGIN_WAIT_TIMEOUT_MS = 15 * 60_000;
const MCP_LOGIN_TIMEOUT_MS = 5 * 60_000;
const MCP_PROBE_TIMEOUT_MS = 90_000;
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const SHUTDOWN_EXIT_TIMEOUT_MS = 2_000;
const HARD_KILL_TIMEOUT_MS = 2_000;
const CLI_PATH_SETTING = 'agiWorkforce.cliPath';

export const CLI_NOT_FOUND_MARKER = 'AGI_CLI_NOT_FOUND';
export const CLI_NOT_EXECUTABLE_MARKER = 'AGI_CLI_NOT_EXECUTABLE';

export function cliAcquisitionHint(): string {
  return `Run "AGI Workforce: Install AGI CLI" to install AGI CLI ${MINIMUM_SUPPORTED_CLI_VERSION_LABEL} or newer, or set ${CLI_PATH_SETTING} to one you already have.`;
}

function describeSpawnFailure(cliPath: string, error: Error, environmentLabel?: string): Error {
  const code = (error as NodeJS.ErrnoException).code;
  const target = JSON.stringify(cliPath);
  const looksLikePath = cliPath.includes('/') || cliPath.includes('\\');
  if (code === 'ENOENT') {
    const inside = environmentLabel === undefined ? '' : ` in ${environmentLabel}`;
    const where = looksLikePath
      ? `No file exists at ${target}${inside}.`
      : `${target} is not on the PATH this editor was launched with${inside}.`;
    return new Error(
      `${CLI_NOT_FOUND_MARKER}: The AGI CLI could not be started. ${where} ${cliAcquisitionHint()}`,
    );
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new Error(
      `${CLI_NOT_EXECUTABLE_MARKER}: ${target} exists but this editor is not allowed to run it. Grant it execute permission, or point ${CLI_PATH_SETTING} at an executable AGI CLI ${MINIMUM_SUPPORTED_CLI_VERSION_LABEL} or newer.`,
    );
  }
  return new Error(`The AGI CLI at ${target} could not be started, ${error.message}`);
}

const errorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});

const responseSchema = z.object({
  jsonrpc: z.literal('2.0').optional(),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.unknown().optional(),
  error: errorSchema.optional(),
});

const acknowledgedResponseSchema = z.object({ acknowledged: z.literal(true) }).strict();

const notificationSchema = z.object({
  jsonrpc: z.literal('2.0').optional(),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

const trustModeSchema = z.enum(['local', 'byok', 'managed', 'unknown']).catch('unknown');

const capabilitiesSchema = z.object({
  threads: z.boolean(),
  turns: z.boolean(),
  streaming: z.boolean(),
  approvals: z.boolean(),
  tools: z.boolean(),
  mcp: z.boolean(),
  checkpoints: z.boolean(),
  worktrees: z.boolean(),
  models: z.boolean(),
  account: z.boolean().optional(),
  instructions: z.boolean().optional(),
  skills: z.boolean().optional(),
  plugins: z.boolean().optional(),
  hooks: z.boolean().optional(),
  settings: z.boolean().optional(),
  commands: z.boolean().optional(),
  threadDelete: z.boolean().optional(),
  reconnect: z.boolean().optional(),
  writerLease: z.boolean().optional(),
  installs: z.boolean().optional(),
  mcpTools: z.boolean().optional(),
  approvalNotes: z.boolean().optional(),
  approvalEdits: z.boolean().optional(),
  threadUnarchive: z.boolean().optional(),
  threadSearch: z.boolean().optional(),
  forkAtMessage: z.boolean().optional(),
  promptCommands: z.boolean().optional(),
  maxTurns: z.boolean().optional(),
  memory: z.boolean().optional(),
  plan: z.boolean().optional(),
  savedPermissions: z.boolean().optional(),
  mcpInspect: z.boolean().optional(),
  pluginUpdates: z.boolean().optional(),
  permissionRules: z.boolean().optional(),
  trust: z.boolean().optional(),
  turnToolFilters: z.boolean().optional(),
  providerKeys: z.boolean().optional(),
  questions: z.boolean().optional(),
  planDecisions: z.boolean().optional(),
  pullRequests: z.boolean().optional(),
});

const worktreeSummarySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  branch: z.string(),
  hasWork: z.boolean(),
});

const worktreeListSchema = z.object({ worktrees: z.array(worktreeSummarySchema) });

export type WorktreeSummary = z.infer<typeof worktreeSummarySchema>;

const memoryAddResponseSchema = z.object({
  scope: z.enum(['user', 'project', 'local']),
  path: z.string().min(1),
});

export type MemoryAddResult = z.infer<typeof memoryAddResponseSchema>;

const initializeResponseSchema = z.object({
  serverInfo: z.object({ name: z.string(), title: z.string(), version: z.string() }),
  protocolVersion: z.number().int().positive(),
  capabilities: capabilitiesSchema,
  agentEventSchemaVersion: z.number().int().positive().optional(),
  minimumProtocolVersion: z.number().int().positive().optional(),
});

const protocolVersionUnsupportedDataSchema = z.object({
  requestedProtocolVersion: z.number().int().nonnegative(),
  supportedProtocolVersions: z.array(z.number().int().positive()).min(1),
  minimumProtocolVersion: z.number().int().positive(),
});

const legacyInitializeResponseSchema = z.object({
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
  capabilities: z.object({
    streaming: z.boolean(),
    tools: z.boolean(),
  }),
});

const threadWriterSchema = z.object({
  holderId: z.string().min(1).max(64),
  holderLabel: z.string().min(1).max(200),
  acquiredAt: z.string(),
  expiresAt: z.string(),
  heldByThisHost: z.boolean(),
  stale: z.boolean(),
});

const threadSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().max(500),
  model: z.string().min(1).max(200).optional(),
  cwd: z.string().min(1).max(16_384).optional(),
  provider: z
    .string()
    .min(1)
    .max(200)
    .refine(
      (value) =>
        Array.from(value).every((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint > 0x1f && (codePoint < 0x7f || codePoint > 0x9f);
        }),
      { message: 'Provider metadata contains control characters' },
    )
    .optional(),
  trustMode: trustModeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.enum(['cli', 'vscode', 'desktop', 'unknown']).catch('unknown'),
  status: z
    .enum(['idle', 'running', 'awaiting_approval', 'archived', 'failed', 'unknown'])
    .catch('unknown'),
  gitBranch: z.string().min(1).max(512).optional(),
  worktreeRoot: z.string().min(1).max(16_384).optional(),
  client: z.string().min(1).max(200).optional(),
  writer: threadWriterSchema.optional().catch(undefined),
});

const threadStartResponseSchema = z.object({ thread: threadSummarySchema });
// The record is the contract's, so the wire is checked for presence and shape
// here and read as the generated type rather than described a second time.
const handoffResponseSchema = z.object({
  handoff: z.object({ protocolVersion: z.number().int().positive() }).passthrough(),
});
const handoffAdmissionSchema = z.object({
  admission: z
    .object({ start: z.object({ kind: z.enum(['resume', 'seed']) }).passthrough() })
    .passthrough(),
});
const threadListResponseSchema = z.object({
  threads: z.array(threadSummarySchema),
  nextCursor: z.string().optional(),
});
const developerStepStatusSchema = z.enum([
  'pending',
  'in_progress',
  'done',
  'blocked',
  'skipped',
  'superseded',
]);

const threadReadResponseSchema = z.object({
  thread: threadSummarySchema,
  plan: z
    .array(
      z.object({
        description: z.string().max(4_000),
        status: developerStepStatusSchema,
        notes: z.string().max(8_000).optional(),
      }),
    )
    .max(200)
    .optional()
    .catch(undefined),
  todos: z
    .array(
      z.object({
        content: z.string().max(4_000),
        status: developerStepStatusSchema,
        priority: z.string().max(40),
      }),
    )
    .max(500)
    .optional()
    .catch(undefined),
  messages: z
    .array(
      z.object({
        role: z.string().min(1).max(40),
        text: z.string().max(1_000_000),
        index: z.number().int().nonnegative().optional(),
      }),
    )
    .max(10_000),
  transcriptTruncated: z.boolean(),
  approvals: z
    .array(
      z.object({
        requestId: z.string(),
        kind: z.string(),
        summary: z.string(),
        outcome: z.enum([
          'allow_once',
          'allow_session',
          'always_allow',
          'deny',
          'cancel',
          'timeout',
        ]),
        requestedAt: z.string(),
        decidedAt: z.string(),
      }),
    )
    .optional()
    .catch(undefined),
  fileChanges: z
    .array(
      z.object({
        path: z.string(),
        kind: z.enum(['created', 'modified', 'deleted']),
        tool: z.string(),
        toolCallId: z.string(),
        changedAt: z.string(),
        reason: z.string().optional(),
      }),
    )
    .optional()
    .catch(undefined),
});
const threadCheckpointsResponseSchema = z.object({
  checkpoints: z
    .array(
      z.object({
        checkpointIndex: z.number().int().nonnegative(),
        createdAt: z.string().max(64),
        prompt: z.string().max(1_000_000),
        messageIndex: z.number().int().nonnegative().optional(),
        trackedFiles: z.number().int().nonnegative(),
      }),
    )
    .max(10_000),
});

export type ThreadCheckpointList = z.infer<typeof threadCheckpointsResponseSchema>;

const threadSearchResponseSchema = z.object({
  hits: z
    .array(
      z.object({
        thread: threadSummarySchema,
        titleMatched: z.boolean(),
        matches: z
          .array(
            z.object({
              messageIndex: z.number().int().nonnegative(),
              role: z.string().max(40),
              snippet: z.string().max(4_000),
            }),
          )
          .max(200)
          .default([]),
      }),
    )
    .max(1_000),
});

export type ThreadSearchResults = z.infer<typeof threadSearchResponseSchema>;

const PULL_REQUEST_TIMEOUT_MS = 240_000;

const savedPermissionsResponseSchema = z.object({
  permissions: z
    .array(
      z.object({
        id: z.string().min(1).max(512),
        kind: z.enum(['command', 'file', 'exec_policy']),
        label: z.string().max(4_000),
        decision: z.enum(['allow', 'deny']),
      }),
    )
    .max(5_000),
});

export type SavedPermissionList = z.infer<typeof savedPermissionsResponseSchema>;

const permissionRulesResponseSchema = z.object({
  rules: z
    .array(
      z.object({
        id: z.string().min(1).max(512),
        kind: z.enum(['command', 'domain', 'file', 'exec_policy', 'mcp']),
        target: z.string().max(4_000),
        label: z.string().max(4_000),
        decision: z.enum(['allow', 'ask', 'deny']),
      }),
    )
    .max(5_000),
});

export type PermissionRuleList = z.infer<typeof permissionRulesResponseSchema>;
export type PermissionRule = PermissionRuleList['rules'][number];

const trustListResponseSchema = z.object({
  folders: z
    .array(
      z.object({
        path: z.string().min(1).max(16_384),
        trustedAt: z.string().max(200).nullish(),
        trustedBy: z.string().max(200).nullish(),
      }),
    )
    .max(5_000),
});

export type TrustedFolderList = z.infer<typeof trustListResponseSchema>;

const providerKeysResponseSchema = z.object({
  providers: z
    .array(
      z.object({
        provider: z.string().min(1).max(200),
        label: z.string().max(200),
        envVar: z.string().max(200),
        configured: z.boolean(),
      }),
    )
    .max(200),
  storage: z.string().max(200),
});

export type ProviderKeyList = z.infer<typeof providerKeysResponseSchema>;

const pullRequestPlanSchema = z.object({
  remote: z.string(),
  branch: z.string(),
  head: z.string(),
  base: z.string().optional(),
  commits: z.array(z.object({ commit: z.string(), subject: z.string() })).max(10_000),
  needsPush: z.boolean(),
  notices: z.array(z.string()),
  blocked: z.string().optional(),
});

export type PullRequestPlan = z.infer<typeof pullRequestPlanSchema>;

const pullRequestResultSchema = z.object({
  url: z.string().url(),
  created: z.boolean(),
  pushed: z.boolean(),
  note: z.string().optional(),
});

export type PullRequestResult = z.infer<typeof pullRequestResultSchema>;

const mcpServerInspectionSchema = z.object({
  name: z.string().min(1).max(512),
  connected: z.boolean(),
  live: z.boolean(),
  responding: z.boolean(),
  protocolVersion: z.string().max(200).optional(),
  serverName: z.string().max(512).optional(),
  serverVersion: z.string().max(200).optional(),
  capabilities: z.array(z.string().max(200)).max(100).default([]),
  instructions: z.string().max(100_000).optional(),
  logs: z.array(z.string().max(10_000)).max(1_000).default([]),
  error: z.string().max(10_000).optional(),
});

export type McpServerInspection = z.infer<typeof mcpServerInspectionSchema>;

const threadRewindResponseSchema = z.object({
  thread: threadSummarySchema,
  prompt: z.string().max(1_000_000),
  conversationRestored: z.boolean(),
  restoredFiles: z.array(z.string().max(16_384)).max(10_000).default([]),
  removedFiles: z.array(z.string().max(16_384)).max(10_000).default([]),
  skippedFiles: z
    .array(z.object({ path: z.string().max(16_384), reason: z.string().max(8_192) }))
    .max(10_000)
    .default([]),
});

export type ThreadRewindOutcome = z.infer<typeof threadRewindResponseSchema>;

const hostModelSummarySchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  reachable: z.boolean(),
  unreachable: z
    .object({
      code: z.string().min(1),
      action: z.enum([
        'sign_in_provider',
        'sign_in_account',
        'upgrade_plan',
        'open_settings',
        'retry',
        'none',
      ]),
      provider: z.string().optional(),
    })
    .optional(),
  trustMode: trustModeSchema,
});

const localModelListResponseSchema = z.object({
  models: z.array(
    z.object({
      id: z.string().min(1),
      provider: z.enum(['ollama', 'lmstudio']),
    }),
  ),
  hostModels: z.array(hostModelSummarySchema).optional(),
  localServers: z
    .array(
      z.object({
        provider: z.enum(['ollama', 'lmstudio']),
        health: z.enum(['running', 'not_running', 'unhealthy', 'blocked']),
        modelCount: z.number().int().nonnegative(),
        message: z.string().max(2_000).optional(),
      }),
    )
    .max(20)
    .optional()
    .catch(undefined),
});
const turnSummarySchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  status: z.enum(['running', 'completed', 'interrupted', 'failed', 'unknown']).catch('unknown'),
});
const turnStartResponseSchema = z.object({ turn: turnSummarySchema });

const accountStatusResponseSchema = z.object({
  signedIn: z.boolean(),
  email: z.string().max(320).optional(),
  tier: z.string().max(64).optional(),
  balanceCredits: z.number().optional(),
  purchasedCredits: z.number().optional(),
  cached: z.boolean(),
  source: z.literal('cli'),
  webSearchKey: z.string().max(64).optional(),
  webSearchLogins: z.array(z.string().max(64)).max(20).optional(),
});
const accountLoginResponseSchema = z.object({
  loginId: z.string().min(1).max(200),
  verificationUrl: z.string().url(),
  userCode: z.string().min(1).max(64).optional(),
  expiresAt: z.string().min(1).max(64).optional(),
});
const accountLoginWaitResponseSchema = z.object({
  outcome: z.enum(['completed', 'expired', 'failed']),
  message: z.string().max(2_000).optional(),
  account: accountStatusResponseSchema,
});
const accountTokenResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().min(1).max(64).optional(),
});
const contextInstructionsResponseSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(16_384),
        kind: z.enum(['AGENTS.md', 'CLAUDE.md', 'instructions.md']),
        bytes: z.number().int().nonnegative(),
        root: z.string().min(1).max(16_384),
      }),
    )
    .max(500),
  projectRoot: z.string().min(1).max(16_384).optional(),
  truncated: z.boolean(),
});
const skillListResponseSchema = z.object({
  skills: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(4_000),
        scope: z.enum(['project', 'user', 'plugin']),
        path: z.string().min(1).max(16_384),
        enabled: z.boolean(),
        consented: z.boolean(),
        requiredTools: z.array(z.string().max(200)).max(200).default([]),
        requiredEnvVars: z.array(z.string().max(200)).max(200).default([]),
        missingTools: z.array(z.string().max(200)).max(200).default([]),
        missingEnvVars: z.array(z.string().max(200)).max(200).default([]),
      }),
    )
    .max(2_000),
});
const skillConsentResponseSchema = z.object({
  consented: z.boolean(),
  path: z.string().min(1).max(16_384),
});
const pluginListResponseSchema = z.object({
  plugins: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        name: z.string().min(1).max(200),
        version: z.string().max(200).optional(),
        enabled: z.boolean(),
        source: z.enum(['user', 'project']),
        path: z.string().min(1).max(16_384),
        format: z.string().max(64).optional(),
      }),
    )
    .max(2_000),
});
const mcpAuthRequiredSchema = z.object({
  threadId: z.string().min(1).max(200),
  turnId: z.string().min(1).max(200),
  toolCallId: z.string().min(1).max(200),
  server: z.string().min(1).max(200),
  scope: z.string().max(2_000).optional(),
});

export type McpAuthRequired = z.infer<typeof mcpAuthRequiredSchema>;

export function readMcpAuthRequired(params: unknown): McpAuthRequired | undefined {
  const parsed = mcpAuthRequiredSchema.safeParse(params);
  return parsed.success ? parsed.data : undefined;
}

const pluginUpdateResponseSchema = pluginListResponseSchema.extend({
  id: z.string().min(1).max(200),
  updated: z.boolean(),
  previousVersion: z.string().max(200).optional(),
  version: z.string().max(200).optional(),
  changedFiles: z.array(z.string().max(16_384)).max(10_000).default([]),
});

export type PluginUpdate = z.infer<typeof pluginUpdateResponseSchema>;

const mcpServerStatusSchema = z.enum(['configured', 'authorized', 'needs_auth']);
const mcpServerListResponseSchema = z.object({
  servers: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        transport: z.string().min(1).max(32),
        scope: z.enum(['project', 'user', 'plugin']),
        status: mcpServerStatusSchema,
        url: z.string().max(16_384).optional(),
      }),
    )
    .max(1_000),
});
const mcpLoginResponseSchema = z.object({
  name: z.string().min(1).max(200),
  status: mcpServerStatusSchema,
});
const hookListResponseSchema = z.object({
  hooks: z
    .array(
      z.object({
        event: z.string().min(1).max(120),
        command: z.string().max(8_192),
        scope: z.enum(['user', 'plugin']),
        trusted: z.boolean(),
        source: z.string().max(16_384).optional(),
        position: z.number().int().positive().optional(),
      }),
    )
    .max(2_000),
});
const mcpServerTestResponseSchema = z.object({
  name: z.string().min(1).max(200),
  connected: z.boolean(),
  elapsedMs: z.number().int().nonnegative(),
  toolCount: z.number().int().nonnegative(),
  error: z.string().max(8_192).optional(),
});
const mcpServerToolsResponseSchema = z.object({
  name: z.string().min(1).max(200),
  tools: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(8_192),
        inputSchema: z.unknown(),
      }),
    )
    .max(2_000),
  prompts: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(8_192),
        arguments: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              description: z.string().max(4_000),
              required: z.boolean(),
            }),
          )
          .max(200)
          .default([]),
      }),
    )
    .max(2_000)
    .default([]),
  resources: z
    .array(
      z.object({
        uri: z.string().min(1).max(16_384),
        name: z.string().min(1).max(400),
        description: z.string().max(8_192).optional(),
        mimeType: z.string().max(200).optional(),
      }),
    )
    .max(5_000)
    .default([]),
  warnings: z.array(z.string().max(8_192)).max(20).default([]),
});

export type McpServerProbe = z.infer<typeof mcpServerTestResponseSchema>;
const settingsReadResponseSchema = z.object({
  defaultModel: z.string().max(200).optional(),
  defaultEffort: z.enum(['low', 'medium', 'high', 'max']).optional(),
  permissionMode: z.enum(['ask', 'auto', 'plan', 'bypass']).optional(),
  userInstructions: z.string().max(1_000_000).optional(),
  projectInstructions: z.string().max(1_000_000).optional(),
  userInstructionsPath: z.string().min(1).max(16_384),
  projectInstructionsPath: z.string().min(1).max(16_384),
  configPath: z.string().min(1).max(16_384),
});
const slashCommandListResponseSchema = z.object({
  commands: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(4_000),
        argsHint: z.string().max(500).optional(),
        source: z.enum(['builtin', 'skill', 'prompt', 'plugin', 'mcp']),
        aliases: z.array(z.string().max(200)).max(50),
        runnable: z.boolean(),
        prompt: z.boolean().optional(),
      }),
    )
    .max(5_000),
});
const slashCommandRunResponseSchema = z.object({
  kind: z.enum(['text', 'skills', 'plugins', 'mcp', 'hooks', 'settings']),
  text: z.string().max(1_000_000),
  payload: z.unknown().optional(),
});

const outputDeltaEventSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  delta: z.string(),
  index: z.number().int().nonnegative().optional(),
});
// Keyed by the protocol's own unions, so a code the CLI learns to send fails
// the typecheck here instead of making the whole terminal event unparsable,
// which left the sidebar running forever on a signed-out turn.
const TURN_FAILURE_CODE_KNOWN: Record<TurnFailureCode, true> = {
  provider_auth_missing: true,
  account_signed_out: true,
  plan_excludes_model: true,
  usage_limit_reached: true,
  provider_auth_invalid: true,
  provider_rate_limited: true,
  free_allowance_exhausted: true,
  provider_unavailable: true,
  stream_interrupted: true,
  context_window_exceeded: true,
  output_limit_reached: true,
  refused_by_safety: true,
  network: true,
  tool_denied: true,
  interrupted: true,
  timeout: true,
  invalid_request: true,
  unknown: true,
};
const APPROVAL_RISK_LEVEL_KNOWN: Record<AgentEventApprovalRiskLevel, true> = {
  low: true,
  medium: true,
  high: true,
};
const APPROVAL_RISK_LEVELS = Object.keys(APPROVAL_RISK_LEVEL_KNOWN) as [
  AgentEventApprovalRiskLevel,
  ...AgentEventApprovalRiskLevel[],
];
const TURN_FAILURE_ACTION_KNOWN: Record<TurnFailureAction, true> = {
  sign_in_provider: true,
  sign_in_account: true,
  upgrade_plan: true,
  open_settings: true,
  retry: true,
  none: true,
};
const TURN_FAILURE_CODES = Object.keys(TURN_FAILURE_CODE_KNOWN) as [
  TurnFailureCode,
  ...TurnFailureCode[],
];
const TURN_FAILURE_ACTIONS = Object.keys(TURN_FAILURE_ACTION_KNOWN) as [
  TurnFailureAction,
  ...TurnFailureAction[],
];
const turnFailureSchema = z.object({
  code: z.enum(TURN_FAILURE_CODES).catch('unknown'),
  message: z.string().max(10_000),
  provider: z.string().min(1).max(200).optional(),
  retryable: z.boolean(),
  action: z.enum(TURN_FAILURE_ACTIONS).catch('none'),
  // Carried as the host sent it. Which figures are worth saying out loud is
  // decided once, where the failure becomes words, not twice.
  retryAfterSeconds: z.number().int().positive().optional().catch(undefined),
  requestId: z.string().min(1).max(200).optional().catch(undefined),
  alternativeModel: z.string().min(1).max(200).optional().catch(undefined),
  resetsAt: z.string().min(1).max(64).optional().catch(undefined),
  recoveryHref: z.string().min(1).max(2_048).optional().catch(undefined),
});
const turnTerminalEventSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  response: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  error: z.string().nullable().optional(),
  failure: turnFailureSchema.nullable().optional().catch(null),
  managedRequestIds: z.array(z.string().min(1).max(200)).max(500).optional().catch(undefined),
});
const approvalRequestedEventSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  requestId: z.string().min(1),
  kind: z.string(),
  summary: z.string(),
  detail: z.string(),
  // The host classified the call before it asked. A runtime that sends
  // neither leaves both absent, and the card says so rather than assuming the
  // gentler answer.
  riskLevel: z.enum(APPROVAL_RISK_LEVELS).optional().catch(undefined),
  reversible: z.boolean().optional().catch(undefined),
  proposedContent: z.string().max(1_000_000).optional().catch(undefined),
  editable: z.boolean().optional().catch(undefined),
  alwaysAllowSaved: z.boolean().optional().catch(undefined),
  question: z
    .object({
      question: z.string().max(8_000),
      options: z.array(z.string().max(1_000)).max(50).default([]),
    })
    .nullish()
    .catch(undefined),
});
const threadReconnectResponseSchema = z.object({
  activeTurn: z
    .object({
      turnId: z.string().min(1),
      partialResponse: z.string(),
      nextDeltaIndex: z.number().int().nonnegative().optional(),
      pendingApprovals: z
        .array(
          z.object({
            requestId: z.string().min(1),
            kind: z.string().default(''),
            summary: z.string(),
            detail: z.string(),
            riskLevel: z.enum(APPROVAL_RISK_LEVELS).optional().catch(undefined),
            reversible: z.boolean().optional().catch(undefined),
            proposedContent: z.string().max(1_000_000).optional().catch(undefined),
            alwaysAllowSaved: z.boolean().optional().catch(undefined),
          }),
        )
        .default([]),
    })
    .optional(),
});

export type ThreadActiveTurn = NonNullable<
  z.infer<typeof threadReconnectResponseSchema>['activeTurn']
>;

const turnInterruptedEventSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  status: z.literal('interrupted'),
});
const mcpStatusEventSchema = z.object({
  threadId: z.string().min(1),
  message: z.string().nullable().optional(),
});
const toolCategorySchema = z
  .enum([
    'web-search',
    'web-fetch',
    'code-execution',
    'filesystem',
    'shell',
    'skill',
    'memory',
    'connector',
    'mcp',
    'computer-use',
    'artifact',
    'other',
  ])
  .catch('other');
const toolExecutionStartSchema = z.object({
  type: z.literal('tool-execution-start'),
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  category: toolCategorySchema,
  summary: z.string().min(1),
  input: z.unknown(),
});
const toolExecutionEndSchema = z.object({
  type: z.literal('tool-execution-end'),
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  output: z.unknown(),
  isError: z.boolean(),
  elapsedMs: z.number().int().nonnegative().optional(),
});
const progressUpdateSchema = z.object({
  type: z.literal('progress-update'),
  progressId: z.string().min(1),
  summary: z.string().min(1),
  detail: z.string().optional(),
  status: z.enum(['running', 'completed', 'failed']),
});
const sourceListSchema = z.object({
  type: z.literal('source-list'),
  toolCallId: z.string().max(200).optional(),
  query: z.string().max(2_000).optional(),
  sources: z
    .array(
      z.object({
        url: z.string().min(1).max(8_192),
        title: z.string().max(2_000),
        snippet: z.string().max(8_000).optional(),
      }),
    )
    .max(500),
});

const agentEventEnvelopeSchema = z.object({
  schemaVersion: z.literal(AGENT_EVENT_SCHEMA_VERSION),
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  emittedAtMs: z.number().int().nonnegative(),
  event: z.discriminatedUnion('type', [
    toolExecutionStartSchema,
    toolExecutionEndSchema,
    progressUpdateSchema,
    sourceListSchema,
  ]),
});

export type LocalRuntimeEvent =
  | ({ type: 'output_delta' } & z.infer<typeof outputDeltaEventSchema>)
  | ({ type: 'turn_completed' } & z.infer<typeof turnTerminalEventSchema>)
  | ({ type: 'turn_failed' } & z.infer<typeof turnTerminalEventSchema>)
  | ({ type: 'turn_interrupted' } & z.infer<typeof turnInterruptedEventSchema>)
  | ({ type: 'approval_requested' } & z.infer<typeof approvalRequestedEventSchema>)
  | ({
      type: 'tool_execution_start';
      threadId: string;
      turnId: string;
      sequence: number;
      emittedAtMs: number;
      envelope?: AgentEventEnvelope;
    } & Omit<z.infer<typeof toolExecutionStartSchema>, 'type'>)
  | ({
      type: 'tool_execution_end';
      threadId: string;
      turnId: string;
      sequence: number;
      emittedAtMs: number;
      envelope?: AgentEventEnvelope;
    } & Omit<z.infer<typeof toolExecutionEndSchema>, 'type'>)
  | ({
      type: 'progress_update';
      threadId: string;
      turnId: string;
      sequence: number;
      emittedAtMs: number;
      envelope?: AgentEventEnvelope;
    } & Omit<z.infer<typeof progressUpdateSchema>, 'type'>)
  | ({
      type: 'source_list';
      threadId: string;
      turnId: string;
      envelope?: AgentEventEnvelope;
    } & Omit<z.infer<typeof sourceListSchema>, 'type'>)
  | ({
      type: 'mcp_status';
      status: 'loading' | 'ready' | 'unavailable';
    } & z.infer<typeof mcpStatusEventSchema>)
  | { type: 'agent_event'; threadId: string; turnId: string; envelope: AgentEventEnvelope }
  | { type: 'runtime_disconnected'; error: string };

function parseRuntimeEvent(notification: AppServerNotification): LocalRuntimeEvent | undefined {
  if (notification.method === 'turn/output_delta') {
    const parsed = outputDeltaEventSchema.safeParse(notification.params);
    return parsed.success ? { type: 'output_delta', ...parsed.data } : undefined;
  }
  if (notification.method === 'turn/completed' || notification.method === 'turn/failed') {
    const parsed = turnTerminalEventSchema.safeParse(notification.params);
    if (!parsed.success) return undefined;
    return {
      type: notification.method === 'turn/completed' ? 'turn_completed' : 'turn_failed',
      ...parsed.data,
    };
  }
  if (notification.method === 'approval/requested') {
    const parsed = approvalRequestedEventSchema.safeParse(notification.params);
    return parsed.success ? { type: 'approval_requested', ...parsed.data } : undefined;
  }
  if (notification.method === 'turn/agent_event') {
    const shared = parseAgentEventDelta(notification.params);
    const envelope = shared === null ? {} : { envelope: shared };
    const parsed = agentEventEnvelopeSchema.safeParse(notification.params);
    if (!parsed.success) {
      return shared === null
        ? undefined
        : {
            type: 'agent_event',
            threadId: shared.sessionId,
            turnId: shared.turnId,
            envelope: shared,
          };
    }
    const { sessionId: threadId, turnId, sequence, emittedAtMs, event } = parsed.data;
    const kind = messageKindForAgentEvent(event.type);
    if (kind === 'tool_call' && event.type === 'tool-execution-start') {
      return {
        type: 'tool_execution_start',
        ...envelope,
        threadId,
        turnId,
        sequence,
        emittedAtMs,
        toolCallId: event.toolCallId,
        name: event.name,
        category: event.category,
        summary: event.summary,
        input: event.input,
      };
    }
    if (kind === 'citation' && event.type === 'source-list') {
      return {
        type: 'source_list',
        ...envelope,
        threadId,
        turnId,
        sources: event.sources,
        ...(event.query === undefined ? {} : { query: event.query }),
        ...(event.toolCallId === undefined ? {} : { toolCallId: event.toolCallId }),
      };
    }
    if (kind === 'tool_result' && event.type === 'tool-execution-end') {
      return {
        type: 'tool_execution_end',
        ...envelope,
        threadId,
        turnId,
        sequence,
        emittedAtMs,
        toolCallId: event.toolCallId,
        name: event.name,
        output: event.output,
        isError: event.isError,
        elapsedMs: event.elapsedMs,
      };
    }
    if (event.type !== 'progress-update') return undefined;
    return {
      type: 'progress_update',
      ...envelope,
      threadId,
      turnId,
      sequence,
      emittedAtMs,
      progressId: event.progressId,
      summary: event.summary,
      detail: event.detail,
      status: event.status,
    };
  }
  if (notification.method === 'turn/interrupted') {
    const parsed = turnInterruptedEventSchema.safeParse(notification.params);
    return parsed.success ? { type: 'turn_interrupted', ...parsed.data } : undefined;
  }
  if (
    notification.method === 'mcp/loading' ||
    notification.method === 'mcp/ready' ||
    notification.method === 'mcp/unavailable'
  ) {
    const parsed = mcpStatusEventSchema.safeParse(notification.params);
    if (!parsed.success) return undefined;
    return {
      type: 'mcp_status',
      status: notification.method.slice('mcp/'.length) as 'loading' | 'ready' | 'unavailable',
      ...parsed.data,
    };
  }
  return undefined;
}

export class LocalRuntimeProtocolError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'LocalRuntimeProtocolError';
  }
}

const THREAD_WRITER_CONFLICT_ERROR_CODE = -32011;
const threadWriterConflictSchema = z.object({
  threadId: z.string().min(1),
  writer: threadWriterSchema,
});

export function writerConflictHolder(error: unknown): string | undefined {
  if (
    !(error instanceof LocalRuntimeProtocolError) ||
    error.code !== THREAD_WRITER_CONFLICT_ERROR_CODE
  ) {
    return undefined;
  }
  const conflict = threadWriterConflictSchema.safeParse(error.data);
  return conflict.success ? conflict.data.writer.holderLabel : undefined;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class JsonlConnection {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly notificationListeners = new Set<(value: AppServerNotification) => void>();
  private buffer = '';
  private nextId = 1;
  private closed = false;

  constructor(
    input: Readable,
    private readonly output: Writable,
    private readonly onClose?: (error: Error) => void,
  ) {
    input.setEncoding('utf8');
    input.on('data', (chunk: string) => this.acceptChunk(chunk));
    input.on('error', (error) => this.close(error));
    input.on('end', () => this.close(new Error('AGI local runtime closed stdout')));
    output.on('error', (error) => this.close(error));
  }

  onNotification(listener: (value: AppServerNotification) => void): { dispose(): void } {
    this.notificationListeners.add(listener);
    return { dispose: () => this.notificationListeners.delete(listener) };
  }

  async request(
    method: string,
    params: unknown,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    if (this.closed) throw new Error('AGI local runtime connection is closed');
    const id = this.nextId++;
    const key = String(id);
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`AGI local runtime request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(key, { resolve, reject, timer });
    });

    try {
      await this.writeLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    } catch (error) {
      const pending = this.pending.get(key);
      if (pending !== undefined) {
        clearTimeout(pending.timer);
        this.pending.delete(key);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return response;
  }

  close(error = new Error('AGI local runtime connection closed')): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.notificationListeners.clear();
    this.onClose?.(error);
  }

  private acceptChunk(chunk: string): void {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, 'utf8') > MAX_LINE_BYTES && !this.buffer.includes('\n')) {
      this.close(new Error('AGI local runtime emitted an oversized JSONL frame'));
      return;
    }

    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
        this.close(new Error('AGI local runtime emitted an oversized JSONL frame'));
        return;
      }
      if (line !== '') this.acceptLine(line);
      newline = this.buffer.indexOf('\n');
    }
  }

  private acceptLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.close(
        new Error(
          `AGI local runtime emitted malformed JSON on its protocol stream: ${JSON.stringify(
            redactTelemetryText(line.slice(0, MAX_REJECTED_LINE_CHARS)),
          )}`,
        ),
      );
      return;
    }

    const response = responseSchema.safeParse(parsed);
    if (response.success && response.data.id === null) {
      const protocolError = response.data.error;
      this.close(
        protocolError === undefined
          ? new Error('AGI local runtime emitted a response without a request id')
          : new LocalRuntimeProtocolError(
              protocolError.message,
              protocolError.code,
              protocolError.data,
            ),
      );
      return;
    }
    if (response.success) {
      const pending = this.pending.get(String(response.data.id));
      if (pending === undefined) return;
      clearTimeout(pending.timer);
      this.pending.delete(String(response.data.id));
      if (response.data.error !== undefined) {
        pending.reject(
          new LocalRuntimeProtocolError(
            response.data.error.message,
            response.data.error.code,
            response.data.error.data,
          ),
        );
      } else {
        pending.resolve(response.data.result);
      }
      return;
    }

    const notification = notificationSchema.safeParse(parsed);
    if (!notification.success) {
      this.close(new Error('AGI local runtime emitted an invalid protocol message'));
      return;
    }
    const value = notification.data as AppServerNotification;
    for (const listener of this.notificationListeners) listener(value);
  }

  private writeLine(line: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.output.write(`${line}\n`, (error) => {
        if (error !== null && error !== undefined) reject(error);
        else resolve();
      });
    });
  }
}

export type SpawnLocalRuntime = (
  command: string,
  args: readonly string[],
  options: Parameters<typeof nodeSpawn>[2],
) => ChildProcessWithoutNullStreams;

export type TerminateLocalRuntimeTree = (child: ChildProcessWithoutNullStreams) => Promise<void>;

export interface LocalRuntimeClientOptions {
  cliPath: string | (() => string);
  memoryEnabled?: () => boolean;
  cwd: string;
  clientVersion: string;
  environmentLabel?: string;
  spawn?: SpawnLocalRuntime;
  terminateProcessTree?: TerminateLocalRuntimeTree;
}

export class LocalRuntimeClient {
  private child?: ChildProcessWithoutNullStreams;
  private connection?: JsonlConnection;
  private childExitPromise?: Promise<void>;
  private initializePromise?: Promise<InitializeResponse>;
  private disposePromise?: Promise<void>;
  private restartPromise?: Promise<void>;
  private readonly notificationListeners = new Set<(value: AppServerNotification) => void>();
  private readonly eventListeners = new Set<(value: LocalRuntimeEvent) => void>();
  private stderrTail = '';
  private disposed = false;

  constructor(private readonly options: LocalRuntimeClientOptions) {}

  initialize(): Promise<InitializeResponse> {
    if (this.initializePromise !== undefined) return this.initializePromise;
    const attempt = this.initializeOnce();
    this.initializePromise = attempt;
    void attempt.catch((error: unknown) => {
      if (this.initializePromise !== attempt) return;
      this.resetProcess(error instanceof Error ? error : new Error(String(error)), true);
    });
    return attempt;
  }

  async startThread(params: ThreadStartParams): Promise<ThreadSummary> {
    const connection = await this.readyConnection();
    const result = await connection.request('thread/start', params);
    return threadStartResponseSchema.parse(result).thread as ThreadSummary;
  }

  async listThreads(params: ThreadListParams): Promise<ThreadListResponse> {
    const connection = await this.readyConnection();
    return threadListResponseSchema.parse(
      await connection.request('thread/list', params),
    ) as ThreadListResponse;
  }

  async listLocalModels(options: { refresh?: boolean } = {}): Promise<LocalModelListResponse> {
    const connection = await this.readyConnection();
    return localModelListResponseSchema.parse(
      await connection.request('model/list', options.refresh === true ? { refresh: true } : {}),
    ) as LocalModelListResponse;
  }

  async resumeThread(threadId: string): Promise<ThreadSummary> {
    const connection = await this.readyConnection();
    const result = await connection.request('thread/resume', { threadId });
    return threadStartResponseSchema.parse(result).thread as ThreadSummary;
  }

  async readThread(threadId: string): Promise<ThreadReadResponse> {
    const connection = await this.readyConnection();
    return threadReadResponseSchema.parse(
      await connection.request('thread/read', { threadId }),
    ) as ThreadReadResponse;
  }

  async forkThread(
    threadId: string,
    title?: string,
    throughMessageIndex?: number,
  ): Promise<ThreadSummary> {
    const connection = await this.readyConnection();
    if (throughMessageIndex !== undefined && !(await this.offers('forkAtMessage'))) {
      throw new Error(
        'The installed AGI CLI can only fork a whole session. Update the AGI CLI to branch from a message.',
      );
    }
    const result = await connection.request('thread/fork', {
      threadId,
      ...(title !== undefined ? { title } : {}),
      ...(throughMessageIndex === undefined ? {} : { throughMessageIndex }),
    });
    return threadStartResponseSchema.parse(result).thread as ThreadSummary;
  }

  async searchThreads(query: string, includeArchived = false): Promise<ThreadSearchResults> {
    const connection = await this.readyConnection();
    if (!(await this.offers('threadSearch'))) {
      throw new Error(
        'The installed AGI CLI cannot search session transcripts. Update the AGI CLI to search them.',
      );
    }
    return threadSearchResponseSchema.parse(
      await connection.request('thread/search', { query, includeArchived }),
    );
  }

  async inspectMcpServer(name: string): Promise<McpServerInspection> {
    const connection = await this.readyConnection();
    return mcpServerInspectionSchema.parse(
      await connection.request('mcp/inspect', { name }, MCP_PROBE_TIMEOUT_MS),
    );
  }

  async decidePlan(
    threadId: string,
    decision: 'approve' | 'reject',
    feedback?: string,
  ): Promise<void> {
    const connection = await this.readyConnection();
    await connection.request(
      'plan/decide',
      feedback === undefined ? { threadId, decision } : { threadId, decision, feedback },
    );
  }

  async planPullRequest(): Promise<PullRequestPlan> {
    const connection = await this.readyConnection();
    return pullRequestPlanSchema.parse(await connection.request('git/pullRequest/plan', {}));
  }

  async createPullRequest(request: {
    title: string;
    body?: string;
    base: string;
    confirmedRemote: string;
    confirmedBranch: string;
    confirmedHead: string;
    confirmedCommits: number;
  }): Promise<PullRequestResult> {
    const connection = await this.readyConnection();
    return pullRequestResultSchema.parse(
      await connection.request('git/pullRequest', request, PULL_REQUEST_TIMEOUT_MS),
    );
  }

  async listSavedPermissions(): Promise<SavedPermissionList> {
    const connection = await this.readyConnection();
    return savedPermissionsResponseSchema.parse(await connection.request('permissions/list', {}));
  }

  async removeSavedPermission(id: string): Promise<SavedPermissionList> {
    const connection = await this.readyConnection();
    return savedPermissionsResponseSchema.parse(
      await connection.request('permissions/remove', { id }),
    );
  }

  async listPermissionRules(): Promise<PermissionRuleList> {
    const connection = await this.readyConnection();
    return permissionRulesResponseSchema.parse(await connection.request('permissions/rules', {}));
  }

  async addPermissionRule(rule: {
    kind: 'command' | 'domain' | 'mcp';
    target: string;
    decision: PermissionRule['decision'];
  }): Promise<PermissionRuleList> {
    const connection = await this.readyConnection();
    return permissionRulesResponseSchema.parse(await connection.request('permissions/add', rule));
  }

  async listTrustedFolders(): Promise<TrustedFolderList> {
    const connection = await this.readyConnection();
    return trustListResponseSchema.parse(await connection.request('trust/list', {}));
  }

  async revokeTrustedFolder(path: string): Promise<TrustedFolderList> {
    const connection = await this.readyConnection();
    return trustListResponseSchema.parse(await connection.request('trust/revoke', { path }));
  }

  async listProviderKeys(): Promise<ProviderKeyList> {
    const connection = await this.readyConnection();
    return providerKeysResponseSchema.parse(await connection.request('providers/list', {}));
  }

  async setProviderKey(provider: string, apiKey: string): Promise<ProviderKeyList> {
    const connection = await this.readyConnection();
    const keys = providerKeysResponseSchema.parse(
      await connection.request('providers/setKey', { provider, apiKey }),
    );
    await this.listLocalModels({ refresh: true });
    return keys;
  }

  async removeProviderKey(provider: string): Promise<ProviderKeyList> {
    const connection = await this.readyConnection();
    const keys = providerKeysResponseSchema.parse(
      await connection.request('providers/removeKey', { provider }),
    );
    await this.listLocalModels({ refresh: true });
    return keys;
  }

  async unarchiveThread(threadId: string): Promise<void> {
    const connection = await this.readyConnection();
    if (!(await this.offers('threadUnarchive'))) {
      throw new Error(
        'The installed AGI CLI cannot restore archived sessions. Update the AGI CLI to restore them.',
      );
    }
    await connection.request('thread/unarchive', { threadId });
  }

  async handOffThread(
    threadId: string,
    toEnvironment: HandoffEnvironment,
  ): Promise<DeveloperSessionHandoff> {
    const connection = await this.readyConnection();
    const result = await connection.request('thread/handoff', { threadId, toEnvironment });
    return handoffResponseSchema.parse(result).handoff as DeveloperSessionHandoff;
  }

  async acceptHandoff(handoff: DeveloperSessionHandoff): Promise<HandoffAdmission> {
    const connection = await this.readyConnection();
    const result = await connection.request('thread/handoff/accept', { handoff });
    return handoffAdmissionSchema.parse(result).admission as HandoffAdmission;
  }

  async archiveThread(threadId: string): Promise<void> {
    const connection = await this.readyConnection();
    await connection.request('thread/archive', { threadId });
  }

  async reconnectThread(threadId: string): Promise<ThreadActiveTurn | null> {
    const connection = await this.readyConnection();
    if (!(await this.offers('reconnect'))) return null;
    const result = threadReconnectResponseSchema.parse(
      await connection.request('thread/reconnect', { threadId }),
    );
    return result.activeTurn ?? null;
  }

  async releaseWriter(threadId: string): Promise<void> {
    const connection = await this.readyConnection();
    if (!(await this.offers('writerLease'))) return;
    await connection.request('thread/writer/release', { threadId });
  }

  async takeOverWriter(threadId: string): Promise<ThreadSummary> {
    const connection = await this.readyConnection();
    if (!(await this.offers('writerLease'))) {
      throw new Error(
        'The installed AGI CLI cannot hand a session from another app to this one. Update the AGI CLI to take it over.',
      );
    }
    const result = await connection.request('thread/writer/takeover', { threadId });
    return threadStartResponseSchema.parse(result).thread as ThreadSummary;
  }

  async deleteThread(threadId: string): Promise<void> {
    const connection = await this.readyConnection();
    const { capabilities } = await this.initialize();
    if (capabilities.threadDelete !== true) {
      throw new Error(
        'The installed AGI CLI cannot delete developer sessions. Update the AGI CLI, or archive the session instead.',
      );
    }
    await connection.request('thread/delete', { threadId });
  }

  async offers(capability: keyof AppServerCapabilities): Promise<boolean> {
    return (await this.initialize()).capabilities[capability] === true;
  }

  async listCheckpoints(threadId: string): Promise<ThreadCheckpointList> {
    const connection = await this.readyConnection();
    if (!(await this.offers('checkpoints'))) {
      throw new Error('The installed AGI CLI keeps no checkpoints. Update the AGI CLI to rewind.');
    }
    return threadCheckpointsResponseSchema.parse(
      await connection.request('thread/checkpoints', { threadId }),
    );
  }

  async rewindThread(params: ThreadRewindParams): Promise<ThreadRewindOutcome> {
    const connection = await this.readyConnection();
    if (!(await this.offers('checkpoints'))) {
      throw new Error('The installed AGI CLI keeps no checkpoints. Update the AGI CLI to rewind.');
    }
    return threadRewindResponseSchema.parse(await connection.request('thread/rewind', params));
  }

  async startTurn(params: TurnStartParams): Promise<TurnSummary> {
    const connection = await this.readyConnection();
    const result = await connection.request('turn/start', params);
    return turnStartResponseSchema.parse(result).turn as TurnSummary;
  }

  async interruptTurn(params: TurnInterruptParams): Promise<void> {
    const connection = await this.readyConnection();
    await connection.request('turn/interrupt', params);
  }

  async steerTurn(params: TurnSteerParams): Promise<TurnSummary> {
    const connection = await this.readyConnection();
    const result = await connection.request('turn/steer', params);
    return turnStartResponseSchema.parse(result).turn as TurnSummary;
  }

  async respondToApproval(params: ApprovalResponseParams): Promise<void> {
    const connection = await this.readyConnection();
    await connection.request('approval/respond', params);
  }

  async accountStatus(refresh = false): Promise<AccountStatusResponse> {
    const connection = await this.readyConnection();
    return accountStatusResponseSchema.parse(
      await connection.request('account/status', { refresh }),
    ) as AccountStatusResponse;
  }

  async startAccountLogin(): Promise<AccountLoginResponse> {
    const connection = await this.readyConnection();
    return accountLoginResponseSchema.parse(
      await connection.request('account/login', {}),
    ) as AccountLoginResponse;
  }

  /// Blocks until the device grant resolves, so it carries its own timeout
  /// rather than the default request timeout.
  async waitForAccountLogin(
    loginId: string,
    timeoutMs = ACCOUNT_LOGIN_WAIT_TIMEOUT_MS,
  ): Promise<AccountLoginWaitResponse> {
    const connection = await this.readyConnection();
    return accountLoginWaitResponseSchema.parse(
      await connection.request('account/login/wait', { loginId }, timeoutMs),
    ) as AccountLoginWaitResponse;
  }

  async accountLogout(): Promise<void> {
    const connection = await this.readyConnection();
    await connection.request('account/logout', {});
  }

  async accountToken(): Promise<AccountTokenResponse> {
    const connection = await this.readyConnection();
    return accountTokenResponseSchema.parse(
      await connection.request('account/token', {}),
    ) as AccountTokenResponse;
  }

  async contextInstructions(cwd?: string): Promise<ContextInstructionsResponse> {
    const connection = await this.readyConnection();
    return contextInstructionsResponseSchema.parse(
      await connection.request('context/instructions', cwd === undefined ? {} : { cwd }),
    ) as ContextInstructionsResponse;
  }

  async listSkills(): Promise<SkillListResponse> {
    const connection = await this.readyConnection();
    return skillListResponseSchema.parse(
      await connection.request('skills/list', {}),
    ) as SkillListResponse;
  }

  async setSkillEnabled(name: string, enabled: boolean): Promise<SkillListResponse> {
    const connection = await this.readyConnection();
    return skillListResponseSchema.parse(
      await connection.request('skills/setEnabled', { name, enabled }),
    ) as SkillListResponse;
  }

  async setProjectSkillConsent(granted: boolean): Promise<SkillConsentResponse> {
    const connection = await this.readyConnection();
    return skillConsentResponseSchema.parse(
      await connection.request('skills/consent', { granted }),
    ) as SkillConsentResponse;
  }

  async listPlugins(): Promise<PluginListResponse> {
    const connection = await this.readyConnection();
    return pluginListResponseSchema.parse(
      await connection.request('plugins/list', {}),
    ) as PluginListResponse;
  }

  async setPluginEnabled(id: string, enabled: boolean): Promise<PluginListResponse> {
    const connection = await this.readyConnection();
    return pluginListResponseSchema.parse(
      await connection.request('plugins/setEnabled', { id, enabled }),
    ) as PluginListResponse;
  }

  async listMcpServers(): Promise<McpServerListResponse> {
    const connection = await this.readyConnection();
    return mcpServerListResponseSchema.parse(
      await connection.request('mcp/list', {}),
    ) as McpServerListResponse;
  }

  async loginMcpServer(name: string, timeoutMs = MCP_LOGIN_TIMEOUT_MS): Promise<McpLoginResponse> {
    const connection = await this.readyConnection();
    return mcpLoginResponseSchema.parse(
      await connection.request('mcp/login', { name }, timeoutMs),
    ) as McpLoginResponse;
  }

  async listHooks(): Promise<HookListResponse> {
    const connection = await this.readyConnection();
    return hookListResponseSchema.parse(
      await connection.request('hooks/list', {}),
    ) as HookListResponse;
  }

  async installSkill(source: string): Promise<SkillListResponse> {
    const connection = await this.readyConnection();
    return skillListResponseSchema.parse(
      await connection.request('skills/install', { source }, INSTALL_TIMEOUT_MS),
    ) as SkillListResponse;
  }

  async removeSkill(name: string): Promise<SkillListResponse> {
    const connection = await this.readyConnection();
    return skillListResponseSchema.parse(
      await connection.request('skills/remove', { name }),
    ) as SkillListResponse;
  }

  async installPlugin(params: PluginInstallParams): Promise<PluginListResponse> {
    const connection = await this.readyConnection();
    return pluginListResponseSchema.parse(
      await connection.request('plugins/install', params, INSTALL_TIMEOUT_MS),
    ) as PluginListResponse;
  }

  async updatePlugin(id: string): Promise<PluginUpdate> {
    const connection = await this.readyConnection();
    return pluginUpdateResponseSchema.parse(
      await connection.request('plugins/update', { id }, INSTALL_TIMEOUT_MS),
    );
  }

  async removePlugin(id: string): Promise<PluginListResponse> {
    const connection = await this.readyConnection();
    return pluginListResponseSchema.parse(
      await connection.request('plugins/remove', { id }),
    ) as PluginListResponse;
  }

  async addMcpServer(params: McpAddParams): Promise<McpServerListResponse> {
    const connection = await this.readyConnection();
    return mcpServerListResponseSchema.parse(
      await connection.request('mcp/add', params),
    ) as McpServerListResponse;
  }

  async removeMcpServer(name: string): Promise<McpServerListResponse> {
    const connection = await this.readyConnection();
    return mcpServerListResponseSchema.parse(
      await connection.request('mcp/remove', { name }),
    ) as McpServerListResponse;
  }

  async testMcpServer(name: string): Promise<McpServerProbe> {
    const connection = await this.readyConnection();
    return mcpServerTestResponseSchema.parse(
      await connection.request('mcp/test', { name }, MCP_PROBE_TIMEOUT_MS),
    );
  }

  async listMcpServerTools(name: string): Promise<McpServerToolsResponse> {
    const connection = await this.readyConnection();
    return mcpServerToolsResponseSchema.parse(
      await connection.request('mcp/tools', { name }, MCP_PROBE_TIMEOUT_MS),
    ) as McpServerToolsResponse;
  }

  async addHook(params: HookAddParams): Promise<HookListResponse> {
    const connection = await this.readyConnection();
    return hookListResponseSchema.parse(
      await connection.request('hooks/add', params),
    ) as HookListResponse;
  }

  async removeHook(params: HookRemoveParams): Promise<HookListResponse> {
    const connection = await this.readyConnection();
    return hookListResponseSchema.parse(
      await connection.request('hooks/remove', params),
    ) as HookListResponse;
  }

  async readSettings(): Promise<SettingsReadResponse> {
    const connection = await this.readyConnection();
    return settingsReadResponseSchema.parse(
      await connection.request('settings/read', {}),
    ) as SettingsReadResponse;
  }

  async writeSettings(params: SettingsWriteParams): Promise<SettingsReadResponse> {
    const connection = await this.readyConnection();
    return settingsReadResponseSchema.parse(
      await connection.request('settings/write', params),
    ) as SettingsReadResponse;
  }

  async listCommands(): Promise<SlashCommandListResponse> {
    const connection = await this.readyConnection();
    return slashCommandListResponseSchema.parse(
      await connection.request('commands/list', {}),
    ) as SlashCommandListResponse;
  }

  async createWorktree(): Promise<WorktreeSummary> {
    const connection = await this.readyConnection();
    return worktreeSummarySchema.parse(await connection.request('worktree/create', {}));
  }

  async listWorktrees(): Promise<WorktreeSummary[]> {
    const connection = await this.readyConnection();
    return worktreeListSchema.parse(await connection.request('worktree/list', {})).worktrees;
  }

  async removeWorktree(name: string, force: boolean): Promise<WorktreeSummary[]> {
    const connection = await this.readyConnection();
    return worktreeListSchema.parse(
      await connection.request('worktree/remove', force ? { name, force } : { name }),
    ).worktrees;
  }

  async addMemory(text: string): Promise<MemoryAddResult> {
    const connection = await this.readyConnection();
    return memoryAddResponseSchema.parse(
      await connection.request('memory/add', { text, scope: 'project' }),
    );
  }

  async runCommand(name: string, args?: string): Promise<SlashCommandRunResponse> {
    const connection = await this.readyConnection();
    return slashCommandRunResponseSchema.parse(
      await connection.request('commands/run', args === undefined ? { name } : { name, args }),
    ) as SlashCommandRunResponse;
  }

  onNotification(listener: (value: AppServerNotification) => void): { dispose(): void } {
    this.notificationListeners.add(listener);
    return { dispose: () => this.notificationListeners.delete(listener) };
  }

  onEvent(listener: (value: LocalRuntimeEvent) => void): { dispose(): void } {
    this.eventListeners.add(listener);
    return { dispose: () => this.eventListeners.delete(listener) };
  }

  restart(): Promise<void> {
    if (this.restartPromise !== undefined) return this.restartPromise;
    const restart = (async () => {
      await this.disposeProcess(true);
      this.disposed = false;
      delete this.disposePromise;
      await this.initialize();
    })();
    this.restartPromise = restart;
    void restart.then(
      () => {
        if (this.restartPromise === restart) delete this.restartPromise;
      },
      () => {
        if (this.restartPromise === restart) delete this.restartPromise;
      },
    );
    return restart;
  }

  dispose(): Promise<void> {
    return this.disposeProcess(false);
  }

  private disposeProcess(preserveListeners: boolean): Promise<void> {
    if (this.disposePromise !== undefined) return this.disposePromise;
    this.disposed = true;
    if (!preserveListeners) this.notificationListeners.clear();
    const restartError = new Error('AGI local runtime process is restarting');
    for (const listener of this.eventListeners) {
      listener({ type: 'runtime_disconnected', error: restartError.message });
    }
    if (!preserveListeners) this.eventListeners.clear();
    const connection = this.connection;
    const child = this.child;
    const childExitPromise = this.childExitPromise;
    if (connection === undefined || child === undefined || childExitPromise === undefined) {
      this.resetProcess(restartError, true);
      this.disposePromise = Promise.resolve();
      return this.disposePromise;
    }

    this.disposePromise = this.shutdownProcess(connection, child, childExitPromise, restartError);
    return this.disposePromise;
  }

  private async shutdownProcess(
    connection: JsonlConnection,
    child: ChildProcessWithoutNullStreams,
    childExitPromise: Promise<void>,
    restartError: Error,
  ): Promise<void> {
    let graceful = false;
    try {
      const result = await connection.request('shutdown', {}, SHUTDOWN_ACK_TIMEOUT_MS);
      acknowledgedResponseSchema.parse(result);
      await waitWithTimeout(
        childExitPromise,
        SHUTDOWN_EXIT_TIMEOUT_MS,
        'AGI local runtime acknowledged shutdown but did not exit',
      );
      graceful = true;
    } catch {
      const terminateProcessTree =
        this.options.terminateProcessTree ?? terminateLocalRuntimeProcessTree;
      await waitWithTimeout(
        terminateProcessTree(child),
        HARD_KILL_TIMEOUT_MS,
        'AGI local runtime process-tree termination timed out',
      );
      await waitWithTimeout(
        childExitPromise,
        HARD_KILL_TIMEOUT_MS,
        'AGI local runtime did not exit after process-tree termination',
      );
    } finally {
      if (this.connection === connection || this.child === child) {
        this.resetProcess(restartError, !graceful);
      }
    }
  }

  private async initializeOnce(): Promise<InitializeResponse> {
    const connection = this.ensureProcess();
    const rawResult = await connection
      .request('initialize', {
        clientInfo: {
          name: 'agi_vscode',
          title: 'AGI for VS Code',
          version: this.options.clientVersion,
        },
        protocolVersion: SUPPORTED_PROTOCOL_VERSION,
      })
      .catch((error: unknown) => {
        throw describeVersionRefusal(error);
      });
    const parsedResult = initializeResponseSchema.safeParse(rawResult);
    if (!parsedResult.success) {
      if (legacyInitializeResponseSchema.safeParse(rawResult).success) {
        throw new Error(
          `Installed AGI CLI does not support developer-session protocol ${SUPPORTED_PROTOCOL_VERSION}. Update the AGI CLI or set agiWorkforce.cliPath to a current binary.`,
        );
      }
      throw new Error('Installed AGI CLI returned an invalid developer-session handshake');
    }
    const result = parsedResult.data as InitializeResponse;
    if (result.protocolVersion !== SUPPORTED_PROTOCOL_VERSION) {
      throw new Error(
        `Installed AGI CLI uses developer-session protocol ${result.protocolVersion}; this extension requires exactly protocol ${SUPPORTED_PROTOCOL_VERSION}. Install a compatible AGI CLI or update the extension.`,
      );
    }
    if (
      result.agentEventSchemaVersion !== undefined &&
      result.agentEventSchemaVersion !== AGENT_EVENT_SCHEMA_VERSION
    ) {
      throw new Error(
        `Installed AGI CLI streams agent events in schema ${result.agentEventSchemaVersion}; this extension reads schema ${AGENT_EVENT_SCHEMA_VERSION}. ${
          result.agentEventSchemaVersion > AGENT_EVENT_SCHEMA_VERSION
            ? 'Update AGI for VS Code.'
            : 'Update the AGI CLI or set agiWorkforce.cliPath to a current binary.'
        }`,
      );
    }
    if (!isSupportedCliVersion(result.serverInfo.version)) {
      throw new Error(
        `Installed AGI CLI reports version ${JSON.stringify(result.serverInfo.version)}; version ${MINIMUM_SUPPORTED_CLI_VERSION_LABEL} or newer is required for protocol ${SUPPORTED_PROTOCOL_VERSION}.`,
      );
    }
    if (
      !result.capabilities.threads ||
      !result.capabilities.turns ||
      !result.capabilities.streaming ||
      !result.capabilities.approvals ||
      !result.capabilities.models
    ) {
      throw new Error('Installed AGI CLI does not support the required developer-session protocol');
    }
    return result;
  }

  private async readyConnection(): Promise<JsonlConnection> {
    await this.initialize();
    const connection = this.connection;
    if (connection === undefined) throw new Error('AGI local runtime did not initialize');
    return connection;
  }

  private ensureProcess(): JsonlConnection {
    if (this.disposed) throw new Error('AGI local runtime client is disposed');
    if (this.connection !== undefined) return this.connection;
    const spawnRuntime = this.options.spawn ?? (nodeSpawn as SpawnLocalRuntime);
    const configuredCliPath =
      typeof this.options.cliPath === 'function' ? this.options.cliPath() : this.options.cliPath;
    const cliPath = configuredCliPath.trim();
    if (cliPath === '') {
      throw new Error(
        `${CLI_NOT_FOUND_MARKER}: ${CLI_PATH_SETTING} is empty, so there is no binary to start. ${cliAcquisitionHint()}`,
      );
    }
    let child: ChildProcessWithoutNullStreams;
    try {
      const memoryArgs = this.options.memoryEnabled?.() === false ? ['--no-memory'] : [];
      child = spawnRuntime(cliPath, ['app-server', ...memoryArgs], {
        cwd: this.options.cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
    } catch (error) {
      throw describeSpawnFailure(
        cliPath,
        error instanceof Error ? error : new Error(String(error)),
        this.options.environmentLabel,
      );
    }
    this.stderrTail = '';
    this.child = child;
    const releaseTracking = trackRuntimeChild(child);
    let resolveChildExit!: () => void;
    const childExitPromise = new Promise<void>((resolve) => {
      resolveChildExit = resolve;
    });
    this.childExitPromise = childExitPromise;
    const connection = new JsonlConnection(child.stdout, child.stdin, (error) => {
      if (this.child === child) this.resetProcess(error, !this.disposed);
    });
    this.connection = connection;
    connection.onNotification((notification) => {
      for (const listener of this.notificationListeners) listener(notification);
      const event = parseRuntimeEvent(notification);
      if (event !== undefined) {
        for (const listener of this.eventListeners) listener(event);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-64 * 1024);
    });
    child.once('error', (error) => {
      if (child.pid === undefined) {
        releaseTracking();
        resolveChildExit();
      }
      if (this.child === child && this.connection === connection) {
        this.resetProcess(describeSpawnFailure(cliPath, error, this.options.environmentLabel));
      }
    });
    child.once('exit', (code, signal) => {
      releaseTracking();
      resolveChildExit();
      const detail = this.stderrTail.trim();
      const suffix = detail === '' ? '' : `: ${detail}`;
      if (this.child === child && this.connection === connection) {
        this.resetProcess(
          new Error(
            `The AGI CLI at ${JSON.stringify(cliPath)} exited (${signal ?? String(code ?? 'unknown')})${suffix}`,
          ),
        );
      }
    });
    return connection;
  }

  private resetProcess(error: Error, terminate = false): void {
    const connection = this.connection;
    const child = this.child;
    const hadProcess = connection !== undefined || child !== undefined;
    delete this.connection;
    delete this.child;
    delete this.childExitPromise;
    delete this.initializePromise;
    connection?.close(error);
    if (terminate && child !== undefined) {
      const terminateProcessTree =
        this.options.terminateProcessTree ?? terminateLocalRuntimeProcessTree;
      void terminateProcessTree(child).catch(() => child.kill('SIGKILL'));
    }
    if (hadProcess) {
      for (const listener of this.eventListeners) {
        listener({ type: 'runtime_disconnected', error: error.message });
      }
    }
  }
}

function describeVersionRefusal(error: unknown): unknown {
  if (
    !(error instanceof LocalRuntimeProtocolError) ||
    error.code !== PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE
  ) {
    return error;
  }
  const refusal = protocolVersionUnsupportedDataSchema.safeParse(error.data);
  if (!refusal.success) return error;
  const { supportedProtocolVersions, minimumProtocolVersion } = refusal.data;
  const newestSupported = Math.max(...supportedProtocolVersions);
  const action =
    SUPPORTED_PROTOCOL_VERSION < minimumProtocolVersion
      ? 'Update AGI for VS Code.'
      : 'Update the AGI CLI or set agiWorkforce.cliPath to a current binary.';
  return new Error(
    `Installed AGI CLI answers developer-session protocol ${minimumProtocolVersion} through ${newestSupported}; this extension requires protocol ${SUPPORTED_PROTOCOL_VERSION}. ${action}`,
  );
}

async function waitWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function terminateLocalRuntimeProcessTree(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  const processId = child.pid;
  if (processId === undefined || !Number.isSafeInteger(processId) || processId <= 0) {
    child.kill('SIGKILL');
    return;
  }

  if (process.platform !== 'win32') {
    try {
      process.kill(-processId, 'SIGKILL');
      return;
    } catch {
      child.kill('SIGKILL');
      return;
    }
  }

  await new Promise<void>((resolve, reject) => {
    const killer = nodeSpawn('taskkill', ['/PID', String(processId), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('error', reject);
    killer.once('exit', () => resolve());
  });
}

export type TurnFailureEvent = z.infer<typeof turnFailureSchema>;

export type { AppServerCapabilities };
