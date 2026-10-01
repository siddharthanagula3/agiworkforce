import {
  AgentTaskStateSchema,
  CloudAgentRunSteerRequestSchema,
  ManagedCloudAgentRunAlreadyResumingError,
  ManagedCloudAgentRunApprovalExpiredError,
  ManagedCloudAgentRunHttpError,
  ManagedCloudAgentRunRequestIdSchema,
  ManagedCloudAgentRunReferenceSchema,
  TOOL_APPROVAL_GUIDANCE_MAX_LENGTH,
  TOOL_INPUT_RESUME_PATH,
  ToolInputResumeRequestSchema,
  createManagedCloudAgentRunClient,
  managedCloudAgentRunPath,
  readManagedCloudAgentRunHandle,
  reconcileManagedCloudPublicText,
  type CloudAgentRun,
  type CloudAgentRunListPage,
  type CloudAgentRunSteer,
  type ManagedCloudAgentRunApprovalDecision,
  type ManagedCloudAgentRunClient,
  type ManagedCloudAgentRunReference,
  type ToolInputResponseWire,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

const MAX_VISIBLE_TEXT_CHARACTERS = 512_000;
export const MANAGED_RUN_CANCELLATION_TIMEOUT_MS = 15_000;
const RUN_LIST_PAGE_SIZE = 25;
const RUN_JOURNAL_PAGE_SIZE = 500;
const RUN_JOURNAL_MAX_PAGES = 8;
const RUN_JOURNAL_WINDOW_SIZE = RUN_JOURNAL_PAGE_SIZE * RUN_JOURNAL_MAX_PAGES;
export const ALL_MANAGED_RUN_STATES = AgentTaskStateSchema.options;

export interface ChromeManagedRunDependencies {
  getAuthToken: typeof getAuthToken;
  createClient: (token: string) => ManagedCloudAgentRunClient;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  onText?: (text: string) => void | Promise<void>;
  onAgentEvent?: (event: AgentEventEnvelope) => void | Promise<void>;
  onRunReference?: (run: ManagedCloudAgentRunReference) => void | Promise<void>;
}

export interface ResumeChromeManagedRunRequest {
  run: ManagedCloudAgentRunReference;
  alreadyVisibleText: string;
  signal?: AbortSignal;
}

export type ChromeManagedRunControlResult =
  | { status: 'success' }
  | {
      status: 'error';
      code: 'invalid_request' | 'auth_required' | 'cancelled' | 'server_error';
      message: string;
    };
type ChromeManagedRunControlError = Extract<ChromeManagedRunControlResult, { status: 'error' }>;

export type ChromeManagedRunCancellationResult =
  { status: 'success'; run: CloudAgentRun } | ChromeManagedRunControlError;

function createDefaultClient(token: string): ManagedCloudAgentRunClient {
  return createManagedCloudAgentRunClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getAuthToken: async () => token,
    decorateMutationHeaders: (headers) => ({
      ...headers,
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    }),
  });
}

const DEFAULT_DEPENDENCIES: ChromeManagedRunDependencies = {
  getAuthToken,
  createClient: createDefaultClient,
};

function validateReference(value: unknown): ManagedCloudAgentRunReference | undefined {
  const parsed = ManagedCloudAgentRunReferenceSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function errorResult(
  error: unknown,
  signal?: AbortSignal,
  fallbackMessage = 'The AGI Cloud run could not be resumed.',
): ChromeManagedRunControlError {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return { status: 'error', code: 'cancelled', message: 'Cancelled.' };
  }
  if (
    error instanceof ManagedCloudAgentRunHttpError &&
    (error.status === 401 || error.status === 403)
  ) {
    return { status: 'error', code: 'auth_required', message: 'Sign in to continue AGI Cloud.' };
  }
  return {
    status: 'error',
    code: 'server_error',
    message: error instanceof Error ? error.message : fallbackMessage,
  };
}

function validateRunId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    managedCloudAgentRunPath(value);
    return value;
  } catch {
    return undefined;
  }
}

