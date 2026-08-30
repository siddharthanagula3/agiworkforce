/**
 * The capability envelope an Auto selection can actually guarantee.
 *
 * WHY THIS EXISTS
 * ---------------
 * A model picker showing "Auto" has to say something about what Auto can do —
 * whether it takes images, whether it calls tools, how much context it holds.
 * Auto is not one model, so that answer has to come from somewhere.
 *
 * It used to come from `resolveAutoModeModel` in `@agiworkforce/types`: a
 * second, simplified re-implementation of the routing walk that returned ONE
 * representative model, called with a HARD-CODED tier and a hard-coded
 * `'general'` task. Two problems followed from that.
 *
 *   1. It was a parallel routing implementation. It skipped every admission
 *      check `resolveAutoRoute` performs — no trust mode, no runtime profile,
 *      no lifecycle or availability check, no harness allow-list, no capability
 *      or context floor, no continuity, no affordability. So the model it named
 *      and the model that would actually be dispatched could differ.
 *   2. It answered with ONE model's capabilities. Auto reaches different models
 *      for different tasks, so a single representative can only ever be right by
 *      coincidence. Today the flags happen to agree across every reachable
 *      route; adding one Auto-reachable model without vision would silently make
 *      the picker lie, and nothing would catch it.
 *
 * WHAT THIS DOES INSTEAD
 * ----------------------
 * Ask the canonical resolver, for every task type Auto can classify into, which
 * model it would actually select for this exact tier and runtime — then report
 * the INTERSECTION of what those models support.
 *
 * Intersection is the only honest answer. The picker is a promise about a
 * request that has not been classified yet, so it may only advertise what holds
 * on EVERY branch the request might take. `contextWindow` takes the minimum for
 * the same reason: it is the bound a caller can rely on without knowing which
 * route they will get.
 *
 * There is no second routing implementation here. This module calls
 * `resolveAutoRoute` and reads the result; admission stays exactly where it is.
 *
 * @module routing/auto-capability-envelope
 * @packageDocumentation
 */

import { getModelMetadataById, type RoutingTaskType } from '@agiworkforce/types';

import { resolveAutoRoute, type RoutingTrustMode } from './auto';

/**
 * Every task type the classifier can produce, and therefore every branch an
 * unclassified Auto request might take.
 *
 * Kept explicit rather than derived from the registry so that a task type added
 * to the policy without a considered picker story fails a test rather than
 * silently widening what Auto claims to support.
 */
const AUTO_REACHABLE_TASK_TYPES: readonly RoutingTaskType[] = [
  'simple_chat',
  'general',
  'coding',
  'reasoning',
  'creative_writing',
  'multimodal',
  'long_context',
  'research',
  'agentic',
  'computer-use',
  'image_generation',
];

export interface AutoCapabilityEnvelope {
  /** Smallest context window across every model Auto could select. */
  contextWindow: number;
  /** True only if EVERY reachable model accepts image input. */
  supportsVision: boolean;
  /** True only if EVERY reachable model supports function calling. */
  supportsTools: boolean;
  /** True only if EVERY reachable model supports extended thinking. */
  supportsThinking: boolean;
  /**
   * The distinct models this envelope was computed over, in task order.
   * Exposed for diagnostics and tests — a caller that renders this is showing
   * the user the real routing surface rather than a stand-in.
   */
  reachableModelKeys: readonly string[];
}

export interface AutoCapabilityEnvelopeRequest {
  /** The Auto alias being described, e.g. `'auto'`. */
  selection: string;
  /** The caller's real subscription tier — never a hard-coded stand-in. */
  subscriptionTier?: string | null;
  trustMode: RoutingTrustMode;
  /** Runtime profile of the surface asking, e.g. `'web/cloud-chat'`. */
  runtimeProfileId?: string;
}

/**
 * Media routes are excluded from a chat surface's envelope.
 *
 * `image_generation` is a real Auto task type, but a route that lands on a media
 * harness is not dispatchable through chat at all: the chat pipeline rejects it
 * with `model_route_requires_media_dispatch` and sends the caller to the media
 * endpoint instead (see the `/media` harness check in the web request
 * processor). Counting such a route would mean intersecting a chat picker's
 * promise with an image model that supports neither tools nor extended
 * thinking, and reporting `supportsTools: false` for a surface on which every
 * dispatchable route supports tools.
 *
 * This is not a convenience exclusion. The envelope must describe the routes the
 * CALLING surface can actually dispatch, and a chat surface cannot dispatch
 * these. A future media picker wanting its own envelope should ask for the media
 * task types explicitly rather than reusing this one.
 */
function isMediaHarness(harnessId: string): boolean {
  return harnessId.endsWith('/media');
}

/**
 * Resolve what an Auto selection can guarantee for this caller.
 *
 * Returns `null` when Auto cannot resolve to anything at all for the given
 * tier and runtime — an unroutable Auto has no capabilities to advertise, and a
 * caller must render that as unavailable rather than as a capability-less model.
 */
export function getAutoCapabilityEnvelope(
  request: AutoCapabilityEnvelopeRequest,
): AutoCapabilityEnvelope | null {
  const reachable: string[] = [];

  for (const taskType of AUTO_REACHABLE_TASK_TYPES) {
    const decision = resolveAutoRoute({
      selection: request.selection,
      taskType,
      subscriptionTier: request.subscriptionTier ?? null,
      trustMode: request.trustMode,
      ...(request.runtimeProfileId ? { runtimeProfileId: request.runtimeProfileId } : {}),
      // The picker describes a fresh request: no prior model, so continuity must
      // not pin the answer to whatever was used last.
      currentModelKey: null,
      // The task-family stage only ever permutes the candidate set, so it cannot
      // change WHICH models are reachable — only their order. Disabled here so
      // the envelope does not depend on an operator flag.
      enableTaskFamilyStage: false,
    });
    if (decision.status !== 'selected') continue;
    if (isMediaHarness(decision.harnessId)) continue;
    if (!reachable.includes(decision.modelKey)) reachable.push(decision.modelKey);
  }

  if (reachable.length === 0) return null;

  let contextWindow = Number.POSITIVE_INFINITY;
  let supportsVision = true;
  let supportsTools = true;
  let supportsThinking = true;

  for (const modelKey of reachable) {
    const metadata = getModelMetadataById(modelKey);
    // A model the catalog cannot describe cannot be vouched for. Fail closed on
    // every flag rather than letting an unknown widen the promise.
    if (!metadata) return null;

    const limit = metadata.contextWindow;
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      contextWindow = Math.min(contextWindow, limit);
    } else {
      return null;
    }

    supportsVision &&= metadata.capabilities.vision === true;
    supportsTools &&= metadata.capabilities.tools === true;
    supportsThinking &&= metadata.capabilities.thinking === true;
  }

  return {
    contextWindow,
    supportsVision,
    supportsTools,
    supportsThinking,
    reachableModelKeys: reachable,
  };
}
