import { z } from 'zod';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { AgentTaskStateSchema } from './agent-events';
import {
  CloudAgentRunCancellationResponseSchema,
  CloudAgentRunListPageSchema,
  CloudAgentRunSnapshotPageSchema,
  MANAGED_CLOUD_AGENT_RUNS_BASE_PATH,
  MANAGED_CLOUD_AGENT_RUN_ID_HEADER,
  MANAGED_CLOUD_AGENT_RUN_URL_HEADER,
  isCloudAgentRunFollowBoundary,
  managedCloudAgentRunPath,
  type CloudAgentRun,
  type CloudAgentRunListPage,
  type CloudAgentRunSnapshotPage,
} from './cloud-agent-runs';
import {
  ManagedCloudAgentRunReferenceSchema as RunReferenceSchema,
  type ManagedCloudAgentRunHandle as RunHandle,
  type ManagedCloudAgentRunReference as RunReference,
} from './managed-cloud-agent-run-reference';
import { ToolApprovalResumeRequestSchema } from './tool-approval-resume';
import { stripTrailingSlashes } from '@agiworkforce/types';

export const TOOL_APPROVAL_RESUME_PATH = '/api/llm/v1/chat/completions/approve';

export type ManagedCloudAgentRunHeaders = Record<string, string>;
export type ManagedCloudAgentRunFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type ManagedCloudAgentRunWait = (ms: number, signal?: AbortSignal) => Promise<void>;

// stays their exported home for `scripts/check-cloud-contract-ownership.mjs`,
// which reads exported declarations out of the canonical module list.
export type ManagedCloudAgentRunHandle = RunHandle;
export type ManagedCloudAgentRunReference = RunReference;
export const ManagedCloudAgentRunReferenceSchema: z.ZodType<ManagedCloudAgentRunReference> =
  RunReferenceSchema;

export interface ManagedCloudAgentRunClientConfig {
  baseUrl?: string;
  getAuthToken?: () => Promise<string | null>;
  decorateMutationHeaders?: (
    headers: ManagedCloudAgentRunHeaders,
  ) => HeadersInit | Promise<HeadersInit>;
  fetchImpl?: ManagedCloudAgentRunFetch;
  wait?: ManagedCloudAgentRunWait;
}

export interface ManagedCloudAgentRunReadOptions {
  afterSequence?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface ManagedCloudAgentRunListOptions {
  states?: CloudAgentRun['state'][];
  requestId?: string;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}

export interface ManagedCloudAgentRunFollowOptions {
  afterSequence?: number;
  pageSize?: number;
  pollIntervalMs?: number;
  retryDelayMs?: number;
  maxTransientErrors?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEventEnvelope) => void | Promise<void>;
  onSnapshot?: (snapshot: CloudAgentRunSnapshotPage) => void | Promise<void>;
}

export interface ManagedCloudAgentRunFollowResult {
  run: CloudAgentRun;
  lastSequence: number;
}

export type ManagedCloudAgentRunApprovalDecision = 'approved' | 'rejected';

export interface ManagedCloudAgentRunApproval {
  toolCallId: string;
  decision: ManagedCloudAgentRunApprovalDecision;
}

export interface ManagedCloudAgentRunClient {
  listRuns(options?: ManagedCloudAgentRunListOptions): Promise<CloudAgentRunListPage>;
  getRun(
    runId: string,
    options?: ManagedCloudAgentRunReadOptions,
  ): Promise<CloudAgentRunSnapshotPage>;
  cancelRun(runId: string, options?: { signal?: AbortSignal }): Promise<CloudAgentRun>;
  resumeRun(
    runId: string,
    approvals: ManagedCloudAgentRunApproval[],
    options?: { signal?: AbortSignal; guidance?: string },
  ): Promise<void>;
  followRun(
    runId: string,
    options?: ManagedCloudAgentRunFollowOptions,
  ): Promise<ManagedCloudAgentRunFollowResult>;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_MAX_TRANSIENT_ERRORS = 5;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export const ManagedCloudAgentRunRequestIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export function reconcileManagedCloudPublicText(
  pending: string,
  incoming: string,
): { pending: string; unmatchedIncoming: string } {
  if (!pending) return { pending: '', unmatchedIncoming: incoming };
  if (pending.startsWith(incoming)) {
    return { pending: pending.slice(incoming.length), unmatchedIncoming: '' };
  }
  if (incoming.startsWith(pending)) {
    return { pending: '', unmatchedIncoming: incoming.slice(pending.length) };
  }
  return { pending, unmatchedIncoming: incoming };
}

export class ManagedCloudAgentRunHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ManagedCloudAgentRunHttpError';
  }
}