export async function findChromeManagedRunByRequestId(
  requestId: string,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
  signal?: AbortSignal,
): Promise<ManagedCloudAgentRunReference | null> {
  if (!ManagedCloudAgentRunRequestIdSchema.safeParse(requestId).success) {
    throw new Error('Invalid Managed Cloud request identity.');
  }
  if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const token = await resolvedDependencies.getAuthToken();
  if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
  if (!token) throw new Error('Sign in to recover the scheduled AGI Cloud run.');

  const client = resolvedDependencies.createClient(token);
  const page = await client.listRuns({
    states: [...ALL_MANAGED_RUN_STATES],
    requestId,
    limit: 1,
    signal,
  });
  if (page.nextCursor !== null) {
    throw new Error('Exact Managed Cloud request lookup returned an invalid continuation cursor.');
  }
  const run = page.runs.find(
    (candidate) => candidate.requestId === requestId && candidate.originSurface === 'chrome',
  );
  if (run) {
    return {
      runId: run.id,
      runPath: managedCloudAgentRunPath(run.id),
      lastSequence: -1,
      state: run.state,
      cancellationRequestedAt: run.cancellationRequestedAt,
    };
  }
  return null;
}

export async function resumeChromeManagedRun(
  request: ResumeChromeManagedRunRequest,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
): Promise<ChromeManagedRunControlResult> {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const run = validateReference(request.run);
  if (
    !run ||
    typeof request.alreadyVisibleText !== 'string' ||
    request.alreadyVisibleText.length > MAX_VISIBLE_TEXT_CHARACTERS
  ) {
    return { status: 'error', code: 'invalid_request', message: 'Invalid Managed Cloud run.' };
  }

  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return { status: 'error', code: 'auth_required', message: 'Sign in to resume AGI Cloud.' };
  }

  let pendingPublicText = request.alreadyVisibleText;
  let emittedTextCharacters = 0;
  let latestRun = { ...run };
  const publishRun = async (patch: Partial<ManagedCloudAgentRunReference>): Promise<void> => {
    latestRun = {
      ...latestRun,
      ...patch,
      lastSequence: Math.max(latestRun.lastSequence, patch.lastSequence ?? -1),
    };
    await resolvedDependencies.onRunReference?.({ ...latestRun });
  };

  try {
    const followed = await resolvedDependencies.createClient(token).followRun(run.runId, {
      afterSequence: -1,
      signal: request.signal,
      onEvent: async (envelope) => {
        if (envelope.event.type === 'text-delta') {
          const reconciled = reconcileManagedCloudPublicText(
            pendingPublicText,
            envelope.event.delta,
          );
          pendingPublicText = reconciled.pending;
          if (reconciled.unmatchedIncoming) {
            emittedTextCharacters += reconciled.unmatchedIncoming.length;
            if (emittedTextCharacters > MAX_VISIBLE_TEXT_CHARACTERS) {
              throw new Error('AGI Cloud returned more output than Chrome can safely render.');
            }
            await resolvedDependencies.onText?.(reconciled.unmatchedIncoming);
          }
        }
        await resolvedDependencies.onAgentEvent?.(envelope);
        await publishRun({ lastSequence: envelope.sequence });
      },
      onSnapshot: async (snapshot) => {
        await publishRun({
          lastSequence: snapshot.nextAfterSequence,
          state: snapshot.run.state,
          cancellationRequestedAt: snapshot.run.cancellationRequestedAt,
        });
      },
    });
    await publishRun({
      lastSequence: followed.lastSequence,
      state: followed.run.state,
      cancellationRequestedAt: followed.run.cancellationRequestedAt,
    });
    if (followed.run.state === 'failed') {
      return { status: 'error', code: 'server_error', message: 'AGI Cloud agent run failed.' };
    }
    if (followed.run.state === 'cancelled') {
      return { status: 'error', code: 'cancelled', message: 'Cancelled.' };
    }
    return { status: 'success' };
  } catch (error) {
    return errorResult(error, request.signal);
  }
}

export interface ChromeManagedRunListRequest {
  states?: CloudAgentRun['state'][];
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export type ChromeManagedRunListResult =
  { status: 'success'; page: CloudAgentRunListPage } | ChromeManagedRunControlError;

export async function listChromeManagedRuns(
  request: ChromeManagedRunListRequest = {},
  dependencies: Partial<ChromeManagedRunDependencies> = {},
): Promise<ChromeManagedRunListResult> {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return {
      status: 'error',
      code: 'auth_required',
      message: 'Sign in to see your AGI Cloud runs.',
    };
  }
  try {
    const page = await resolvedDependencies.createClient(token).listRuns({
      ...(request.states ? { states: [...request.states] } : {}),
      ...(request.cursor ? { cursor: request.cursor } : {}),
      limit: request.limit ?? RUN_LIST_PAGE_SIZE,
      signal: request.signal,
    });
    return { status: 'success', page };
  } catch (error) {
    return errorResult(error, request.signal, 'Your AGI Cloud runs could not be loaded.');
  }
}

