export type FreeQuotaFailure =
  | 'exhausted'
  | 'expired'
  | 'unavailable'
  | 'busy'
  | 'interrupted'
  | 'too_long'
  | 'provider_failed'
  | 'plan'
  | 'unsupported_prompt'
  | 'duplicate'
  | 'workspace_restricted';

export interface FreeQuotaFailureContext {
  issuer: string;
  modelName: string;
  alternativeName: string | null;
  expiresOn: string | null;
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
  plan: 403,
  unsupported_prompt: 400,
  duplicate: 409,
  workspace_restricted: 403,
};

export const FREE_QUOTA_FAILURE_CODES: Readonly<Record<FreeQuotaFailure, string>> = {
  exhausted: 'free_quota_exhausted',
  expired: 'free_quota_expired',
  unavailable: 'free_quota_unavailable',
  busy: 'provider_rate_limited',
  interrupted: 'stream_interrupted',
  too_long: 'context_length_exceeded',
  provider_failed: 'provider_unreachable',
  plan: 'model_not_available',
  unsupported_prompt: 'free_quota_prompt_unsupported',
  duplicate: 'free_quota_duplicate',
  workspace_restricted: 'organization_policy',
};

function nextStep(context: FreeQuotaFailureContext): string {
  return context.alternativeName
    ? `Choose ${context.alternativeName} or another free model, then send your message again.`
    : 'Choose another free model, then send your message again.';
}

function failureMessage(failure: FreeQuotaFailure, context: FreeQuotaFailureContext): string {
  const { issuer, modelName } = context;
  switch (failure) {
    case 'exhausted':
      return `${issuer}'s free allowance for ${modelName} is used up. It is the provider's allowance for this model, not a limit on your account, and it does not renew. ${nextStep(context)}`;
    case 'expired':
      return `${issuer}'s free allowance for ${modelName} ${
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
    case 'plan':
      return `${issuer} free models are part of the Free plan. Choose a model your plan includes.`;
    case 'unsupported_prompt':
      return `${issuer} free models answer text prompts in Chat. Turn off tools and remove attachments, then send again.`;
    case 'duplicate':
      return `This message was already sent to ${issuer}, so it was not sent a second time.`;
    case 'workspace_restricted':
      return `${issuer} free models do not meet your workspace's data region or retention policy. Choose another model.`;
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