export class ManagedCloudAgentRunAlreadyResumingError extends ManagedCloudAgentRunHttpError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ManagedCloudAgentRunAlreadyResumingError';
  }
}

export class ManagedCloudAgentRunApprovalExpiredError extends ManagedCloudAgentRunHttpError {
  constructor(message: string) {
    super(message, 410);
    this.name = 'ManagedCloudAgentRunApprovalExpiredError';
  }
}

export class ManagedCloudAgentRunContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManagedCloudAgentRunContractError';
  }
}

export class ManagedCloudAgentRunAbortError extends Error {
  constructor() {
    super('Managed Cloud agent-run follow was cancelled');
    this.name = 'AbortError';
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return stripTrailingSlashes(baseUrl);
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ManagedCloudAgentRunAbortError();
}

function defaultWait(ms: number, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(handle);
      signal?.removeEventListener('abort', onAbort);
      reject(new ManagedCloudAgentRunAbortError());
    };
    const handle = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseRetryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('Retry-After');
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1_000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

async function responseError(response: Response): Promise<ManagedCloudAgentRunHttpError> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = body['error'];
  const message =
    typeof raw === 'string'
      ? raw
      : raw &&
          typeof raw === 'object' &&
          typeof (raw as Record<string, unknown>)['message'] === 'string'
        ? ((raw as Record<string, unknown>)['message'] as string)
        : `HTTP ${response.status}`;
  return new ManagedCloudAgentRunHttpError(
    `HTTP ${response.status}: ${message}`,
    response.status,
    parseRetryAfterMs(response),
  );
}

