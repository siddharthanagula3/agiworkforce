import { getClerkInstance } from '@clerk/expo';
import { api, apiFetch } from '@/services/api';
import { ApiHttpError, parseJsonBody } from '@/services/apiErrors';
import { CLERK_PUBLISHABLE_KEY } from '@/src/integrations/clerk';

export const STEP_UP_TOKEN_HEADER = 'x-step-up-token';

const STEP_UP_ENDPOINT = '/api/auth/step-up';
const STEP_UP_REQUIRED = 'STEP_UP_REQUIRED';
const STEP_UP_VERIFICATION_REQUIRED = 'STEP_UP_VERIFICATION_REQUIRED';
const STEP_UP_LEVELS = ['second_factor', 'first_factor'] as const;

export type StepUpLevel = (typeof STEP_UP_LEVELS)[number];

export type StepUpAction =
  | 'account.delete'
  | 'organization.transfer_ownership'
  | 'password.change'
  | 'session.revoke_all'
  | 'two_factor.enable'
  | 'two_factor.disable'
  | 'two_factor.regenerate_backup_codes';

export type StepUpGrant =
  | { kind: 'granted'; token: string }
  | { kind: 'verify'; level: StepUpLevel }
  | { kind: 'failed'; message: string };

export interface StepUpChallenge {
  action: StepUpAction;
  resourceId: string | null;
  consequence: string;
  level: StepUpLevel;
}

export class StepUpCancelledError extends Error {
  constructor() {
    super('Confirmation cancelled.');
    this.name = 'StepUpCancelledError';
  }
}

export function isStepUpCancelled(error: unknown): boolean {
  return error instanceof StepUpCancelledError;
}

export function isStepUpRequired(error: unknown): boolean {
  return error instanceof ApiHttpError && error.status === 403 && error.code === STEP_UP_REQUIRED;
}

function isStepUpLevel(value: unknown): value is StepUpLevel {
  return (STEP_UP_LEVELS as readonly unknown[]).includes(value);
}

export async function requestStepUpGrant(
  action: StepUpAction,
  resourceId: string | null,
  sessionToken: string,
): Promise<StepUpGrant> {
  const response = await apiFetch(
    STEP_UP_ENDPOINT,
    {
      method: 'POST',
      body: JSON.stringify({ action, ...(resourceId ? { resourceId } : {}) }),
    },
    { headers: { Authorization: `Bearer ${sessionToken}` } },
  );
  const body = parseJsonBody(await response.text());
  if (response.ok && typeof body?.['token'] === 'string') {
    return { kind: 'granted', token: body['token'] };
  }
  const error = body?.['error'] as
    { code?: unknown; message?: unknown; details?: { level?: unknown } } | undefined;
  if (error?.code === STEP_UP_VERIFICATION_REQUIRED && isStepUpLevel(error.details?.level)) {
    return { kind: 'verify', level: error.details.level };
  }
  return {
    kind: 'failed',
    message:
      typeof error?.message === 'string' && error.message.trim()
        ? error.message
        : 'Your identity could not be confirmed. Try again.',
  };
}

export async function currentSessionToken(): Promise<string | null> {
  const session = getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY }).session;
  return (await session?.getToken()) ?? null;
}

export async function readStepUpConsequence(action: StepUpAction): Promise<string> {
  const readiness = await api.get<{ actions?: Record<string, { consequence?: unknown }> }>(
    STEP_UP_ENDPOINT,
  );
  const consequence = readiness.actions?.[action]?.consequence;
  return typeof consequence === 'string' ? consequence : 'Confirm it is you to continue.';
}