export interface ChromeManagedRunJournal {
  run: CloudAgentRun;
  events: AgentEventEnvelope[];
  nextAfterSequence: number;
  truncated: boolean;
}

export interface ReadChromeManagedRunJournalRequest {
  runId: string;
  afterSequence?: number;
  signal?: AbortSignal;
}

export type ChromeManagedRunJournalResult =
  { status: 'success'; journal: ChromeManagedRunJournal } | ChromeManagedRunControlError;

export async function readChromeManagedRunJournal(
  request: ReadChromeManagedRunJournalRequest,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
): Promise<ChromeManagedRunJournalResult> {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const runId = validateRunId(request.runId);
  if (!runId) {
    return { status: 'error', code: 'invalid_request', message: 'Invalid Managed Cloud run.' };
  }
  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return {
      status: 'error',
      code: 'auth_required',
      message: 'Sign in to open this AGI Cloud run.',
    };
  }

  let afterSequence = Math.max(-1, Math.trunc(request.afterSequence ?? -1));
  const events: AgentEventEnvelope[] = [];
  const client = resolvedDependencies.createClient(token);
  try {
    let run: CloudAgentRun | undefined;
    let complete = false;
    let skippedOlder = false;
    let pagesRead = 0;
    while (pagesRead < RUN_JOURNAL_MAX_PAGES && !complete) {
      const snapshot = await client.getRun(runId, {
        afterSequence,
        limit: RUN_JOURNAL_PAGE_SIZE,
        signal: request.signal,
      });
      run = snapshot.run;
      // A log longer than this window cannot be held whole. Anchor the window to
      // the newest events rather than the oldest, so the caller is showing the
      // activity a live run is producing right now.
      if (
        !skippedOlder &&
        events.length === 0 &&
        snapshot.run.lastEventSequence - afterSequence > RUN_JOURNAL_WINDOW_SIZE
      ) {
        skippedOlder = true;
        afterSequence = snapshot.run.lastEventSequence - RUN_JOURNAL_WINDOW_SIZE;
        continue;
      }
      pagesRead += 1;
      events.push(...snapshot.events);
      afterSequence = snapshot.nextAfterSequence;
      complete = afterSequence >= snapshot.run.lastEventSequence || snapshot.events.length === 0;
    }
    if (!run) {
      return {
        status: 'error',
        code: 'server_error',
        message: 'This AGI Cloud run has no journal.',
      };
    }
    return {
      status: 'success',
      journal: {
        run,
        events,
        nextAfterSequence: afterSequence,
        truncated: skippedOlder || !complete,
      },
    };
  } catch (error) {
    return errorResult(error, request.signal, 'This AGI Cloud run could not be read.');
  }
}

export type ChromeManagedRunApprovalErrorCode =
  ChromeManagedRunControlError['code'] | 'already_resolved' | 'approval_expired';

export interface ResolveChromeManagedRunApprovalRequest {
  runId: string;
  toolCallIds: string[];
  decision: ManagedCloudAgentRunApprovalDecision;
  guidance?: string;
  signal?: AbortSignal;
}

export type ChromeManagedRunApprovalResult =
  | { status: 'success' }
  | { status: 'error'; code: ChromeManagedRunApprovalErrorCode; message: string };