async function parseContract<T>(
  response: Response,
  schema: z.ZodType<T>,
  name: string,
): Promise<T> {
  const body = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ManagedCloudAgentRunContractError(
      `Managed Cloud agent-run ${name} contract violation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function isTransient(error: unknown): boolean {
  if (error instanceof ManagedCloudAgentRunContractError) return false;
  if (error instanceof ManagedCloudAgentRunAbortError) return false;
  if (error instanceof ManagedCloudAgentRunHttpError) {
    return TRANSIENT_HTTP_STATUSES.has(error.status);
  }
  return error instanceof Error && error.name !== 'AbortError';
}

export function readManagedCloudAgentRunHandle(
  response: Pick<Response, 'headers'>,
): ManagedCloudAgentRunHandle | null {
  const rawRunId = response.headers.get(MANAGED_CLOUD_AGENT_RUN_ID_HEADER);
  const rawRunPath = response.headers.get(MANAGED_CLOUD_AGENT_RUN_URL_HEADER);
  if (!rawRunId && !rawRunPath) return null;
  if (!rawRunId || !rawRunPath) {
    throw new ManagedCloudAgentRunContractError('Managed Cloud agent-run headers are incomplete');
  }

  const parsedRunId = z.string().uuid().safeParse(rawRunId);
  if (!parsedRunId.success) {
    throw new ManagedCloudAgentRunContractError('Managed Cloud agent-run ID header is invalid');
  }
  const expectedPath = managedCloudAgentRunPath(parsedRunId.data);
  if (rawRunPath !== expectedPath) {
    throw new ManagedCloudAgentRunContractError('Managed Cloud agent-run URL header is invalid');
  }
  return { runId: parsedRunId.data, runPath: expectedPath };
}

export function createManagedCloudAgentRunClient(
  config: ManagedCloudAgentRunClientConfig = {},
): ManagedCloudAgentRunClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const wait = config.wait ?? defaultWait;

  async function readHeaders(): Promise<ManagedCloudAgentRunHeaders> {
    const token = await config.getAuthToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function mutationHeaders(): Promise<HeadersInit> {
    const headers = await readHeaders();
    return config.decorateMutationHeaders ? config.decorateMutationHeaders(headers) : headers;
  }

  async function request(path: string, init: RequestInit): Promise<Response> {
    assertNotAborted(init.signal ?? undefined);
    const response = await fetchImpl(`${baseUrl}${path}`, init);
    if (!response.ok) throw await responseError(response);
    return response;
  }

  const client: ManagedCloudAgentRunClient = {
    async listRuns(options = {}) {
      const states = z
        .array(AgentTaskStateSchema)
        .max(9)
        .parse(options.states ?? []);
      const requestId = ManagedCloudAgentRunRequestIdSchema.optional().parse(options.requestId);
      const cursor = z.string().min(1).max(512).optional().parse(options.cursor);
      const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 25)));
      const params = new URLSearchParams();
      for (const state of states) params.append('state', state);
      params.set('limit', String(limit));
      if (requestId) params.set('requestId', requestId);
      if (cursor) params.set('cursor', cursor);
      const response = await request(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}?${params.toString()}`, {
        headers: await readHeaders(),
        signal: options.signal,
      });
      return parseContract(response, CloudAgentRunListPageSchema, 'list response');
    },

    async getRun(runId, options = {}) {
      const afterSequence = Math.max(-1, Math.trunc(options.afterSequence ?? -1));
      const limit = Math.min(500, Math.max(1, Math.trunc(options.limit ?? DEFAULT_PAGE_SIZE)));
      const params = new URLSearchParams({
        after: String(afterSequence),
        limit: String(limit),
      });
      const response = await request(`${managedCloudAgentRunPath(runId)}?${params.toString()}`, {
        headers: await readHeaders(),
        signal: options.signal,
      });
      return parseContract(response, CloudAgentRunSnapshotPageSchema, 'read response');
    },

    async cancelRun(runId, options = {}) {
      const response = await request(managedCloudAgentRunPath(runId), {
        method: 'POST',
        headers: await mutationHeaders(),
        signal: options.signal,
      });
      const body = await parseContract(
        response,
        CloudAgentRunCancellationResponseSchema,
        'cancellation response',
      );
      return body.run;
    },

    async resumeRun(runId, approvals, options = {}) {
      const guidance = options.guidance?.trim();
      const body = ToolApprovalResumeRequestSchema.parse({
        run_id: runId,
        tool_approvals: approvals.map((approval) => ({
          tool_call_id: approval.toolCallId,
          decision: approval.decision,
        })),
        ...(guidance ? { guidance } : {}),
      });
      let response: Response;
      try {
        response = await request(TOOL_APPROVAL_RESUME_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await mutationHeaders()) },
          body: JSON.stringify(body),
          signal: options.signal,
        });
      } catch (error) {
        if (error instanceof ManagedCloudAgentRunHttpError) {
          if (error.status === 409) {
            throw new ManagedCloudAgentRunAlreadyResumingError(error.message);
          }
          if (error.status === 410) {
            throw new ManagedCloudAgentRunApprovalExpiredError(error.message);
          }
        }
        throw error;
      }

      await response.body?.cancel().catch(() => undefined);
    },

    async followRun(runId, options = {}) {
      const pageSize = Math.min(
        500,
        Math.max(1, Math.trunc(options.pageSize ?? DEFAULT_PAGE_SIZE)),
      );
      const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
      const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
      const maxTransientErrors = Math.max(
        0,
        Math.trunc(options.maxTransientErrors ?? DEFAULT_MAX_TRANSIENT_ERRORS),
      );
      let lastSequence = Math.max(-1, Math.trunc(options.afterSequence ?? -1));
      let transientErrors = 0;

      assertNotAborted(options.signal);
      for (;;) {
        let snapshot: CloudAgentRunSnapshotPage;
        try {
          snapshot = await client.getRun(runId, {
            afterSequence: lastSequence,
            limit: pageSize,
            signal: options.signal,
          });
          transientErrors = 0;
        } catch (error) {
          if (!isTransient(error) || transientErrors >= maxTransientErrors) throw error;
          transientErrors += 1;
          const delayMs =
            error instanceof ManagedCloudAgentRunHttpError && error.retryAfterMs !== undefined
              ? error.retryAfterMs
              : retryDelayMs * transientErrors;
          await wait(delayMs, options.signal);
          continue;
        }

        for (const envelope of snapshot.events) {
          await options.onEvent?.(envelope);
        }
        await options.onSnapshot?.(snapshot);
        lastSequence = snapshot.nextAfterSequence;

        if (isCloudAgentRunFollowBoundary(snapshot.run.state)) {
          return { run: snapshot.run, lastSequence };
        }

        const serverHasMoreEvents = lastSequence < snapshot.run.lastEventSequence;
        const pageMayBeFull = snapshot.events.length >= pageSize;
        if (!serverHasMoreEvents && !pageMayBeFull) {
          await wait(pollIntervalMs, options.signal);
        }
      }
    },
  };

  return client;
}
