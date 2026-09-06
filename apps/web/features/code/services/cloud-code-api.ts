'use client';

import { z } from 'zod';
import {
  CLOUD_CODE_AGENT_STOP_REASONS,
  CLOUD_CODE_NETWORK_ACCESS,
  CLOUD_CODE_SESSION_STATES,
  type CloudCodeAgentTurnRecord,
  type CloudCodeSession,
  type CloudCodeSessionListResponse,
  type CloudCodeTerminalEntry,
  type CreateCloudCodeSessionInput,
  type RunCloudCodeCommandResponse,
} from '@agiworkforce/types';
import { getCsrfToken as getBrowserCsrfToken } from '@/lib/client/csrf';

export class CloudCodeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'CloudCodeApiError';
  }
}

const sessionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  repositoryUrl: z.string().nullable(),
  repositoryBranch: z.string().nullable().default(null),
  networkAccess: z.enum(CLOUD_CODE_NETWORK_ACCESS),
  runtimeId: z.string().nullable().default(null),
  extraHosts: z.array(z.string()).default([]),
  state: z.enum(CLOUD_CODE_SESSION_STATES),
  workspacePath: z.string(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
});

const terminalEntrySchema = z.object({
  id: z.string(),
  sessionId: z.string().uuid(),
  command: z.string(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

const runtimeSchema = z.object({
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
});

const listSchema = z.object({
  availability: z.object({
    deploymentEnabled: z.boolean(),
    storageReady: z.boolean(),
    planEntitled: z.boolean(),
    planTier: z.string(),
    maxSessions: z.number().int().nonnegative(),
  }),
  sessions: z.array(sessionSchema),
  runtimes: z.array(runtimeSchema).default([]),
});

const agentStepSchema = z.object({
  index: z.number().int().nonnegative(),
  toolName: z.string(),
  label: z.string().nullable(),
  output: z.string(),
  isError: z.boolean(),
});

const agentTurnRecordSchema = z.object({
  turnId: z.string(),
  goal: z.string(),
  stopReason: z.enum(CLOUD_CODE_AGENT_STOP_REASONS).nullable(),
  stepsUsed: z.number().int().nonnegative(),
  finalMessage: z.string(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  steps: z.array(agentStepSchema),
});

const sessionDetailSchema = z.object({
  session: sessionSchema,
  terminalEntries: z.array(terminalEntrySchema),
  turns: z.array(agentTurnRecordSchema).default([]),
});

const sessionOnlySchema = z.object({ session: sessionSchema });
const commandSchema = z.object({ session: sessionSchema, terminalEntry: terminalEntrySchema });

const commitResultSchema = z.object({
  session: sessionSchema,
  push: z.object({
    ok: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
    exitCode: z.number().int(),
  }),
});

const pendingApprovalSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  toolUseId: z.string(),
  command: z.string(),
  reason: z.string(),
});

const agentTurnSchema = z.object({
  turnId: z.string(),
  stopReason: z.enum(CLOUD_CODE_AGENT_STOP_REASONS),
  stepsUsed: z.number().int().nonnegative(),
  finalMessage: z.string(),
  steps: z.array(agentStepSchema).default([]),
  pendingApproval: pendingApprovalSchema.optional(),
  errorMessage: z.string().optional(),
});

const agentApprovalsSchema = z.object({
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

export type { CloudCodeAgentStopReason } from '@agiworkforce/types';
export type CloudCodeAgentTurn = z.infer<typeof agentTurnSchema>;
export type CloudCodeAgentApproval = z.infer<typeof agentApprovalsSchema>['approvals'][number];
export type CloudCodeApprovalDecision = 'approve' | 'reject';
export type CloudCodeCommitResult = z.infer<typeof commitResultSchema>;

export interface StartCloudCodeAgentTurnRequest {
  goal: string;
  model: string;
  /** Sent as `Idempotency-Key`; the managed-usage ledger refuses the turn without it. */
  idempotencyKey: string;
}

export interface DecideCloudCodeApprovalRequest {
  turnId: string;
  stepIndex: number;
  decision: CloudCodeApprovalDecision;
}

interface CloudCodeApiDependencies {
  fetchImpl?: typeof fetch;
  getCsrfToken?: () => Promise<string>;
}

export interface CloudCodeApi {
  list(signal?: AbortSignal): Promise<CloudCodeSessionListResponse>;
  get(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<{
    session: CloudCodeSession;
    terminalEntries: CloudCodeTerminalEntry[];
    turns: CloudCodeAgentTurnRecord[];
  }>;
  create(
    input: CreateCloudCodeSessionInput,
    signal?: AbortSignal,
  ): Promise<{ session: CloudCodeSession; terminalEntries: CloudCodeTerminalEntry[] }>;
  run(
    sessionId: string,
    command: string,
    signal?: AbortSignal,
  ): Promise<RunCloudCodeCommandResponse>;
  close(sessionId: string, signal?: AbortSignal): Promise<CloudCodeSession>;
  commit(sessionId: string, message: string, signal?: AbortSignal): Promise<CloudCodeCommitResult>;
  startAgentTurn(
    sessionId: string,
    input: StartCloudCodeAgentTurnRequest,
    signal?: AbortSignal,
  ): Promise<CloudCodeAgentTurn>;
  listApprovals(sessionId: string, signal?: AbortSignal): Promise<CloudCodeAgentApproval[]>;
  decideApproval(
    sessionId: string,
    input: DecideCloudCodeApprovalRequest,
    signal?: AbortSignal,
  ): Promise<CloudCodeAgentTurn>;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiError(body: unknown, status: number): CloudCodeApiError {
  // A rate limit carries no detail the reader can act on beyond the status
  // itself, so the server's own wording is dropped here rather than shown
  // verbatim: a bare "HTTP 429" message is machine-shaped, which routes
  // toUserMessage through the shared httpStatusMessage ladder instead of the
  // "own words win" branch, landing on the same copy Library shows for a 429.
  if (status === 429) return new CloudCodeApiError(`HTTP ${status}`, status);
  const parsed = z
    .object({
      error: z
        .union([
          z.string(),
          z.object({ code: z.string().optional(), message: z.string().optional() }),
        ])
        .optional(),
      message: z.string().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return new CloudCodeApiError(`Request failed (${status}).`, status);
  const nested = typeof parsed.data.error === 'object' ? parsed.data.error : undefined;
  const message =
    nested?.message ??
    (typeof parsed.data.error === 'string' ? parsed.data.error : undefined) ??
    parsed.data.message ??
    `Request failed (${status}).`;
  return new CloudCodeApiError(message, status, nested?.code);
}

export function createCloudCodeApi(dependencies: CloudCodeApiDependencies = {}): CloudCodeApi {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const getCsrfToken = dependencies.getCsrfToken ?? getBrowserCsrfToken;

  async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(path, { credentials: 'include', ...init });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new CloudCodeApiError(
        'Could not reach managed Code. Check your connection and retry.',
        0,
      );
    }
    const body = await responseBody(response);
    if (!response.ok) throw apiError(body, response.status);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new CloudCodeApiError('Managed Code returned an invalid response.', 502);
    }
    return parsed.data;
  }

  async function mutationHeaders(): Promise<Record<string, string>> {
    return {
      'Content-Type': 'application/json',
      'x-csrf-token': await getCsrfToken(),
    };
  }

  return {
    list(signal) {
      return request('/api/code/sessions', { signal }, listSchema);
    },
    get(sessionId, signal) {
      return request(
        `/api/code/sessions/${encodeURIComponent(sessionId)}`,
        { signal },
        sessionDetailSchema,
      );
    },
    async create(input, signal) {
      return request(
        '/api/code/sessions',
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify(input),
          signal,
        },
        sessionDetailSchema,
      );
    },
    async run(sessionId, command, signal) {
      return request(
        `/api/code/sessions/${encodeURIComponent(sessionId)}/commands`,
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify({ command }),
          signal,
        },
        commandSchema,
      );
    },
    async close(sessionId, signal) {
      const body = await request(
        `/api/code/sessions/${encodeURIComponent(sessionId)}`,
        { method: 'DELETE', headers: await mutationHeaders(), signal },
        sessionOnlySchema,
      );
      return body.session;
    },
    async commit(sessionId, message, signal) {
      return request(
        `/api/code/sessions/${encodeURIComponent(sessionId)}/commit`,
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify({ message }),
          signal,
        },
        commitResultSchema,
      );
    },
    async startAgentTurn(sessionId, input, signal) {
      return request(
        `/api/code/sessions/${encodeURIComponent(sessionId)}/agent`,
        {
          method: 'POST',
          headers: { ...(await mutationHeaders()), 'idempotency-key': input.idempotencyKey },
          body: JSON.stringify({ goal: input.goal, model: input.model }),
          signal,
        },
        agentTurnSchema,
      );
    },
    async listApprovals(sessionId, signal) {
      const body = await request(
        `/api/code/sessions/${encodeURIComponent(sessionId)}/agent/approvals`,
        { signal },
        agentApprovalsSchema,
      );
      return body.approvals;
    },
    async decideApproval(sessionId, input, signal) {
      return request(
        `/api/code/sessions/${encodeURIComponent(sessionId)}/agent/approvals`,
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify(input),
          signal,
        },
        agentTurnSchema,
      );
    },
  };
}

export const cloudCodeApi = createCloudCodeApi();
