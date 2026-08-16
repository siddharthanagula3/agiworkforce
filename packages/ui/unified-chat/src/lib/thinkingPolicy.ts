
import {
  getModelEffortOptions,
  getModelMetadataById,
  getModelReasoning,
  resolveModelEffort,
  type Effort,
  type ModelReasoning,
} from '@agiworkforce/types';

const EFFORT_ORDER: readonly Effort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

function effortExceeds(effort: Effort | undefined, maximum: Effort | undefined): boolean {
  if (!effort || !maximum) return false;
  return EFFORT_ORDER.indexOf(effort) > EFFORT_ORDER.indexOf(maximum);
}

export function isAlwaysOnReasoningModel(reasoning: ModelReasoning): boolean {
  return (
    reasoning.control === 'always_on' ||
    (reasoning.capable && reasoning.canDisableThinking === false)
  );
}

export function showsThinkingSwitch(reasoning: ModelReasoning): boolean {
  if (reasoning.control === 'none' || reasoning.control === 'always_on') return false;
  if (
    reasoning.control === 'effort_levels' &&
    (reasoning.supportedEfforts ?? []).includes('none')
  ) {
    return false;
  }
  return reasoning.canDisableThinking ?? true;
}

export interface ThinkingSendPolicy {
  thinkingEnabled: boolean | undefined;
  effort: Effort | undefined;
  alwaysOn: boolean;
  showsSwitch: boolean;
  effortClamped: boolean;
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
    };
  }

  const reasoning = getModelReasoning(params.modelId);
  const alwaysOn = isAlwaysOnReasoningModel(reasoning);
  const declaresThinking =
    metadata.capabilities.thinking !== false && (reasoning.capable || reasoning.control !== 'none');

  const thinkingEnabled = !declaresThinking
    ? undefined
    : alwaysOn
      ? true
      : params.requestedThinking;

  const effortOptions = getModelEffortOptions(params.modelId);
  const resolvedEffort = resolveModelEffort(params.modelId, params.requestedEffort);
  const sendsEffortWithoutThinking = reasoning.control === 'effort_levels';

  let effort: Effort | undefined;
  let effortClamped = false;
  if (effortOptions.length === 0 || !resolvedEffort) {
    effort = undefined;
  } else if (thinkingEnabled === false) {
    if (!sendsEffortWithoutThinking) {
      effort = undefined;
    } else if (effortExceeds(resolvedEffort, reasoning.maxEffortWhenThinkingDisabled)) {
      effort = reasoning.maxEffortWhenThinkingDisabled;
      effortClamped = true;
    } else {
      effort = resolvedEffort;
    }
  } else if (thinkingEnabled === undefined && !sendsEffortWithoutThinking) {
    effort = undefined;
  } else {
    effort = resolvedEffort;
  }

  return {
    thinkingEnabled,
    effort,
    alwaysOn,
    showsSwitch: showsThinkingSwitch(reasoning),
    effortClamped,
  };
}
