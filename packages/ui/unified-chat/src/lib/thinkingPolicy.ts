/**
 * Thinking / reasoning-effort send policy.
 *
 * The Managed Cloud completions route REJECTS an incoherent thinking request
 * with a 422 `invalid_thinking_configuration` before any provider work happens
 * (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`
 * `buildThinkingConfig`):
 *   - `thinking_mode: false` on a model whose catalog entry says
 *     `reasoning.canDisableThinking === false` → "Thinking cannot be disabled
 *     for <model>."
 *   - `thinking_mode: false` plus an `effort` above
 *     `reasoning.maxEffortWhenThinkingDisabled` → "effort must be <max> or
 *     lower."
 *
 * Desktop Cloud used to serialise a hardcoded `thinking_mode: false` on every
 * request, so an ordinary turn on an always-on reasoning model failed outright.
 * This module is the single clamp both the composer control and the send path
 * read, mirroring web's `useChatStream` capability clamp + `ComposerFooter`
 * switch semantics. Values come only from the catalog
 * (`packages/contracts/types/src/models.json`); nothing here invents a model id
 * or an effort level.
 */

import {
  getModelEffortOptions,
  getModelMetadataById,
  getModelReasoning,
  resolveModelEffort,
  type Effort,
  type ModelReasoning,
} from '@agiworkforce/types';

/**
 * Provider effort ladder, low → high. Mirrors `EFFORT_ORDER` in the server's
 * request-processor; the clamp has to agree with the comparison that produces
 * the 422 or it is not a clamp.
 */
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

/**
 * True when the model cannot turn extended thinking off. The composer renders a
 * static "Always on" badge instead of a switch, and the send path forces
 * `thinking_mode: true`.
 */
export function isAlwaysOnReasoningModel(reasoning: ModelReasoning): boolean {
  return (
    reasoning.control === 'always_on' ||
    (reasoning.capable && reasoning.canDisableThinking === false)
  );
}

/**
 * Whether the composer should render a separate on/off thinking switch.
 * Ported verbatim from `apps/web/features/chat/components/Composer/
 * ComposerFooter.tsx` so the two composers agree about which models even have
 * a user-facing switch.
 */
export function showsThinkingSwitch(reasoning: ModelReasoning): boolean {
  if (reasoning.control === 'none' || reasoning.control === 'always_on') return false;
  // effort_levels with a `none` mark encodes off in the slider itself.
  if (
    reasoning.control === 'effort_levels' &&
    (reasoning.supportedEfforts ?? []).includes('none')
  ) {
    return false;
  }
  return reasoning.canDisableThinking ?? true;
}

export interface ThinkingSendPolicy {
  /**
   * Value for the wire's `thinking_mode`. `undefined` means OMIT the field —
   * the model declares no thinking contract, so sending either boolean would
   * be a claim the catalog does not support.
   */
  thinkingEnabled: boolean | undefined;
  /** Value for the wire's `effort`. `undefined` means omit. */
  effort: Effort | undefined;
  /** The model cannot disable thinking; the request was forced on. */
  alwaysOn: boolean;
  /** The composer should render an on/off switch for this model. */
  showsSwitch: boolean;
  /** The requested effort was lowered to satisfy `maxEffortWhenThinkingDisabled`. */
  effortClamped: boolean;
}

/**
 * Clamp a composer's requested thinking/effort pair against the selected
 * model's catalog reasoning contract.
 *
 * Unknown model ids (dynamic BYOK/OpenRouter catalogs, which can never appear
 * in the static registry) preserve the caller's request untouched — the
 * privileged runtime validates those itself, exactly as web's send path does.
 */
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
  // A model with no reasoning contract at all (`capable: false` + `control:
  // 'none'`) or an explicit `capabilities.thinking === false` gets NO
  // `thinking_mode` on the wire.
  const declaresThinking =
    metadata.capabilities.thinking !== false && (reasoning.capable || reasoning.control !== 'none');

  const thinkingEnabled = !declaresThinking
    ? undefined
    : alwaysOn
      ? true
      : params.requestedThinking;

  const effortOptions = getModelEffortOptions(params.modelId);
  const resolvedEffort = resolveModelEffort(params.modelId, params.requestedEffort);
  // `effort_levels` models carry the reasoning dial itself, so their effort is
  // still meaningful with thinking off; every other control sends effort only
  // alongside thinking (web's `sendsEffortWithoutThinking`).
  const sendsEffortWithoutThinking = reasoning.control === 'effort_levels';

  let effort: Effort | undefined;
  let effortClamped = false;
  if (effortOptions.length === 0 || !resolvedEffort) {
    effort = undefined;
  } else if (thinkingEnabled === false) {
    if (!sendsEffortWithoutThinking) {
      effort = undefined;
    } else if (effortExceeds(resolvedEffort, reasoning.maxEffortWhenThinkingDisabled)) {
      // Clamp rather than drop: the server rejects the pair outright, and
      // silently sending no effort would change the answer's depth without
      // telling anyone.
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
