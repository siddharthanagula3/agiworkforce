import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import type { JobHandlerContext } from '@/lib/jobs/job-drain';
import { PermanentJobError, enqueueJob } from '@/lib/jobs/job-service';
import { logger } from '@/lib/logger';
import { getIdentityProvider } from '@/lib/server/identity';

export type AdminAccountAction = 'suspend-user' | 'ban-user' | 'reactivate-user';

export type AdminAccountStatus = 'active' | 'suspended' | 'banned';

export type AccountProviderStepStatus =
  'not_required' | 'pending' | 'completed' | 'failed' | 'superseded';

export const ACCOUNT_PROVIDER_STEP_JOB_KIND = 'webhooks.identity-account-status';

const MAX_PROVIDER_ERROR_LENGTH = 500;

export interface RecordAdminAccountActionInput {
  userId: string;
  action: AdminAccountAction;
  accountStatus: AdminAccountStatus;
  providerSuspended: boolean | null;
  requestedByUserId: string;
}

export type AccountProviderStepOutcome = { ok: true } | { ok: false; error: unknown };

function providerErrorSummary(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, MAX_PROVIDER_ERROR_LENGTH);
}

export interface AdminAccountActionRef {
  actionId: string;
  userId: string;
}

export async function recordAdminAccountAction(
  db: DatabaseAdapter,
  input: RecordAdminAccountActionInput,
): Promise<AdminAccountActionRef | null> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        `update public.admin_account_actions
            set provider_status = 'superseded'
          where user_id = $1
            and provider_status in ('pending', 'failed')`,
        [input.userId],
      );
      const [row] = await tx.query<{ id: string }>(
        `insert into public.admin_account_actions (
           user_id, action, account_status, provider_suspended, provider_status,
           requested_by_user_id
         ) values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [
          input.userId,
          input.action,
          input.accountStatus,
          input.providerSuspended,
          input.providerSuspended === null ? 'not_required' : 'pending',
          input.requestedByUserId,
        ],
      );
      return row ? { actionId: row.id, userId: input.userId } : null;
    });
  } catch (error) {
    logger.error(
      { error, targetUserId: input.userId, action: input.action },
      'Could not record the account action; a failed sign-in provider step will not be retried automatically',
    );
    return null;
  }
}

async function writeProviderStepOutcome(
  db: DatabaseAdapter,
  step: AdminAccountActionRef,
  outcome: AccountProviderStepOutcome,
): Promise<void> {
  await db.execute(
    `update public.admin_account_actions
        set provider_status = $3::text,
            provider_attempts = provider_attempts + 1,
            provider_error = $4::text,
            provider_completed_at = case when $3::text = 'completed' then now() else null end
      where id = $1
        and user_id = $2
        and provider_status in ('pending', 'failed')`,
    [
      step.actionId,
      step.userId,
      outcome.ok ? 'completed' : 'failed',
      outcome.ok ? null : providerErrorSummary(outcome.error),
    ],
  );
}

export async function settleAccountProviderStep(
  db: DatabaseAdapter,
  step: AdminAccountActionRef,
  outcome: AccountProviderStepOutcome,
): Promise<void> {
  try {
    await writeProviderStepOutcome(db, step, outcome);
  } catch (error) {
    logger.error(
      { error, actionId: step.actionId, providerStatus: outcome.ok ? 'completed' : 'failed' },
      'Could not record the outcome of the sign-in provider step',
    );
  }
}

export async function queueAccountProviderStepRetry(
  db: DatabaseAdapter,
  step: AdminAccountActionRef,
): Promise<boolean> {
  const { actionId } = step;
  try {
    await enqueueJob(db, {
      kind: ACCOUNT_PROVIDER_STEP_JOB_KIND,
      payload: { actionId },
      idempotencyKey: `account-provider-step:${actionId}`,
    });
    return true;
  } catch (error) {
    logger.error(
      { error, actionId },
      'Could not queue a retry of the sign-in provider step; the operator has to resubmit',
    );
    return false;
  }
}

interface ProviderStepRow {
  id: string;
  user_id: string;
  account_status: AdminAccountStatus;
  provider_suspended: boolean | null;
  provider_status: AccountProviderStepStatus;
  current_account_status: string | null;
  replaced: boolean;
}

export async function retryAccountProviderStep(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const actionId = context.job.payload['actionId'];
  if (typeof actionId !== 'string' || !actionId.trim()) {
    throw new PermanentJobError('Account provider step job names no action');
  }
  const [action] = await context.db.query<ProviderStepRow>(
    `select step.id,
            step.user_id,
            step.account_status,
            step.provider_suspended,
            step.provider_status,
            profile.account_status as current_account_status,
            exists (
              select 1
                from public.admin_account_actions later
               where later.user_id = step.user_id
                 and later.created_at > step.created_at
            ) as replaced
       from public.admin_account_actions step
       left join public.profiles profile on profile.id = step.user_id
      where step.id = $1`,
    [actionId],
  );
  if (!action) return { actionId, skipped: 'the account action no longer exists' };
  if (action.provider_status !== 'pending' && action.provider_status !== 'failed') {
    return { actionId, skipped: `the provider step is ${action.provider_status}` };
  }
  if (action.provider_suspended === null) {
    throw new PermanentJobError('The account action has no sign-in provider step');
  }
  if (action.replaced || action.current_account_status !== action.account_status) {
    await context.db.execute(
      `update public.admin_account_actions
          set provider_status = 'superseded'
        where id = $1
          and user_id = $2
          and provider_status in ('pending', 'failed')`,
      [action.id, action.user_id],
    );
    return { actionId, skipped: 'a later change to the account replaced this action' };
  }

  const step = { actionId: action.id, userId: action.user_id };
  try {
    await getIdentityProvider().setUserSuspended(action.user_id, action.provider_suspended);
  } catch (error) {
    await writeProviderStepOutcome(context.db, step, { ok: false, error });
    throw new Error('The sign-in provider did not take the account status change');
  }
  await writeProviderStepOutcome(context.db, step, { ok: true });
  return { actionId, providerStatus: 'completed' };
}