export async function resolveChromeManagedRunApproval(
  request: ResolveChromeManagedRunApprovalRequest,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
): Promise<ChromeManagedRunApprovalResult> {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const runId = validateRunId(request.runId);
  const guidance = request.guidance?.trim();
  if (
    !runId ||
    request.toolCallIds.length === 0 ||
    request.toolCallIds.some((toolCallId) => toolCallId.length === 0) ||
    (guidance !== undefined && guidance.length > TOOL_APPROVAL_GUIDANCE_MAX_LENGTH)
  ) {
    return { status: 'error', code: 'invalid_request', message: 'Invalid Managed Cloud approval.' };
  }
  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return {
      status: 'error',
      code: 'auth_required',
      message: 'Sign in to answer this AGI Cloud approval.',
    };
  }

  try {
    await resolvedDependencies.createClient(token).resumeRun(
      runId,
      request.toolCallIds.map((toolCallId) => ({ toolCallId, decision: request.decision })),
      {
        ...(guidance ? { guidance } : {}),
        ...(request.signal ? { signal: request.signal } : {}),
      },
    );
    return { status: 'success' };
  } catch (error) {
    if (error instanceof ManagedCloudAgentRunAlreadyResumingError) {
      return {
        status: 'error',
        code: 'already_resolved',
        message: 'Another device already answered this approval.',
      };
    }
    if (error instanceof ManagedCloudAgentRunApprovalExpiredError) {
      return {
        status: 'error',
        code: 'approval_expired',
        message: 'This approval expired and the run can no longer continue from it.',
      };
    }
    return errorResult(error, request.signal, 'Your decision could not be sent.');
  }
}

export async function cancelChromeManagedRun(
  value: ManagedCloudAgentRunReference,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
  signal?: AbortSignal,
): Promise<ChromeManagedRunCancellationResult> {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const run = validateReference(value);
  if (!run) {
    return { status: 'error', code: 'invalid_request', message: 'Invalid Managed Cloud run.' };
  }
  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return { status: 'error', code: 'auth_required', message: 'Sign in to cancel AGI Cloud.' };
  }
  try {
    return {
      status: 'success',
      run: await resolvedDependencies
        .createClient(token)
        .cancelRun(run.runId, signal ? { signal } : {}),
    };
  } catch (error) {
    return errorResult(error, signal);
  }
}

export async function cancelAndConfirmChromeManagedRun(
  value: ManagedCloudAgentRunReference,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
  signal?: AbortSignal,
): Promise<ChromeManagedRunCancellationResult> {
  const cancellation = await cancelChromeManagedRun(value, dependencies, signal);
  if (cancellation.status === 'error') return cancellation;
  if (TERMINAL_AGENT_TASK_STATES.has(cancellation.run.state)) return cancellation;
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return { status: 'error', code: 'auth_required', message: 'Sign in to confirm cancellation.' };
  }
  try {
    const followed = await resolvedDependencies.createClient(token).followRun(value.runId, {
      afterSequence: value.lastSequence,
      ...(signal ? { signal } : {}),
    });
    if (TERMINAL_AGENT_TASK_STATES.has(followed.run.state)) {
      return { status: 'success', run: followed.run };
    }
    return {
      status: 'error',
      code: 'server_error',
      message: 'Cancellation has not been confirmed. The run may still be working.',
    };
  } catch (error) {
    if (signal?.aborted) {
      return {
        status: 'error',
        code: 'server_error',
        message: 'Cancellation has not been confirmed. The run may still be working.',
      };
    }
    return errorResult(error, signal);
  }
}

export type ChromeManagedRunUpdateResult =
  { status: 'success'; run: CloudAgentRun } | ChromeManagedRunControlError;

export interface PauseChromeManagedRunRequest {
  runId: string;
  signal?: AbortSignal;
}

export async function pauseChromeManagedRun(
  request: PauseChromeManagedRunRequest,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
): Promise<ChromeManagedRunUpdateResult> {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const runId = validateRunId(request.runId);
  if (!runId) {
    return { status: 'error', code: 'invalid_request', message: 'Invalid Managed Cloud run.' };
  }
  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return { status: 'error', code: 'auth_required', message: 'Sign in to pause this run.' };
  }
  try {
    return {
      status: 'success',
      run: await resolvedDependencies
        .createClient(token)
        .pauseRun(runId, request.signal ? { signal: request.signal } : {}),
    };
  } catch (error) {
    return errorResult(error, request.signal, 'The run could not be paused. It is still working.');
  }
}

export interface ResumePausedChromeManagedRunRequest {
  runId: string;
  guidance?: string;
  signal?: AbortSignal;
}

