import {
  FREE_QUOTA_CHAT_DAILY_USE_KIND,
  FREE_QUOTA_DAILY_LIMIT_CODE,
  FREE_QUOTA_EXHAUSTED_CODE,
  FREE_QUOTA_EXPIRED_CODE,
  type FreeQuotaDailyUseKind,
} from '@agiworkforce/cloud-contracts';
import { CHINESE_HQ_PROVIDER_NOT_OPTED_IN_CODE } from '@agiworkforce/compliance';

export type FreeQuotaFailure =
  | 'exhausted'
  | 'expired'
  | 'unavailable'
  | 'busy'
  | 'interrupted'
  | 'too_long'
  | 'share_too_long'
  | 'provider_failed'
  | 'blocked'
  | 'plan'
  | 'unsupported_prompt'
  | 'duplicate'
  | 'workspace_restricted'
  | 'daily_limit'
  | 'provider_consent';

export interface FreeQuotaDailyLimit {
  category: FreeQuotaDailyUseKind;
  cap: number;
  resetsAtMs: number;
}

export interface FreeQuotaFailureContext {
  issuer: string;
  modelName: string;
  alternativeName: string | null;
  expiresOn: string | null;
  dailyLimit?: FreeQuotaDailyLimit;
  providerName?: string;
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
  share_too_long: 400,
  provider_failed: 502,
  blocked: 422,
  plan: 403,
  unsupported_prompt: 400,
  duplicate: 409,
  workspace_restricted: 403,
  daily_limit: 429,
  provider_consent: 403,
};

export const FREE_QUOTA_FAILURE_CODES: Readonly<Record<FreeQuotaFailure, string>> = {
  exhausted: FREE_QUOTA_EXHAUSTED_CODE,
  expired: FREE_QUOTA_EXPIRED_CODE,
  unavailable: 'free_quota_unavailable',
  busy: 'provider_rate_limited',
  interrupted: 'stream_interrupted',
  too_long: 'context_length_exceeded',
  share_too_long: 'context_length_exceeded',
  provider_failed: 'provider_unreachable',
  blocked: 'content_filter',
  plan: 'model_not_available',
  unsupported_prompt: 'free_quota_prompt_unsupported',
  duplicate: 'free_quota_duplicate',
  workspace_restricted: 'organization_policy',
  daily_limit: FREE_QUOTA_DAILY_LIMIT_CODE,
  provider_consent: CHINESE_HQ_PROVIDER_NOT_OPTED_IN_CODE,
};

const UTC_CLOCK_START = 11;
const UTC_CLOCK_END = 16;

function dailyLimitMessage(context: FreeQuotaFailureContext): string {
  const { issuer, modelName, dailyLimit } = context;
  if (!dailyLimit) {
    return `You have used today's free requests for ${modelName}, each account's daily share of ${issuer}'s free capacity. Try again tomorrow, or upgrade to a plan that includes it.`;
  }
  const { category, cap, resetsAtMs } = dailyLimit;
  const resetsAt = new Date(resetsAtMs).toISOString().slice(UTC_CLOCK_START, UTC_CLOCK_END);
  if (category === FREE_QUOTA_CHAT_DAILY_USE_KIND) {
    const instead = context.alternativeName
      ? ` Choose ${context.alternativeName} to keep chatting now.`
      : '';
    return `Today's free chat share does not have enough left for this message. Each account has ${cap.toLocaleString('en-US')} tokens a day across every free chat model from ${issuer}, and each message counts the whole conversation so far plus room for the reply. The share resets at ${resetsAt} UTC.${instead}`;
  }
  const used =
    cap === 1 ? `today's free ${category} request` : `today's ${cap} free ${category} requests`;
  return `You have used ${used}. That is each account's daily share of ${issuer}'s free capacity, and it resets at ${resetsAt} UTC. Plans that include ${category} generation are not held to this limit.`;
}

function shareTooLongMessage(context: FreeQuotaFailureContext): string {
  const { issuer, dailyLimit } = context;
  const share = dailyLimit
    ? `${dailyLimit.cap.toLocaleString('en-US')} tokens a day for each account`
    : 'a daily share for each account';
  const instead = context.alternativeName
    ? `Start a new chat, or choose ${context.alternativeName} to continue this one.`
    : 'Start a new chat to keep using a free chat model.';
  return `This conversation is now larger than the free chat share: ${share}, across every free chat model from ${issuer}, and each message counts the whole conversation so far. Waiting for the share to reset will not help. ${instead}`;
}

function providerConsentMessage(context: FreeQuotaFailureContext): string {
  const provider = context.providerName ?? context.issuer;
  const instead = context.alternativeName ? `, or choose ${context.alternativeName}` : '';
  return `${provider} runs ${context.modelName}. Read and accept its notice to use this free model${instead}. No model request was sent.`;
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
    case 'share_too_long':
      return shareTooLongMessage(context);
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
    case 'provider_consent':
      return providerConsentMessage(context);
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
