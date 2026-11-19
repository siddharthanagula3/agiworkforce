import { z } from 'zod';
import {
  CLOUD_CODE_ENVIRONMENT_LIMITS,
  CLOUD_CODE_NETWORK_ACCESS,
  type CloudCodeEnvironment,
  type CloudCodeEnvironmentListResponse,
  type CreateCloudCodeEnvironmentInput,
  type UpdateCloudCodeEnvironmentInput,
} from '@agiworkforce/types';
import type {
  CloudCodeAgentTurnRecord,
  CloudCodeSession,
  CloudCodeSessionListResponse,
  CloudCodeSessionStatusFilter,
  CloudCodeShareVisibility,
  CloudCodeSharedSession,
  CloudCodeTerminalEntry,
  CreateCloudCodeSessionInput,
  RunCloudCodeCommandResponse,
} from '@agiworkforce/types';
import {
  CLOUD_CODE_BRANCHES_PATH,
  CLOUD_CODE_REPOSITORIES_PATH,
  CLOUD_CODE_SESSIONS_PATH,
  CLOUD_CODE_SHARED_SESSIONS_PATH,
  CloudCodeAgentApprovalsSchema,
  CloudCodeBranchListSchema,
  CloudCodeAgentTurnSchema,
  CloudCodeChangesSchema,
  CloudCodeCommandResponseSchema,
  CloudCodeCommitResultSchema,
  CloudCodeDiscardResultSchema,
  CloudCodePullRequestSchema,
  CloudCodePullRequestStatusSchema,
  CloudCodeRepositoryListSchema,
  CloudCodeSessionDeletedSchema,
  CloudCodeSessionDetailSchema,
  CloudCodeSessionListSchema,
  CloudCodeSessionResponseSchema,
  CloudCodeSharedSessionSchema,
  CloudCodeTurnCancellationSchema,
  cloudCodeSessionPath,
  type CloudCodeAgentApproval,
  type CloudCodeAgentTurn,
  type CloudCodeBranchList,
  type CloudCodeChanges,
  type CloudCodeCommitResult,
  type CloudCodeDiscardResult,
  type CommitCloudCodeSessionRequest,
  type CloudCodePullRequest,
  type CloudCodePullRequestStatus,
  type CloudCodeRepositoryList,
  type CloudCodeTurnCancellation,
  type DecideCloudCodeApprovalRequest,
  type StartCloudCodeAgentTurnRequest,
} from './cloud-code-sessions';

export const CLOUD_CODE_ENVIRONMENTS_PATH = '/api/code/environments';

export function cloudCodeEnvironmentPath(environmentId: string): string {
  return `${CLOUD_CODE_ENVIRONMENTS_PATH}/${encodeURIComponent(environmentId)}`;
}

export const CloudCodeEnvironmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  networkAccess: z.enum(CLOUD_CODE_NETWORK_ACCESS),
  extraHosts: z.array(z.string()),
  allowPackageManagers: z.boolean(),
  setupScript: z.string(),
  variableNames: z.array(z.string()),
  isDefault: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CloudCodeEnvironmentListSchema = z.object({
  environments: z.array(CloudCodeEnvironmentSchema),
  limit: z.number().int().nonnegative(),
});

export const CloudCodeEnvironmentResponseSchema = z.object({
  environment: CloudCodeEnvironmentSchema,
});

export const CloudCodeEnvironmentDeletedSchema = z.object({ deleted: z.literal(true) });

const environmentChanges = {
  name: z.string().trim().min(1).max(CLOUD_CODE_ENVIRONMENT_LIMITS.name),
  networkAccess: z.enum(CLOUD_CODE_NETWORK_ACCESS),
  fullNetworkAcknowledged: z.boolean().optional(),
  extraHosts: z.array(z.string()).optional(),
  allowPackageManagers: z.boolean().optional(),
  setupScript: z.string().optional(),
  isDefault: z.boolean().optional(),
};