export async function resumePausedChromeManagedRun(
  request: ResumePausedChromeManagedRunRequest,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
): Promise<ChromeManagedRunApprovalResult> {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const runId = validateRunId(request.runId);
  const guidance = request.guidance?.trim();
  if (!runId || (guidance !== undefined && guidance.length > TOOL_APPROVAL_GUIDANCE_MAX_LENGTH)) {
    return { status: 'error', code: 'invalid_request', message: 'Invalid Managed Cloud run.' };
  }
  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return { status: 'error', code: 'auth_required', message: 'Sign in to resume this run.' };
  }
  try {
    await resolvedDependencies.createClient(token).resumePausedRun(runId, {
      ...(guidance ? { guidance } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    return { status: 'success' };
  } catch (error) {
    if (error instanceof ManagedCloudAgentRunAlreadyResumingError) {
      return {
        status: 'error',
        code: 'already_resolved',
        message: 'Another device already resumed this run.',
      };
    }
    return errorResult(error, request.signal, 'The run could not be resumed. It is still paused.');
  }
}

export type ChromeManagedRunSteerResult =
  | { status: 'success'; run: CloudAgentRun; steer: CloudAgentRunSteer }
  | ChromeManagedRunControlError;

export interface SteerChromeManagedRunRequest {
  runId: string;
  message: string;
  signal?: AbortSignal;
}

export async function steerChromeManagedRun(
  request: SteerChromeManagedRunRequest,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
): Promise<ChromeManagedRunSteerResult> {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const runId = validateRunId(request.runId);
  const message = request.message.trim();
  if (!runId || !CloudAgentRunSteerRequestSchema.safeParse({ message }).success) {
    return { status: 'error', code: 'invalid_request', message: 'Write a message for the agent.' };
  }
  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return { status: 'error', code: 'auth_required', message: 'Sign in to message this run.' };
  }
  try {
    const steered = await resolvedDependencies
      .createClient(token)
      .steerRun(runId, message, request.signal ? { signal: request.signal } : {});
    return { status: 'success', run: steered.run, steer: steered.steer };
  } catch (error) {
    return errorResult(
      error,
      request.signal,
      'Your message was not sent. The run keeps working without it.',
    );
  }
}

export interface AnswerChromeManagedRunInputRequest {
  runId: string;
  toolInputs: ToolInputResponseWire[];
  signal?: AbortSignal;
}

async function inputResumeFailureMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const error = body['error'];
  const message =
    error && typeof error === 'object' ? (error as Record<string, unknown>)['message'] : error;
  return typeof message === 'string' && message.trim()
    ? message.trim()
    : 'Your answer could not be sent.';
}

export async function answerChromeManagedRunInput(
  request: AnswerChromeManagedRunInputRequest,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
): Promise<ChromeManagedRunApprovalResult> {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const runId = validateRunId(request.runId);
  const body = ToolInputResumeRequestSchema.safeParse({
    run_id: runId,
    tool_inputs: request.toolInputs,
  });
  if (!runId || !body.success) {
    return { status: 'error', code: 'invalid_request', message: 'Invalid connector answer.' };
  }
  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return { status: 'error', code: 'auth_required', message: 'Sign in to answer this run.' };
  }
  const fetchImpl: NonNullable<ChromeManagedRunDependencies['fetchImpl']> =
    resolvedDependencies.fetchImpl ?? ((input, init) => fetch(input, init));
  try {
    const response = await fetchImpl(`${FREE_TRIAL_GATEWAY}${TOOL_INPUT_RESUME_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Requested-With': 'XMLHttpRequest',
        ...platformRequestHeaders(),
      },
      body: JSON.stringify(body.data),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      return { status: 'error', code: 'auth_required', message: 'Sign in to answer this run.' };
    }
    if (response.status === 409) {
      await response.body?.cancel().catch(() => undefined);
      return {
        status: 'error',
        code: 'already_resolved',
        message: 'Another device already answered this request.',
      };
    }
    if (response.status === 410) {
      await response.body?.cancel().catch(() => undefined);
      return {
        status: 'error',
        code: 'approval_expired',
        message: 'This request expired and the run can no longer continue from it.',
      };
    }
    if (!response.ok) {
      return {
        status: 'error',
        code: 'server_error',
        message: await inputResumeFailureMessage(response),
      };
    }
    if (readManagedCloudAgentRunHandle(response)?.detachable) {
      await response.body?.cancel().catch(() => undefined);
    } else {
      void response.body?.pipeTo(new WritableStream()).catch(() => undefined);
    }
    return { status: 'success' };
  } catch (error) {
    return errorResult(error, request.signal, 'Your answer could not be sent.');
  }
}
