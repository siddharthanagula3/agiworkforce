import {
  ManagedCloudAgentRunReferenceSchema,
  createManagedCloudAgentRunClient,
  reconcileManagedCloudPublicText,
  type CloudAgentRun,
  type ManagedCloudAgentRunClient,
  type ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';

const MAX_VISIBLE_TEXT_CHARACTERS = 512_000;

export interface ChromeManagedRunDependencies {
  getAuthToken: typeof getAuthToken;
  createClient: (token: string) => ManagedCloudAgentRunClient;
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
  | { status: 'success'; run: CloudAgentRun }
  | ChromeManagedRunControlError;

function createDefaultClient(token: string): ManagedCloudAgentRunClient {
  return createManagedCloudAgentRunClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getAuthToken: async () => token,
    decorateMutationHeaders: (headers) => ({
      ...headers,
      'X-Requested-With': 'XMLHttpRequest',
      'X-AGI-Surface': 'chrome',
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

function errorResult(error: unknown, signal?: AbortSignal): ChromeManagedRunControlError {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return { status: 'error', code: 'cancelled', message: 'Cancelled.' };
  }
  return {
    status: 'error',
    code: 'server_error',
    message: error instanceof Error ? error.message : 'The AGI Cloud run could not be resumed.',
  };
}

/**
 * Rejoin a server-owned Chrome run without resubmitting the user's prompt.
 * Replay starts at the beginning so public text already rendered before a
 * service-worker/browser restart can be reconciled across arbitrary chunks.
 */
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

/** Request cancellation from the durable server run as well as the local reader. */
export async function cancelChromeManagedRun(
  value: ManagedCloudAgentRunReference,
  dependencies: Partial<ChromeManagedRunDependencies> = {},
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
      run: await resolvedDependencies.createClient(token).cancelRun(run.runId, {}),
    };
  } catch (error) {
    return errorResult(error);
  }
}
