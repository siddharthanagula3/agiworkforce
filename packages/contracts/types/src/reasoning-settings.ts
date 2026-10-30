import { getModelMetadataById, getModelReasoning, type ModelReasoning } from './model-catalog';
import type { Effort } from './design-system/effort';

const EFFORT_ORDER: readonly Effort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export function isAlwaysOnReasoningModel(reasoning: ModelReasoning): boolean {
  return (
    reasoning.capable &&
    (reasoning.control === 'always_on' || reasoning.canDisableThinking === false)
  );
}

export function showsThinkingSwitch(reasoning: ModelReasoning): boolean {
  if (!reasoning.capable || reasoning.control === 'none' || isAlwaysOnReasoningModel(reasoning)) {
    return false;
  }
  return !(reasoning.control === 'effort_levels' && reasoning.supportedEfforts?.includes('none'));
}

export interface ThinkingSendPolicy {
  thinkingEnabled: boolean | undefined;
  effort: Effort | undefined;
  alwaysOn: boolean;
  showsSwitch: boolean;
  effortClamped: boolean;
  offUnsupported: boolean;
}

export function resolveReasoningSettings(params: {
  reasoning: ModelReasoning;
  requestedThinking: boolean | undefined;
  requestedEffort?: string | undefined;
}): ThinkingSendPolicy {
  const { reasoning, requestedThinking, requestedEffort } = params;
  const alwaysOn = isAlwaysOnReasoningModel(reasoning);
  const capable = reasoning.capable && reasoning.control !== 'none';
  const supportsEffort = Boolean(
    reasoning.request?.effortPath || reasoning.request?.responsesEffortPath,
  );
  const options = supportsEffort ? (reasoning.supportedEfforts ?? []) : [];
  const supportedRequest = options.find((effort) => effort === requestedEffort);
  const defaultEffort = options.find((effort) => effort === reasoning.defaultEffort) ?? options[0];
  const lowestEffort = EFFORT_ORDER.find((effort) => options.includes(effort));
  const offRequested = requestedThinking === false || requestedEffort === 'none';
  let thinkingEnabled = capable ? (alwaysOn ? true : requestedThinking) : undefined;
  let effort = capable ? (supportedRequest ?? defaultEffort) : undefined;

  if (capable && offRequested) {
    if (alwaysOn) {
      effort = lowestEffort;
    } else if (options.includes('none')) {
      thinkingEnabled = false;
      effort = 'none';
    } else if (reasoning.control !== 'effort_levels') {
      effort = undefined;
    } else if (
      effort &&
      reasoning.maxEffortWhenThinkingDisabled &&
      EFFORT_ORDER.indexOf(effort) > EFFORT_ORDER.indexOf(reasoning.maxEffortWhenThinkingDisabled)
    ) {
      effort = reasoning.maxEffortWhenThinkingDisabled;
    }
  } else if (thinkingEnabled === undefined && reasoning.control !== 'effort_levels') {
    effort = undefined;
  }

  return {
    thinkingEnabled,
    effort,
    alwaysOn,
    showsSwitch: showsThinkingSwitch(reasoning),
    effortClamped: supportedRequest !== undefined && effort !== supportedRequest,
    offUnsupported: capable && alwaysOn && offRequested,
  };
}

export function resolveThinkingSendPolicy(params: {
  modelId: string | null | undefined;
  requestedThinking: boolean | undefined;
  requestedEffort?: string | undefined;
}): ThinkingSendPolicy {
  const metadata = getModelMetadataById(params.modelId);
  if (!metadata) {
    return {
      thinkingEnabled: params.requestedThinking,
      effort: params.requestedEffort as Effort | undefined,
      alwaysOn: false,
      showsSwitch: false,
      effortClamped: false,
      offUnsupported: false,
    };
  }
  return resolveReasoningSettings({
    reasoning:
      metadata.capabilities.thinking === false
        ? { capable: false, control: 'none' }
        : getModelReasoning(params.modelId),
    requestedThinking: params.requestedThinking,
    requestedEffort: params.requestedEffort,
  });
}
