import 'server-only';

import {
  getHarnessRequestParameters,
  getModelMetadataById,
  type ChatRequest,
  type RequestParameter,
} from '@agiworkforce/types';

export interface RequestedParameters {
  top_p?: number;
  stop?: string[];
  seed?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
}

interface RequestedParameterSource {
  top_p?: number | undefined;
  stop?: string | string[] | undefined;
  seed?: number | undefined;
  frequency_penalty?: number | undefined;
  presence_penalty?: number | undefined;
  logit_bias?: Record<string, number> | undefined;
  user?: string | undefined;
}

export function requestedParameters(source: RequestedParameterSource): RequestedParameters {
  const stop = typeof source.stop === 'string' ? [source.stop] : source.stop;
  return {
    ...(source.top_p !== undefined ? { top_p: source.top_p } : {}),
    ...(stop && stop.length > 0 ? { stop } : {}),
    ...(source.seed !== undefined ? { seed: source.seed } : {}),
    ...(source.frequency_penalty !== undefined
      ? { frequency_penalty: source.frequency_penalty }
      : {}),
    ...(source.presence_penalty !== undefined ? { presence_penalty: source.presence_penalty } : {}),
    ...(source.logit_bias && Object.keys(source.logit_bias).length > 0
      ? { logit_bias: source.logit_bias }
      : {}),
    ...(source.user ? { user: source.user } : {}),
  };
}

function supportedRequestParameters(modelId: string, harnessId: string): Set<RequestParameter> {
  const reasoning = getModelMetadataById(modelId)?.reasoning;
  const rejected = new Set<RequestParameter>(reasoning?.unsupportedRequestParameters ?? []);
  if (reasoning?.rejectsSamplingParameters) rejected.add('top_p');
  return new Set(
    getHarnessRequestParameters(harnessId).filter((parameter) => !rejected.has(parameter)),
  );
}

export function acceptedRequestParameters(modelId: string, harnessId: string): RequestParameter[] {
  return [...supportedRequestParameters(modelId, harnessId)];
}

export function unsupportedRequestParameter(
  requested: RequestedParameters,
  modelId: string,
  harnessId: string,
): RequestParameter | null {
  const supported = supportedRequestParameters(modelId, harnessId);
  return (
    (Object.keys(requested) as RequestParameter[]).find((parameter) => !supported.has(parameter)) ??
    null
  );
}

export function applyRequestParameters(
  chatRequest: ChatRequest,
  requested: RequestedParameters | undefined,
  modelId: string,
  harnessId: string | undefined,
): void {
  if (!requested || !harnessId) return;
  const supported = supportedRequestParameters(modelId, harnessId);
  if (requested.top_p !== undefined && supported.has('top_p')) chatRequest.topP = requested.top_p;
  if (requested.stop && supported.has('stop')) chatRequest.stopSequences = requested.stop;
  if (requested.seed !== undefined && supported.has('seed')) chatRequest.seed = requested.seed;
  if (requested.frequency_penalty !== undefined && supported.has('frequency_penalty')) {
    chatRequest.frequencyPenalty = requested.frequency_penalty;
  }
  if (requested.presence_penalty !== undefined && supported.has('presence_penalty')) {
    chatRequest.presencePenalty = requested.presence_penalty;
  }
  if (requested.logit_bias && supported.has('logit_bias')) {
    chatRequest.logitBias = requested.logit_bias;
  }
  if (requested.user && supported.has('user')) chatRequest.endUserId = requested.user;
}
