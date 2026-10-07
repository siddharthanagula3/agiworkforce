import {
  FREE_QUOTA_DAILY_LIMIT_CODE,
  FREE_QUOTA_EXHAUSTED_CODE,
  FREE_QUOTA_EXPIRED_CODE,
  type FreeQuotaMediaCategory,
} from '@agiworkforce/cloud-contracts';

export type FreeQuotaFailure =
  | 'exhausted'
  | 'expired'
  | 'unavailable'
  | 'busy'
  | 'interrupted'
  | 'too_long'
  | 'provider_failed'
  | 'blocked'
  | 'plan'
  | 'unsupported_prompt'
  | 'duplicate'
  | 'workspace_restricted'
  | 'daily_limit';

export interface FreeQuotaDailyLimit {
  category: FreeQuotaMediaCategory;
  cap: number;
  resetsAtMs: number;
}

export interface FreeQuotaFailureContext {
  issuer: string;
  modelName: string;
  alternativeName: string | null;
  expiresOn: string | null;
  dailyLimit?: FreeQuotaDailyLimit;
}

export interface FreeQuotaFailureBody {
  status: number;
  code: string;
  message: string;
}

const FAILURE_STATUS: Readonly<Record<FreeQuotaFailure, number>> = {
  exhausted: 409,
  expired: 410,
  unavailable: 503,
  busy: 429,
  interrupted: 502,
  too_long: 400,
  provider_failed: 502,
  blocked: 422,
  plan: 403,
  unsupported_prompt: 400,
  duplicate: 409,
  workspace_restricted: 403,
  daily_limit: 429,
};

export const FREE_QUOTA_FAILURE_CODES: Readonly<Record<FreeQuotaFailure, string>> = {
  exhausted: FREE_QUOTA_EXHAUSTED_CODE,
  expired: FREE_QUOTA_EXPIRED_CODE,
  unavailable: 'free_quota_unavailable',
  busy: 'provider_rate_limited',
  interrupted: 'stream_interrupted',
  too_long: 'context_length_exceeded',
  provider_failed: 'provider_unreachable',
  blocked: 'content_filter',
  plan: 'model_not_available',
  unsupported_prompt: 'free_quota_prompt_unsupported',
  duplicate: 'free_quota_duplicate',
  workspace_restricted: 'organization_policy',
  daily_limit: FREE_QUOTA_DAILY_LIMIT_CODE,
};

const UTC_CLOCK_START = 11;
const UTC_CLOCK_END = 16;

function dailyLimitMessage(context: FreeQuotaFailureContext): string {
  const { issuer, modelName, dailyLimit } = context;
  if (!dailyLimit) {
    return `You have used today's free requests for ${modelName}, each account's daily share of ${issuer}'s free capacity. Try again tomorrow, or upgrade to a plan that includes it.`;
  }
  const { category, cap, resetsAtMs } = dailyLimit;
  const used =
    cap === 1 ? `today's free ${category} request` : `today's ${cap} free ${category} requests`;
  const resetsAt = new Date(resetsAtMs).toISOString().slice(UTC_CLOCK_START, UTC_CLOCK_END);
  return `You have used ${used}. That is each account's daily share of ${issuer}'s free capacity, and it resets at ${resetsAt} UTC. Plans that include ${category} generation are not held to this limit.`;
}

function nextStep(context: FreeQuotaFailureContext): string {
  return context.alternativeName
    ? `Choose ${context.alternativeName} or another free model, then send your message again.`
    : 'Choose another free model, then send your message again.';
}

function failureMessage(failure: FreeQuotaFailure, context: FreeQuotaFailureContext): string {
  const { issuer, modelName } = context;
  switch (failure) {
    case 'exhausted':
      return `${modelName} has reached its free limit. Its free allowance from ${issuer} is shared by everyone and does not renew, so this is not a limit on your account. ${nextStep(context)}`;
    case 'expired':
      return `The free offer for ${modelName} from ${issuer} ${
        context.expiresOn ? `ended on ${context.expiresOn}` : 'has ended'
      }. ${nextStep(context)}`;
    case 'unavailable':
      return `${modelName} from ${issuer} is not available right now. ${nextStep(context)}`;
    case 'busy':
      return `${issuer} is receiving too many requests for ${modelName} right now. Wait a moment and send again, or choose another free model.`;
    case 'interrupted':
      return `The reply from ${issuer} stopped before it finished and was not sent again automatically. Send your message again, or choose another free model.`;
    case 'too_long':
      return `This conversation is too long for ${modelName}. Start a new chat, or choose another free model.`;
    case 'provider_failed':
      return `${issuer} could not answer with ${modelName} just now, and no other model was used. Send your message again, or choose another free model.`;
    case 'blocked':
      return `${issuer}'s safety system stopped ${modelName} from answering this message. Rephrase it, or choose another free model.`;
    case 'plan':
      return `${issuer} free models are part of the Free plan. Choose a model your plan includes.`;
    case 'unsupported_prompt':
      return `${issuer} free models answer text prompts in Chat. Turn off tools and remove attachments, then send again.`;
    case 'duplicate':
      return `This message was already sent to ${issuer}, so it was not sent a second time.`;
    case 'workspace_restricted':
      return `${issuer} free models do not meet your workspace's data region or retention policy. Choose another model.`;
    case 'daily_limit':
      return dailyLimitMessage(context);
  }
}

export function freeQuotaFailure(
  failure: FreeQuotaFailure,
  context: FreeQuotaFailureContext,
): FreeQuotaFailureBody {
  return {
    status: FAILURE_STATUS[failure],
    code: FREE_QUOTA_FAILURE_CODES[failure],
    message: failureMessage(failure, context),
  };
}
