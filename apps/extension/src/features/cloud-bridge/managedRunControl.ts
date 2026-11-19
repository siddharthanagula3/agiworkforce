import { ScheduledTaskTransportControl } from '../background/scheduled-task-transport';
import {
  AgentTaskStateSchema,
  CallerToolResumeRequestSchema,
  ManagedCloudAgentRunHttpError,
  ManagedCloudAgentRunRequestIdSchema,
  ManagedCloudAgentRunReferenceSchema,
  createManagedCloudAgentRunClient,
  managedCloudAgentRunPath,
  reconcileManagedCloudPublicText,
  type CloudAgentRun,
  type ManagedCloudAgentRunClient,
  type ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { TERMINAL_AGENT_TASK_STATES, messageKindForAgentEvent } from '@agiworkforce/types';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';
import {
  captureCloudRefusals,
  classifyCloudRefusal,
  describeCloudRefusal,
  type CloudRefusal,
} from './cloudRefusal';
import { platformRequestHeaders } from '../../platformHeaders';
import { chatBrowserToolDefinitions } from '../computer-use/chatBrowserTools';
import {
  createCallerToolContinuationReader,
  type CallerToolContinuation,
  createToolUseJournal,
} from '../computer-use/toolHandoff';

const UNCONFIRMED_CANCELLATION_MESSAGE =
  'Cancellation has not been confirmed. The run may still be working.';
const MAX_VISIBLE_TEXT_CHARACTERS = 512_000;
export const RESUMED_RUN_BROWSER_STEP_MESSAGE =
  'This reply stopped while it waited on a browser step. Retry to run it again.';
export const MANAGED_RUN_CANCELLATION_TIMEOUT_MS = 15_000;
export const ALL_MANAGED_RUN_STATES = AgentTaskStateSchema.options;
export const MANAGED_RUN_CANCELLATION_CONFIRMATION_TIMEOUT_MS = 15_000;

type RunControlFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ChromeManagedRunDependencies {
  getAuthToken: typeof getAuthToken;
  createClient: (token: string, fetchImpl?: RunControlFetch) => ManagedCloudAgentRunClient;
  fetchImpl?: RunControlFetch;
  onText?: (text: string) => void | Promise<void>;
  onAgentEvent?: (event: AgentEventEnvelope) => void | Promise<void>;
  onRunReference?: (run: ManagedCloudAgentRunReference) => void | Promise<void>;
  onCallerCheckpoint?: (checkpoint: CallerToolContinuation) => void | Promise<void>;
}

export interface ResumeChromeManagedRunRequest {
  run: ManagedCloudAgentRunReference;
  alreadyVisibleText: string;
  originalCallerToolNames?: readonly string[];
  signal?: AbortSignal;
}

export type ChromeManagedRunControlResult =
  | { status: 'success' }
  | {
      status: 'error';
      code:
        | 'invalid_request'
        | 'auth_required'
        | 'plan_required'
        | 'policy_blocked'
        | 'account_suspended'
        | 'rate_limited'
        | 'cancelled'
        | 'server_error'
        | 'protocol_error';
      message: string;
      retryAfterSeconds?: number;
    };
type ChromeManagedRunControlError = Extract<ChromeManagedRunControlResult, { status: 'error' }>;

export type ChromeManagedRunCancellationResult =
  { status: 'success'; run: CloudAgentRun } | ChromeManagedRunControlError;

function createDefaultClient(
  token: string,
  fetchImpl?: RunControlFetch,
): ManagedCloudAgentRunClient {
  return createManagedCloudAgentRunClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getAuthToken: async () => token,
    ...(fetchImpl ? { fetchImpl } : {}),
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

const RUN_REFUSAL_COPY = {
  refused: 'This AGI account cannot use this AGI Cloud run from the Chrome extension.',
  unavailable: 'AGI Cloud is temporarily unavailable.',
  limitUnit: 'requests',
};

function runRefusal(
  error: ManagedCloudAgentRunHttpError,
  captured: CloudRefusal | null,
): CloudRefusal {
  if (captured?.status === error.status) return captured;
  return classifyCloudRefusal(error.status, {
    error: { message: error.message.replace(/^HTTP \d{3}: /u, '') },
  });
}

function refusalResult(refusal: CloudRefusal): ChromeManagedRunControlError | null {
  const message = describeCloudRefusal(refusal, RUN_REFUSAL_COPY);
  const retry =
    refusal.retryAfterSeconds !== undefined ? { retryAfterSeconds: refusal.retryAfterSeconds } : {};
  switch (refusal.kind) {
    case 'auth':
      return { status: 'error', code: 'auth_required', message: 'Sign in to continue AGI Cloud.' };
    case 'plan':
      return { status: 'error', code: 'plan_required', message };
    case 'policy':
      return { status: 'error', code: 'policy_blocked', message };
    case 'account':
      return { status: 'error', code: 'account_suspended', message };
    case 'refused':
      return { status: 'error', code: 'invalid_request', message };
    case 'rate_limited':
      return { status: 'error', code: 'rate_limited', message, ...retry };
    case 'unavailable':
      return { status: 'error', code: 'server_error', message, ...retry };
    default:
      return null;
  }
}

function errorResult(
  error: unknown,
  signal?: AbortSignal,
  fallbackMessage = 'The AGI Cloud run could not be resumed.',
  captured: CloudRefusal | null = null,
): ChromeManagedRunControlError {
  if (error instanceof ScheduledTaskTransportControl) throw error;
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return { status: 'error', code: 'cancelled', message: 'Cancelled.' };
  }
  if (error instanceof ManagedCloudAgentRunHttpError && error.status > 0) {
    const refused = refusalResult(runRefusal(error, captured));
    if (refused) return refused;
  }
  return {
    status: 'error',
    code: 'server_error',
    message: error instanceof Error ? error.message : fallbackMessage,
  };
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

  const originalCallerToolNames = request.originalCallerToolNames?.slice();
  let token: string | null;
  try {
    token = await resolvedDependencies.getAuthToken();
  } catch (error) {
    return errorResult(error, request.signal, 'Sign-in could not be refreshed.');
  }

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

  const toolUseJournal = createToolUseJournal(
    originalCallerToolNames === undefined
      ? chatBrowserToolDefinitions('act', true)
      : originalCallerToolNames.map((name) => ({ function: { name } })),
  );
  const callerReader =
    resolvedDependencies.onCallerCheckpoint && originalCallerToolNames?.length
      ? createCallerToolContinuationReader(
          originalCallerToolNames.map((name) => ({ function: { name } })),
        )
      : undefined;
  const refusals = captureCloudRefusals(resolvedDependencies.fetchImpl);
  let askedForBrowserTool = false;
  let sawCanonicalCaller = false;
  let pendingCallerSequence: number | undefined;
  let observedSequence = -1;

  try {
    const followed = await resolvedDependencies
      .createClient(token, refusals.fetch)
      .followRun(run.runId, {
        afterSequence: -1,
        signal: request.signal,
        onEvent: async (envelope) => {
          callerReader?.observe(envelope);
          if (envelope.sequence > observedSequence) {
            observedSequence = envelope.sequence;
            if (pendingCallerSequence !== undefined && envelope.sequence >= pendingCallerSequence)
              pendingCallerSequence = undefined;
            if (envelope.event.type === 'caller-tools-requested') {
              sawCanonicalCaller = true;
              pendingCallerSequence = envelope.event.nextEventSequence;
            }
            if (toolUseJournal.observe(envelope.event)) askedForBrowserTool = true;
          }
          if (
            messageKindForAgentEvent(envelope.event.type) === 'text' &&
            envelope.event.type === 'text-delta'
          ) {
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
    if (
      (sawCanonicalCaller ? pendingCallerSequence !== undefined : askedForBrowserTool) &&
      followed.run.state !== 'completed'
    ) {
      if (
        callerReader &&
        followed.run.state === 'awaiting_input' &&
        !followed.run.cancellationRequestedAt
      ) {
        const checkpoint = callerReader.read(run.runId);
        if (
          !callerReader.incomplete() &&
          checkpoint &&
          followed.lastSequence === checkpoint.next_event_sequence - 1 &&
          followed.run.lastEventSequence === followed.lastSequence
        )
          await resolvedDependencies.onCallerCheckpoint!(checkpoint);
      }
      return {
        status: 'error',
        code: 'protocol_error',
        message: RESUMED_RUN_BROWSER_STEP_MESSAGE,
      };
    }
    return { status: 'success' };
  } catch (error) {
    return errorResult(error, request.signal, undefined, refusals.last);
  }
}

export async function assertChromeManagedCallerRun(
  checkpoint: CallerToolContinuation,
  identity: Pick<CloudAgentRun, 'requestId' | 'conversationId'>,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
  signal?: AbortSignal,
): Promise<void> {
  checkpoint = structuredClone(checkpoint);
  identity = { ...identity };
  const { calls, ...cursor } = checkpoint;
  if (
    !ManagedCloudAgentRunRequestIdSchema.safeParse(identity.requestId).success ||
    !CallerToolResumeRequestSchema.safeParse({
      ...cursor,
      tool_results: calls.map((call) => ({ tool_call_id: call.id, content: '' })),
    }).success
  )
    throw new Error('The original browser checkpoint identity is invalid.');
  signal?.throwIfAborted();
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const token = await deps.getAuthToken();
  signal?.throwIfAborted();
  if (!token) throw new Error('Sign in to continue the original browser task.');
  const snapshot = await deps.createClient(token).getRun(checkpoint.run_id, {
    afterSequence: checkpoint.next_event_sequence - 1,
    limit: 1,
    signal,
  });
  signal?.throwIfAborted();
  const run = snapshot.run;
  if (
    run.id !== checkpoint.run_id ||
    run.requestId !== identity.requestId ||
    run.conversationId !== identity.conversationId ||
    run.originSurface !== 'chrome' ||
    run.state !== 'awaiting_input' ||
    run.cancellationRequestedAt ||
    run.lastEventSequence !== checkpoint.next_event_sequence - 1
  )
    throw new Error('The browser run stopped or its checkpoint changed. No action was repeated.');
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
  const confirmation = new AbortController();
  const timeoutError = new Error(
    'AGI Cloud did not confirm a stopped run before the cancellation deadline.',
  );
  const forwardAbort = (): void => confirmation.abort(signal?.reason);
  signal?.addEventListener('abort', forwardAbort, { once: true });
  if (signal?.aborted) forwardAbort();
  let rejectAborted!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = reject;
  });
  const onAbort = (): void => rejectAborted(confirmation.signal.reason);
  confirmation.signal.addEventListener('abort', onAbort, { once: true });
  if (confirmation.signal.aborted) onAbort();
  const timeout = setTimeout(
    () => confirmation.abort(timeoutError),
    MANAGED_RUN_CANCELLATION_CONFIRMATION_TIMEOUT_MS,
  );
  const refusals = captureCloudRefusals(resolvedDependencies.fetchImpl);
  try {
    const cancelAndConfirm = async (): Promise<ChromeManagedRunCancellationResult> => {
      confirmation.signal.throwIfAborted();
      const token = await resolvedDependencies.getAuthToken();
      confirmation.signal.throwIfAborted();
      if (!token) {
        return { status: 'error', code: 'auth_required', message: 'Sign in to cancel AGI Cloud.' };
      }
      const client = resolvedDependencies.createClient(token, refusals.fetch);
      const requested = await client.cancelRun(run.runId, { signal: confirmation.signal });
      confirmation.signal.throwIfAborted();
      if (requested.id !== run.runId)
        throw new Error('AGI Cloud returned a different cancellation run.');
      if (TERMINAL_AGENT_TASK_STATES.has(requested.state))
        return { status: 'success', run: requested };
      const followed = await client.followRun(run.runId, {
        signal: confirmation.signal,
        afterSequence: requested.lastEventSequence,
        pageSize: 1,
        onSnapshot: (snapshot) => {
          if (snapshot.run.id !== run.runId || snapshot.run.userId !== requested.userId)
            throw new Error('AGI Cloud changed the cancellation run or owner.');
        },
      });
      confirmation.signal.throwIfAborted();
      if (followed.run.id !== run.runId || followed.run.userId !== requested.userId)
        throw new Error('AGI Cloud changed the cancellation run or owner.');
      if (!TERMINAL_AGENT_TASK_STATES.has(followed.run.state))
        throw new Error('AGI Cloud acknowledged cancellation without confirming a stopped run.');
      return { status: 'success', run: followed.run };
    };
    return await Promise.race([cancelAndConfirm(), aborted]);
  } catch (error) {
    if (error === timeoutError)
      return { status: 'error', code: 'server_error', message: timeoutError.message };
    if (signal?.aborted) {
      return {
        status: 'error',
        code: 'server_error',
        message: UNCONFIRMED_CANCELLATION_MESSAGE,
      };
    }
    return errorResult(error, signal, undefined, refusals.last);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
    confirmation.signal.removeEventListener('abort', onAbort);
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
  const refusals = captureCloudRefusals(resolvedDependencies.fetchImpl);
  try {
    const followed = await resolvedDependencies
      .createClient(token, refusals.fetch)
      .followRun(value.runId, {
        afterSequence: value.lastSequence,
        ...(signal ? { signal } : {}),
      });
    if (TERMINAL_AGENT_TASK_STATES.has(followed.run.state)) {
      return { status: 'success', run: followed.run };
    }
    return {
      status: 'error',
      code: 'server_error',
      message: UNCONFIRMED_CANCELLATION_MESSAGE,
    };
  } catch (error) {
    if (signal?.aborted) {
      return {
        status: 'error',
        code: 'server_error',
        message: UNCONFIRMED_CANCELLATION_MESSAGE,
      };
    }
    return errorResult(error, signal, undefined, refusals.last);
  }
}

export type ChromeManagedRunListResult =
  { status: 'success'; runs: CloudAgentRun[] } | ChromeManagedRunControlError;

export async function listChromeManagedRuns(
  limit: number,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
  signal?: AbortSignal,
): Promise<ChromeManagedRunListResult> {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const token = await resolvedDependencies.getAuthToken();
  if (!token) {
    return { status: 'error', code: 'auth_required', message: 'Sign in to see your tasks.' };
  }
  const refusals = captureCloudRefusals(resolvedDependencies.fetchImpl);
  try {
    const page = await resolvedDependencies
      .createClient(token, refusals.fetch)
      .listRuns({ limit, ...(signal ? { signal } : {}) });
    return { status: 'success', runs: page.runs };
  } catch (error) {
    return errorResult(error, signal, 'Your tasks could not be loaded.', refusals.last);
  }
}
