import {
  AgentTaskStateSchema,
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
import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';
import { chatBrowserToolDefinitions } from '../computer-use/chatBrowserTools';
import { createToolUseJournal } from '../computer-use/toolHandoff';

const UNCONFIRMED_CANCELLATION_MESSAGE =
  'Cancellation has not been confirmed. The run may still be working.';
const MAX_VISIBLE_TEXT_CHARACTERS = 512_000;
export const MANAGED_RUN_CANCELLATION_TIMEOUT_MS = 15_000;
export const ALL_MANAGED_RUN_STATES = AgentTaskStateSchema.options;
export const MANAGED_RUN_CANCELLATION_CONFIRMATION_TIMEOUT_MS = 15_000;

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

  const toolUseJournal = createToolUseJournal(chatBrowserToolDefinitions('act', true));
  let askedForBrowserTool = false;

  try {
    const followed = await resolvedDependencies.createClient(token).followRun(run.runId, {
      afterSequence: -1,
      signal: request.signal,
      onEvent: async (envelope) => {
        if (toolUseJournal.observe(envelope.event)) askedForBrowserTool = true;
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
    if (askedForBrowserTool) {
      return {
        status: 'error',
        code: 'server_error',
        message: 'This resumed AGI Cloud run asked for a browser tool. Send the request again.',
      };
    }
    return { status: 'success' };
  } catch (error) {
    return errorResult(error, request.signal);
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
  try {
    const cancelAndConfirm = async (): Promise<ChromeManagedRunCancellationResult> => {
      confirmation.signal.throwIfAborted();
      const token = await resolvedDependencies.getAuthToken();
      confirmation.signal.throwIfAborted();
      if (!token) {
        return { status: 'error', code: 'auth_required', message: 'Sign in to cancel AGI Cloud.' };
      }
      const client = resolvedDependencies.createClient(token);
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
    return errorResult(error, signal);
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
    return errorResult(error, signal);
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
  try {
    const page = await resolvedDependencies
      .createClient(token)
      .listRuns({ limit, ...(signal ? { signal } : {}) });
    return { status: 'success', runs: page.runs };
  } catch (error) {
    return errorResult(error, signal, 'Your tasks could not be loaded.');
  }
}