export const CreateCloudCodeEnvironmentRequestSchema = z.strictObject({
  ...environmentChanges,
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
});

export const UpdateCloudCodeEnvironmentRequestSchema = z
  .strictObject({
    ...environmentChanges,
    name: environmentChanges.name.optional(),
    networkAccess: environmentChanges.networkAccess.optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'Send at least one setting to change',
  });

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

export interface CloudCodeRequestContext {
  /** The request runs an agent turn, so it stays open until the turn stops or pauses. */
  runsAgentTurn: boolean;
}

export type CloudCodeFetch = (
  path: string,
  init: RequestInit,
  context: CloudCodeRequestContext,
) => Promise<Response>;

export interface ManagedCloudCodeApiConfig {
  fetchImpl: CloudCodeFetch;
  mutationHeaders?: () => Promise<Record<string, string>>;
}

export interface CloudCodeApi {
  list(
    status?: CloudCodeSessionStatusFilter,
    signal?: AbortSignal,
  ): Promise<CloudCodeSessionListResponse>;
  listRepositories(search?: string, signal?: AbortSignal): Promise<CloudCodeRepositoryList>;
  listBranches(
    repository: { installationId: number; fullName: string },
    signal?: AbortSignal,
  ): Promise<CloudCodeBranchList>;
  get(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<{
    session: CloudCodeSession;
    terminalEntries: CloudCodeTerminalEntry[];
    turns: CloudCodeAgentTurnRecord[];
    turnsTruncated?: boolean;
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
  changes(sessionId: string, signal?: AbortSignal): Promise<CloudCodeChanges>;
  createPullRequest(sessionId: string, signal?: AbortSignal): Promise<CloudCodePullRequest>;
  pullRequestStatus(sessionId: string, signal?: AbortSignal): Promise<CloudCodePullRequestStatus>;
  close(sessionId: string, signal?: AbortSignal): Promise<CloudCodeSession>;
  rename(sessionId: string, title: string, signal?: AbortSignal): Promise<CloudCodeSession>;
  setArchived(
    sessionId: string,
    archived: boolean,
    signal?: AbortSignal,
  ): Promise<CloudCodeSession>;
  setSharing(
    sessionId: string,
    visibility: CloudCodeShareVisibility,
    signal?: AbortSignal,
  ): Promise<CloudCodeSession>;
  openShared(token: string, signal?: AbortSignal): Promise<CloudCodeSharedSession>;
  deleteSession(sessionId: string, signal?: AbortSignal): Promise<void>;
  commit(
    sessionId: string,
    input: CommitCloudCodeSessionRequest,
    signal?: AbortSignal,
  ): Promise<CloudCodeCommitResult>;
  discardChanges(
    sessionId: string,
    files: string[],
    signal?: AbortSignal,
  ): Promise<CloudCodeDiscardResult>;
  startAgentTurn(
    sessionId: string,
    input: StartCloudCodeAgentTurnRequest,
    signal?: AbortSignal,
  ): Promise<CloudCodeAgentTurn>;
  cancelAgentTurn(
    sessionId: string,
    turnId?: string,
    signal?: AbortSignal,
  ): Promise<CloudCodeTurnCancellation>;
  listApprovals(sessionId: string, signal?: AbortSignal): Promise<CloudCodeAgentApproval[]>;
  decideApproval(
    sessionId: string,
    input: DecideCloudCodeApprovalRequest,
    signal?: AbortSignal,
  ): Promise<CloudCodeAgentTurn>;
}

export interface CloudCodeEnvironmentsApi {
  listEnvironments(signal?: AbortSignal): Promise<CloudCodeEnvironmentListResponse>;
  createEnvironment(
    input: CreateCloudCodeEnvironmentInput,
    signal?: AbortSignal,
  ): Promise<CloudCodeEnvironment>;
  updateEnvironment(
    environmentId: string,
    changes: UpdateCloudCodeEnvironmentInput,
    signal?: AbortSignal,
  ): Promise<CloudCodeEnvironment>;
  deleteEnvironment(environmentId: string, signal?: AbortSignal): Promise<void>;
}

export type ManagedCloudCodeApi = CloudCodeApi & CloudCodeEnvironmentsApi;

export function isCloudCodeEnvironmentsUnavailable(error: unknown): boolean {
  return error instanceof CloudCodeApiError && error.status === 404;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
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
          z.object({
            code: z.string().optional(),
            message: z.string().optional(),
            details: z.object({ reason: z.string().optional() }).passthrough().optional(),
          }),
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
  return new CloudCodeApiError(message, status, nested?.details?.reason ?? nested?.code);
}

export function createManagedCloudCodeApi(config: ManagedCloudCodeApiConfig): ManagedCloudCodeApi {
  async function request<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    runsAgentTurn = false,
  ): Promise<T> {
    let response: Response;
    try {
      response = await config.fetchImpl(path, init, { runsAgentTurn });
    } catch (error) {
      if (isAbortError(error)) throw error;
      const refusedStatus = (error as { status?: unknown } | null)?.status;
      if (error instanceof Error && typeof refusedStatus === 'number' && refusedStatus > 0) {
        const code = (error as { code?: unknown }).code;
        throw new CloudCodeApiError(
          error.message,
          refusedStatus,
          typeof code === 'string' ? code : undefined,
        );
      }
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
      ...(await config.mutationHeaders?.()),
    };
  }

  return {
    list(status, signal) {
      const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
      return request(`${CLOUD_CODE_SESSIONS_PATH}${query}`, { signal }, CloudCodeSessionListSchema);
    },
    listRepositories(search, signal) {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      return request(
        `${CLOUD_CODE_REPOSITORIES_PATH}${query}`,
        { signal },
        CloudCodeRepositoryListSchema,
      );
    },
    listBranches(repository, signal) {
      const query = new URLSearchParams({
        installationId: String(repository.installationId),
        repository: repository.fullName,
      });
      return request(
        `${CLOUD_CODE_BRANCHES_PATH}?${query.toString()}`,
        { signal },
        CloudCodeBranchListSchema,
      );
    },
    get(sessionId, signal) {
      return request(cloudCodeSessionPath(sessionId), { signal }, CloudCodeSessionDetailSchema);
    },
    async create(input, signal) {
      return request(
        CLOUD_CODE_SESSIONS_PATH,
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify(input),
          signal,
        },
        CloudCodeSessionDetailSchema,
      );
    },
    async run(sessionId, command, signal) {
      return request(
        `${cloudCodeSessionPath(sessionId)}/commands`,
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify({ command }),
          signal,
        },
        CloudCodeCommandResponseSchema,
      );
    },
    changes(sessionId, signal) {
      return request(
        `${cloudCodeSessionPath(sessionId)}/changes`,
        { signal },
        CloudCodeChangesSchema,
      );
    },
    async createPullRequest(sessionId, signal) {
      return request(
        `${cloudCodeSessionPath(sessionId)}/pull-request`,
        { method: 'POST', headers: await mutationHeaders(), signal },
        CloudCodePullRequestSchema,
      );
    },
    pullRequestStatus(sessionId, signal) {
      return request(
        `${cloudCodeSessionPath(sessionId)}/pull-request/status`,
        { signal },
        CloudCodePullRequestStatusSchema,
      );
    },
    async close(sessionId, signal) {
      const body = await request(
        `${cloudCodeSessionPath(sessionId)}/close`,
        { method: 'POST', headers: await mutationHeaders(), signal },
        CloudCodeSessionResponseSchema,
      );
      return body.session;
    },
    async rename(sessionId, title, signal) {
      const body = await request(
        cloudCodeSessionPath(sessionId),
        {
          method: 'PATCH',
          headers: await mutationHeaders(),
          body: JSON.stringify({ title }),
          signal,
        },
        CloudCodeSessionResponseSchema,
      );
      return body.session;
    },
    async setArchived(sessionId, archived, signal) {
      const body = await request(
        cloudCodeSessionPath(sessionId),
        {
          method: 'PATCH',
          headers: await mutationHeaders(),
          body: JSON.stringify({ archived }),
          signal,
        },
        CloudCodeSessionResponseSchema,
      );
      return body.session;
    },
    async setSharing(sessionId, visibility, signal) {
      const body = await request(
        cloudCodeSessionPath(sessionId),
        {
          method: 'PATCH',
          headers: await mutationHeaders(),
          body: JSON.stringify({ shareVisibility: visibility }),
          signal,
        },
        CloudCodeSessionResponseSchema,
      );
      return body.session;
    },
    openShared(token, signal) {
      return request(
        `${CLOUD_CODE_SHARED_SESSIONS_PATH}/${encodeURIComponent(token)}`,
        { signal },
        CloudCodeSharedSessionSchema,
      );
    },
    async deleteSession(sessionId, signal) {
      await request(
        cloudCodeSessionPath(sessionId),
        { method: 'DELETE', headers: await mutationHeaders(), signal },
        CloudCodeSessionDeletedSchema,
      );
    },
    async commit(sessionId, input, signal) {
      return request(
        `${cloudCodeSessionPath(sessionId)}/commit`,
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify(input),
          signal,
        },
        CloudCodeCommitResultSchema,
      );
    },
    async discardChanges(sessionId, files, signal) {
      return request(
        `${cloudCodeSessionPath(sessionId)}/changes`,
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify({ discard: files }),
          signal,
        },
        CloudCodeDiscardResultSchema,
      );
    },
    async startAgentTurn(sessionId, input, signal) {
      return request(
        `${cloudCodeSessionPath(sessionId)}/agent`,
        {
          method: 'POST',
          headers: { ...(await mutationHeaders()), 'idempotency-key': input.idempotencyKey },
          body: JSON.stringify({
            goal: input.goal,
            model: input.model,
            ...(input.maxSteps ? { maxSteps: input.maxSteps } : {}),
            ...(input.mode ? { mode: input.mode } : {}),
          }),
          signal,
        },
        CloudCodeAgentTurnSchema,
        true,
      );
    },
    async cancelAgentTurn(sessionId, turnId, signal) {
      return request(
        `${cloudCodeSessionPath(sessionId)}/agent/cancel`,
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify(turnId ? { turnId } : {}),
          signal,
        },
        CloudCodeTurnCancellationSchema,
      );
    },
    async listApprovals(sessionId, signal) {
      const body = await request(
        `${cloudCodeSessionPath(sessionId)}/agent/approvals`,
        { signal },
        CloudCodeAgentApprovalsSchema,
      );
      return body.approvals;
    },
    async decideApproval(sessionId, input, signal) {
      return request(
        `${cloudCodeSessionPath(sessionId)}/agent/approvals`,
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify(input),
          signal,
        },
        CloudCodeAgentTurnSchema,
        true,
      );
    },
    listEnvironments(signal) {
      return request(CLOUD_CODE_ENVIRONMENTS_PATH, { signal }, CloudCodeEnvironmentListSchema);
    },
    async createEnvironment(input, signal) {
      const body = await request(
        CLOUD_CODE_ENVIRONMENTS_PATH,
        {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify(input),
          signal,
        },
        CloudCodeEnvironmentResponseSchema,
      );
      return body.environment;
    },
    async updateEnvironment(environmentId, changes, signal) {
      const body = await request(
        cloudCodeEnvironmentPath(environmentId),
        {
          method: 'PATCH',
          headers: await mutationHeaders(),
          body: JSON.stringify(changes),
          signal,
        },
        CloudCodeEnvironmentResponseSchema,
      );
      return body.environment;
    },
    async deleteEnvironment(environmentId, signal) {
      await request(
        cloudCodeEnvironmentPath(environmentId),
        { method: 'DELETE', headers: await mutationHeaders(), signal },
        CloudCodeEnvironmentDeletedSchema,
      );
    },
  };
}
